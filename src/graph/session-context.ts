/**
 * SessionStart inject for the local code graph (Phase 3 v1.1).
 *
 * Goal: surface the graph to Claude on every SessionStart so it knows the
 * snapshot exists and can read it directly for code-relationship questions
 * ("what calls X?", "what imports Y?") instead of grepping the source tree.
 *
 * Hot-path constraint: SessionStart inject runs on EVERY session start. We
 * cannot afford to parse the ~1 MB snapshot JSON here. Instead we read the
 * small `.last-build.json` file (single small read, fields already populated
 * by writeSnapshot).
 *
 * Real cost: low-single-digit milliseconds, NOT sub-millisecond. The
 * dominant term is deriveProjectKey() which shells out to `git config --get
 * remote.origin.url`; the .last-build.json read itself is sub-ms. The git
 * call is already paid by the graph-on-stop hook on the same SessionStart,
 * so the marginal cost here is negligible.
 *
 * Tampered-file defence: `commit_sha` and `snapshot_sha256` are validated
 * as hex by readLastBuild (see src/graph/last-build.ts). Without that
 * validation, an attacker who writes a shape-valid .last-build.json with
 * embedded newlines into `commit_sha` could inject text directly into the
 * system prompt, or escape the snapshots/ dir via "../" in either hash.
 * Both vectors are closed at the parser, not here — but we still defensively
 * truncate when rendering.
 *
 * Honest scope hints in the inject text:
 *   - language scope (TypeScript / JavaScript / Python) — makes Claude not
 *     waste a Read on e.g. Rust/Go expecting to find them in the graph.
 *   - "AST-based" — call/import/reference edges; NOT semantic similarity.
 *     The semantic layer is a deliberate v1.2 follow-up.
 *   - "may be stale" — the graph is rebuilt at most once per
 *     HIVEMIND_GRAPH_TICK_INTERVAL_MS (default 10 min) so it can lag
 *     uncommitted in-flight edits. The age line lets Claude judge.
 *
 * Returns null when:
 *   - no graph has ever been built for this repo
 *   - the cwd isn't a recognizable project (deriveProjectKey fallback)
 *   - the last-build file is missing/corrupt
 * — in all these cases SessionStart simply skips the inject.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { readLastBuild } from "./last-build.js";
import { repoDir } from "./snapshot.js";
import { deriveProjectKey } from "../utils/repo-identity.js";

/**
 * Mirror of workTreeIdFor in src/commands/graph.ts. Each consumer of the
 * per-worktree singletons computes worktreeId from its own cwd.
 */
