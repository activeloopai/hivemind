/**
 * Local BM25 index over teammates' session summaries (pure).
 *
 * Built by the background sync worker from the cached summary rows and
 * persisted as one JSON file, so the latency-critical hooks only parse it
 * and score — no tokenizing of the corpus on the hot path, and no backend
 * round-trip at all. Works on every summary row, including legacy rows that
 * never got an embedding: only text columns are used.
 *
 * Relevance is judged by three numbers besides the BM25 rank:
 *   - matched  — distinct query terms the summary contains
 *   - coverage — idf-weighted share of the query's terms it contains
 *   - phrases  — adjacent word pairs shared with the query (checked on the
 *                top candidates only, against the stored body text)
 * BM25 scores are unbounded and corpus-dependent, so the injection gate is
 * expressed in these two bounded quantities instead (see recall-policy.ts).
 */

import { bigrams, isAnchor, tokenize, uniqueTerms } from "./tokenize.js";

export const INDEX_VERSION = 2;

const K1 = 1.2;
const B = 0.75;

/** One cached summary, as the sync worker stores it. */
export interface RecallDoc {
  path: string;
  author: string;
  project: string;
  description: string;
  /** Condensed summary markdown (fact sections only) — indexed + excerpted. */
  body: string;
  lastUpdate: string;
}

export interface IndexedDoc {
  p: string; // path
  a: string; // author
  pr: string; // project
  d: string; // description
  b: string; // condensed body (for the excerpt)
  u: string; // last update
  n: number; // token length
}

export interface RecallIndex {
  v: number;
  builtAt: string;
  avgdl: number;
  docs: IndexedDoc[];
  /** term → flat [docIdx, tf, docIdx, tf, ...] */
  post: Record<string, number[]>;
}

export function buildIndex(docs: readonly RecallDoc[], now: Date = new Date()): RecallIndex {
  const out: IndexedDoc[] = [];
  const post: Record<string, number[]> = Object.create(null);
  let total = 0;
  docs.forEach((doc, i) => {
    const toks = tokenize(`${doc.description}\n${doc.project}\n${doc.body}`);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, n] of tf) (post[t] ??= []).push(i, n);
    total += toks.length;
    out.push({
      p: doc.path, a: doc.author, pr: doc.project, d: doc.description,
      b: doc.body, u: doc.lastUpdate, n: toks.length,
    });
  });
  return {
    v: INDEX_VERSION,
    builtAt: now.toISOString(),
    avgdl: out.length ? total / out.length : 0,
    docs: out,
    post,
  };
}

export interface SearchOptions {
  /** Max candidates returned (after ranking). */
  limit?: number;
  /** Boost docs whose `project` equals this (cwd basename). */
  project?: string;
  /** Paths to drop (already injected this session, own summary, ...). */
  exclude?: ReadonlySet<string>;
  /** Authors to drop (the current user). */
  excludeAuthor?: string;
  /** Epoch ms for the recency factor (injected for tests). */
  now?: number;
  /** Max query terms to score — the rarest are kept. */
  maxTerms?: number;
}

export interface SearchHit {
  doc: IndexedDoc;
  score: number;
  matched: number;
  coverage: number;
  /** Document-frequency share of the rarest matched term (0..1, low = rare). */
  rarestDf: number;
  /** Adjacent word pairs shared with the query. */
  phrases: number;
  /** The query names a port / error code and this summary has none of them. */
  anchorMiss: boolean;
  terms: string[];
}

/** Candidates (by BM25) that get the phrase check before the final cut. */
const RERANK_POOL = 30;
/** Score multiplier per shared phrase, capped. */
const PHRASE_BOOST = 0.5;
const PHRASE_BOOST_MAX = 3;

const PROJECT_BOOST = 1.3;
const RECENCY_HALF_LIFE_DAYS = 180;

function idf(N: number, df: number): number {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

export function search(index: RecallIndex, query: string | readonly string[], opts: SearchOptions = {}): SearchHit[] {
  const N = index.docs.length;
  if (!N) return [];
  let all = typeof query === "string" ? uniqueTerms(query) : [...new Set(query)];
  // Keep the rarest terms: they carry the signal, common ones only add noise.
  // Terms the corpus has never seen sort first (df 0) and stay in the
  // coverage denominator — a query whose distinctive words no teammate ever
  // wrote down must not look like a full match on its few generic ones.
  const df = (t: string) => (index.post[t]?.length ?? 0) / 2;
  all.sort((a, b) => df(a) - df(b));
  if (opts.maxTerms && all.length > opts.maxTerms) all = all.slice(0, opts.maxTerms);
  const terms = all.filter((t) => index.post[t]);
  if (!terms.length) return [];

  const totalIdf = all.reduce((s, t) => s + idf(N, df(t)), 0);
  const anchors = all.filter(isAnchor);
  const acc = new Map<number, { score: number; idf: number; terms: string[]; rarest: number }>();
  for (const t of terms) {
    const w = idf(N, df(t));
    const p = index.post[t];
    for (let j = 0; j < p.length; j += 2) {
      const i = p[j];
      const tf = p[j + 1];
      const len = index.docs[i].n || 1;
      const s = w * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * len / (index.avgdl || 1)));
      const a = acc.get(i) ?? { score: 0, idf: 0, terms: [], rarest: 1 };
      a.score += s;
      a.idf += w;
      a.terms.push(t);
      a.rarest = Math.min(a.rarest, df(t) / N);
      acc.set(i, a);
    }
  }

  const now = opts.now ?? Date.now();
  const hits: SearchHit[] = [];
  for (const [i, a] of acc) {
    const doc = index.docs[i];
    if (opts.exclude?.has(doc.p)) continue;
    if (opts.excludeAuthor && doc.a === opts.excludeAuthor) continue;
    const coverage = totalIdf ? a.idf / totalIdf : 0;
    // Weight by coverage: a summary that contains MOST of the query beats a
    // longer one that repeats a few of its words many times.
    let score = a.score * coverage;
    if (opts.project && doc.pr === opts.project) score *= PROJECT_BOOST;
    const t = Date.parse(doc.u);
    if (!Number.isNaN(t)) {
      const ageDays = Math.max(0, (now - t) / 86_400_000);
      score *= 1 / (1 + ageDays / RECENCY_HALF_LIFE_DAYS);
    }
    hits.push({
      doc, score, matched: a.terms.length,
      coverage, rarestDf: a.rarest, phrases: 0, terms: a.terms,
      anchorMiss: anchors.length > 0 && !anchors.some((t) => a.terms.includes(t)),
    });
  }
  const order = (x: SearchHit, y: SearchHit) =>
    y.score - x.score || y.doc.u.localeCompare(x.doc.u) || x.doc.p.localeCompare(y.doc.p);
  hits.sort(order);

  const qPairs = bigrams(typeof query === "string" ? query : query.join(" "));
  const pool = hits.slice(0, RERANK_POOL);
  if (qPairs.size) {
    for (const h of pool) {
      const dPairs = bigrams(`${h.doc.d}\n${h.doc.b}`);
      for (const p of qPairs) if (dPairs.has(p)) h.phrases++;
      h.score *= 1 + PHRASE_BOOST * Math.min(h.phrases, PHRASE_BOOST_MAX);
    }
    pool.sort(order);
  }
  return pool.slice(0, opts.limit ?? 5);
}
