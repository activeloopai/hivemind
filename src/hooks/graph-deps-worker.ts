#!/usr/bin/env node

/**
 * Detached background worker that provisions the code-graph tree-sitter
 * parsers into the shared embed-deps dir (see src/cli/graph-deps.ts).
 *
 * Why a dedicated detached worker (NOT an inline call in the SessionStart
 * setup hook): a cold provision runs `npm install` plus a from-source native
 * compile, which on a slow / arm64 box can take MINUTES. The SessionStart
 * setup hooks run under the harness's ~120s async timeout — a synchronous
 * inline install would blow that cap and get the hook killed mid-install,
 * leaving a half-written tree. Spawning this worker detached + unref'd lets
 * the hook return immediately while the install runs to completion in the
 * background; the mkdir lockdir inside ensureGraphDeps serializes concurrent
 * workers, and the ready marker makes the next session's fast path a no-op.
 *
 * Best-effort + self-contained: ensureGraphDeps swallows every failure
 * internally (logs to the debug channel, records a backoff attempt) and never
 * throws to us. The worker writes nothing to stdout/stderr — it's detached and
 * any output would go nowhere useful.
 *
 * The CLI paths (`hivemind graph init`, `installEmbeddings`) still call
 * ensureGraphDeps() inline: those run in the foreground where blocking is fine
 * and expected.
 */

import { ensureGraphDeps } from "../cli/graph-deps.js";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("graph-deps-worker", msg);

try {
  ensureGraphDeps({ logFn: log, warnFn: log });
} catch (e: any) {
  // ensureGraphDeps is best-effort and shouldn't throw, but never let a
  // stray error escape to a non-zero exit — the worker is fire-and-forget.
  log(`fatal: ${e?.message ?? e}`);
}
process.exit(0);
