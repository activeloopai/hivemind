/**
 * One local team-recall lookup: load the cached index, rank teammates'
 * summaries against the query, apply the relevance gate, format the
 * injection. Synchronous and backend-free — the hooks call this on the hot
 * path, the `hivemind recall search` CLI calls it for debugging / eval.
 */

import type { Config } from "../config.js";
import { cacheDir, loadIndex } from "./cache.js";
import { search, type RecallIndex, type SearchHit } from "./lexical-index.js";
import { passesGate, thresholds, type RecallTrigger } from "./policy.js";
import { formatRecallContext } from "../hooks/shared/recall-format.js";
import { projectNameFromCwd } from "../utils/project-name.js";

export type LookupResult =
  | { kind: "no-index" }
  | { kind: "none" }
  | { kind: "below"; best: SearchHit; reason: string }
  | { kind: "unattributable"; best: SearchHit }
  | { kind: "hit"; best: SearchHit; context: string };

export interface LookupInput {
  trigger: RecallTrigger;
  query: string | readonly string[];
  config: Pick<Config, "orgId" | "workspaceId" | "tableName" | "userName" | "memoryPath">;
  cwd?: string;
  /** Summary paths already injected this session. */
  exclude?: ReadonlySet<string>;
  now?: number;
  cacheRoot?: string;
  /** Pre-loaded index (CLI / tests); otherwise read from the cache dir. */
  index?: RecallIndex | null;
}

/** Max query terms scored per trigger — prompts are long and chatty. */
const MAX_TERMS = { failure: 32, prompt: 24 } as const;

export function lookupTeamRecall(input: LookupInput): LookupResult {
  const { config, trigger } = input;
  const index = input.index !== undefined
    ? input.index
    : loadIndex(cacheDir({ orgId: config.orgId, workspaceId: config.workspaceId, table: config.tableName }, input.cacheRoot));
  if (!index || !index.docs.length) return { kind: "no-index" };

  const now = input.now ?? Date.now();
  const hits = search(index, input.query, {
    limit: 3,
    project: input.cwd ? projectNameFromCwd(input.cwd) : undefined,
    exclude: input.exclude,
    excludeAuthor: config.userName,
    now,
    maxTerms: MAX_TERMS[trigger],
  });
  if (!hits.length) return { kind: "none" };

  // The top-ranked candidate can miss the bar (e.g. long but loosely related)
  // while the next one clears it — take the first that passes.
  const th = thresholds(trigger);
  const best = hits.find((h) => passesGate(h, th).pass);
  if (!best) {
    const gate = passesGate(hits[0], th);
    return { kind: "below", best: hits[0], reason: gate.pass ? "" : gate.reason };
  }

  const context = formatRecallContext({
    hit: {
      path: best.doc.p,
      author: best.doc.a,
      project: best.doc.pr,
      summary: best.doc.b,
      description: best.doc.d,
      lastUpdate: best.doc.u,
      score: best.score,
      mode: "lexical",
    },
    currentUser: config.userName,
    memoryRoot: config.memoryPath,
    now,
    trigger,
  });
  if (!context) return { kind: "unattributable", best };
  return { kind: "hit", best, context };
}