function workTreeIdFor(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

export interface GraphContextDeps {
  /** Override for tests; defaults to Date.now(). */
  now?: () => number;
}

/**
 * Compose the SessionStart inject line for the local graph, or null when
 * there's no graph to surface. Never throws — all errors return null so a
 * broken graph state cannot block SessionStart.
 */
export function graphContextLine(cwd: string, deps: GraphContextDeps = {}): string | null {
  let key: string;
  let snapshotsDir: string;
  let baseDir: string;
  try {
    key = deriveProjectKey(cwd).key;
    baseDir = repoDir(key);
    snapshotsDir = join(baseDir, "snapshots");
  } catch {
    return null;
  }

  // No snapshots directory → never built. Cheaper than readLastBuild's
  // file-open dance for the common "first session in a fresh repo" case.
  if (!existsSync(snapshotsDir)) return null;

  // Per-worktree read: each checkout has its own .last-build.json under
  // baseDir/worktrees/<id>/. Without this, the inject would show a
  // sibling worktree's commit/sha and the model would read the WRONG
  // snapshot file thinking it's the one for our HEAD.
  const last = readLastBuild(baseDir, workTreeIdFor(cwd));
  if (last === null) return null;

  // Prompt-injection / path-traversal defence. commit_sha and snapshot_sha256
  // are interpolated into both the system-prompt text and into the displayed
  // filesystem path. A tampered .last-build.json with a shape-valid but
  // content-invalid hash could embed newlines into the prompt or "../" into
  // the path. Reject the inject (silently drop — caller falls back to no
  // graph hint) rather than render attacker-controlled bytes. The canonical
  // writer in snapshot.ts always emits 40-char + 64-char hex, so legitimate
  // files always pass.
  if (last.commit_sha !== null && !/^[0-9a-f]{4,64}$/.test(last.commit_sha)) return null;
  if (!/^[0-9a-f]{64}$/.test(last.snapshot_sha256)) return null;

  const now = (deps.now ?? Date.now)();
  const ageMs = Math.max(0, now - last.ts);

  // Compose the metadata line. Counts are optional (older builds didn't
  // record them); render "?" rather than fabricating a number.
  const nodesStr = last.node_count !== undefined ? String(last.node_count) : "?";
  const edgesStr = last.edge_count !== undefined ? String(last.edge_count) : "?";
  const commitStr = last.commit_sha !== null ? last.commit_sha.slice(0, 7) : "no-commit";
  const ageStr = formatAge(ageMs);
  const snapshotFile = last.commit_sha ?? last.snapshot_sha256;
  const snapshotPath = join(snapshotsDir, `${snapshotFile}.json`);

  // Staleness escalation. The original phrasing ("may lag by up to the
  // auto-rebuild interval") was misleading — auto-rebuilds can fail or be
  // disabled and the age can grow to days. Surface the risk in proportion
  // to the age so the model under-trusts old data:
  //   < 1 hour:  no special warning beyond the age line
  //   1h .. 1d:  "may be out of date — verify if you've edited recently"
  //   > 1 day:   "STALE — likely out of date; prefer reading current source"
  const STALE_WARN_MS = 60 * 60 * 1000;       // 1 hour
  const STALE_HARD_MS = 24 * 60 * 60 * 1000;  // 1 day
  let staleness: string;
  if (ageMs >= STALE_HARD_MS) {
    staleness =
      "  ⚠️ STALE: this snapshot is over a day old; the auto-rebuild may have stopped.\n" +
      "     Prefer reading current source for any file you suspect has changed.";
  } else if (ageMs >= STALE_WARN_MS) {
    staleness =
      "  ⚠️ Possibly out of date (> 1h since last build). For any file you've edited\n" +
      "     in this session, fall back to reading the live source instead of the graph.";
  } else {
    staleness =
      "  Freshness: auto-rebuilds run on Stop/SessionEnd; if a file's mtime is newer\n" +
      "  than the build timestamp above, prefer reading the live source for that file.";
  }

  return [
    "",
    "LOCAL CODE GRAPH (TypeScript / JavaScript / Python, AST-based):",
    `  ${nodesStr} nodes, ${edgesStr} edges (commit ${commitStr}, built ${ageStr} ago)`,
    "",
    "  Use it as a fast INDEX to locate the few files/symbols that matter, then",
    "  open them with Read to answer. It is NOT a substitute for the source: it",
    "  omits instance-method calls (obj.method()), nested/inner functions, and",
    "  dynamic dispatch — so confirm every claim against the file before stating it.",
    "",
    "  Query via the Deeplake mount (intercepted — use `cat`, not `ls`):",
    "    cat ~/.deeplake/memory/graph/query/<pattern>   ← start here",
    "        search + 1-hop expand (callers, callees, imports). AND: query/<a>+<b>.",
    "    cat ~/.deeplake/memory/graph/find/<pattern>     substring search → handles",
    "    cat ~/.deeplake/memory/graph/show/<handle-or-pattern>   node + 1-hop neighbors",
    "    cat ~/.deeplake/memory/graph/neighborhood/<file>        symbols + cross-file links",
    "    Also: index.md · layers · tour · path/<from>/<to>",
    "",
    "  PER-FILE DOCS (natural-language, kept fresh on commits — if generated):",
    "    cat ~/.deeplake/memory/docs/find/<query>   semantic + keyword search over the",
    "        docs — use for \"where is X handled / how does Y work\"; returns ranked files.",
    "    cat ~/.deeplake/memory/docs/<path>.md       the doc for one source file.",
    "    Empty result just means no docs match (or none generated yet) — fall back to graph.",
    "",
    "  Then READ the files the graph points you to — don't answer from the graph",
    "  alone. Cross-file calls/imports resolved for named imports across TS/JS/Python;",
    "  bare (npm)/aliased/barrel/dynamic + instance-method dispatch stay unresolved.",
    `  Raw snapshot (fallback): ${snapshotPath}`,
    staleness,
  ].join("\n");
}

/**
 * Human-friendly age rendering: "12s", "3m", "2h", "4d". Always one unit,
 * truncated (not rounded) so "1m 59s" reports as "1m" — better to under-report
 * freshness than over-report it.
 */
function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
