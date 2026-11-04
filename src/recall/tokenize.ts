/**
 * Tokenizer for local proactive recall (pure).
 *
 * Shared by the index build (summaries) and the query side (error text /
 * prompts) so both sides always agree on what a "term" is. Tuned for
 * engineering text: identifiers are kept whole AND split into their
 * camelCase / snake_case parts, so `ECONNREFUSED`, `TypeError` and
 * `ensure_lookup_index` match both their exact form and their pieces.
 *
 * Deliberately dropped: pure numbers, hex hashes, very short tokens and a
 * small stopword list — they carry no recall signal and would only inflate
 * coincidental overlap between unrelated sessions.
 */

const STOPWORDS = new Set([
  "a", "an", "and", "or", "but", "if", "then", "else", "the", "to", "of", "in", "on", "at", "by",
  "for", "from", "with", "without", "as", "is", "are", "was", "were", "be", "been", "being", "it",
  "its", "this", "that", "these", "those", "there", "here", "we", "you", "your", "our", "they",
  "them", "he", "she", "his", "her", "i", "me", "my", "do", "does", "did", "done", "doing", "have",
  "has", "had", "not", "no", "yes", "so", "can", "could", "would", "should", "will", "shall", "may",
  "might", "must", "about", "into", "over", "under", "after", "before", "again", "also", "just",
  "only", "very", "more", "most", "some", "any", "all", "each", "other", "such", "than", "too",
  "what", "which", "who", "whom", "when", "where", "why", "how", "up", "down", "out", "off",
  "now", "new", "use", "used", "using", "via", "per", "etc", "e", "g", "ie", "eg", "vs",
  "please", "let", "lets", "like", "get", "got", "make", "made", "see", "need", "want", "one",
  "two", "way", "thing", "things", "something", "anything", "still", "same", "file", "line",
]);

/** Tokens longer than this are almost always blobs (base64, minified code). */
const MAX_TOKEN_LEN = 40;

const RAW_WORD_RE = /[A-Za-z0-9_]+/g;
const HEX_RE = /^[0-9a-f]{7,}$/i;
const DIGITS_RE = /^\d+$/;

/** Light plural folding: "errors" → "error", but keep "class", "status", "ss". */
function fold(t: string): string {
  if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is")) {
    return t.slice(0, -1);
  }
  return t;
}

function keep(t: string): boolean {
  if (t.length < 2 || t.length > MAX_TOKEN_LEN) return false;
  if (DIGITS_RE.test(t)) return false;
  if (HEX_RE.test(t) && /\d/.test(t)) return false;
  return !STOPWORDS.has(t);
}

/** Split an identifier on `_` and camelCase / ACRONYMWord boundaries. */
function subParts(word: string): string[] {
  return word
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean);
}

// host:port (IPv4, localhost, IPv6 in brackets or ::1) and "port 5432".
const HOST_PORT_RE = /(?:\b(?:\d{1,3}\.){3}\d{1,3}|\blocalhost|\[[0-9a-f:]+\]|(?<![\w:])::1)(?::(\d{2,5}))\b|\bport\s+(\d{2,5})\b/gi;

/**
 * Rewrite ports to a single word ("127.0.0.1:5432" → "port5432") so they
 * survive number stripping on both sides. The port is what tells a Postgres
 * ECONNREFUSED (5432) from a Redis one (6379); the host part varies per
 * machine and is dropped.
 */
export function markPorts(text: string): string {
  return (text || "").replace(HOST_PORT_RE, (_m, a, b) => ` port${a ?? b} `);
}

/**
 * "Anchor" terms: specific identifiers that make two errors different even
 * when every other word matches — ports (port5432) and error codes (ts2345,
 * e0382, 42p01, ora00942). When a query has anchors, a hit must share one.
 */
const ANCHOR_RE = /^(port\d{2,5}|[a-z]{1,4}\d{3,5}|\d{2}[a-z]\d{2})$/;

export function isAnchor(term: string): boolean {
  return ANCHOR_RE.test(term);
}

/**
 * Tokenize `text` into recall terms (duplicates preserved — callers that need
 * term frequency count them; callers that need a set dedupe).
 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of markPorts(text).match(RAW_WORD_RE) ?? []) {
    const whole = fold(raw.toLowerCase());
    if (keep(whole)) out.push(whole);
    const parts = subParts(raw);
    if (parts.length < 2) continue;
    for (const p of parts) {
      const t = fold(p.toLowerCase());
      if (t !== whole && t.length >= 3 && keep(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Adjacent pairs of whole tokens ("oid found" for "table with oid 42 not
 * found"), per line, after stopword / number removal — so the same error
 * phrase yields the same pairs whatever ids or filler words it carries.
 * Used to rerank candidates: shared pairs are a much stronger signal than
 * shared words.
 */
export function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of markPorts(text).split(/\n|(?<=[.;!?])\s+/)) {
    let prev = "";
    for (const raw of line.match(RAW_WORD_RE) ?? []) {
      const t = fold(raw.toLowerCase());
      if (!keep(t)) continue;
      if (prev && prev !== t) out.add(`${prev} ${t}`);
      prev = t;
    }
  }
  return out;
}

/** Distinct terms of `text`, in first-seen order. */
export function uniqueTerms(text: string): string[] {
  return [...new Set(tokenize(text))];
}
