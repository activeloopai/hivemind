# Parallel Sub-Agent Contract

When wiki-worker-bee runs in parallel against different chunks (multiple driver invocations during a Document or Update pass), each invocation is a SUB-AGENT with respect to global knowledge-area state. The orchestrator (Hivemind's graph driver, `src/graph/`) is the only writer of global state files. This contract is non-negotiable.

## Do NOT

- Modify the knowledge area's `index.md` - the graph driver updates it after all parallel agents finish.
- Modify any `<type>/_index.md` (`entities/_index.md`, `concepts/_index.md`, `comparisons/_index.md`, `questions/_index.md`, plus the ADR index under `library/knowledge/private/architecture/`) - same reason.
- Modify the knowledge area's `log.md` - append-at-TOP operation log; the driver writes after consolidating responses from all parallel agents.
- Modify the knowledge area's `hot.md` - recency cache rewritten by the driver at end of pass.
- Modify `library/knowledge/private/<domain>/` narrative prose - owned by `library-worker-bee`, not wiki-worker-bee.
- Modify `.hivemind/file-hashes.json` - the driver's hash manifest, the delta-tracking key.
- Modify any file under `.hivemind/` - driver state.
- Modify any source code file in the repo - wiki-worker-bee is read-only against the codebase.
- Create duplicate pages - check `prior_state` in the invocation payload before creating; update existing if found.
- Run `git` commands directly in the canonical path - `git_context` is pre-computed by the graph driver and provided in the payload. (Direct `@`-mention path may shell out to `git` if the driver is unavailable.)

## DO

- Write per-page content under the codebase-graph knowledge area `{entities,concepts,comparisons,questions}/` (and ADRs under `library/knowledge/private/architecture/`).
- Append to (or create) the knowledge area's `meta/<YYYY-MM-DD>-contradiction-report.md` when Phase 6 detects contradictions.
- Write the knowledge area's `meta/<YYYY-MM-DD>-lint-report.md` ONLY when invoked in lint mode (and per guide 09, the agent emits findings; the driver writes the report).
- Emit the structured response payload (see [`guides/10-response-payload.md`](../guides/10-response-payload.md)) so the driver can reconcile.
- Always include `pages_created`, `pages_updated`, `decisions_filed`, `contradictions_flagged`, `meta_reports_written`, `notification_flags`, `entities_detected`, `gaps`, `lint_findings`, and (for direct `@`-mention) `partial_scan: true` in the response.

## Why

When parallel sub-agents update global state files, you get race conditions, drift, and lost writes. The post-pass reconciliation pattern keeps writes deterministic and atomic - even when N agents run concurrently. It is the same discipline `src/graph/` uses: per-file extractors emit isolated `FileExtraction` output, and `src/graph/snapshot.ts` aggregates, sorts, and hashes the whole graph in one serial pass (`snapshot_sha256`), so concurrent extraction never corrupts the canonical snapshot.

## Source

The do-NOT list mirrors how `src/graph/` separates per-file extraction from the single serial snapshot build (`src/graph/snapshot.ts`) and push (`src/graph/deeplake-push.ts`).
