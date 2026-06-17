# QA Report: Repo Sweep C5 - Graph (`src/graph/`)

**Plan document:** Repo-sweep chunk C5 task spec (quality pass over `src/graph/`, 34 `.ts` files)
**Audit date:** 2026-06-16
**Base branch:** `main`
**Head:** `pr/05-security-quality-repo-sweep` (after C5 security pass)
**Auditor:** quality-worker-bee

## Summary

Pass with one fix applied. The `src/graph/` subsystem is mature, exhaustively commented, and `tsc --noEmit` is clean both before and after the audit. Determinism, atomic writes, best-effort error handling, and partial-resolution honesty are consistently engineered across the extractor, snapshot, resolver, render, and VFS layers. One Warning-level correctness gap was found and fixed directly: the Python extractor's local `pushNode` was the **only** one of the nine language extractors that did not deduplicate by node `id`, so property getter/setter pairs, `@overload` stubs, and module-level reassignments emitted duplicate node ids, violating the documented `GraphNode.id` uniqueness invariant that the TypeScript extractor's own copy explicitly guards against. No Critical issues. The C5 security pass (the `vfs-handler.ts` hex-shape guard) is intact and verified consistent with the sibling guards in `session-context.ts` and `diff.ts`.

## Scorecard

| Category      | Status | Notes |
|---------------|--------|-------|
| Completeness  | ✅ | All 34 in-scope files read in full; every C5 focus area reviewed. |
| Correctness   | ⚠️→✅ | One node-id uniqueness violation in the Python extractor fixed; all other extractors, the resolver, and renderers are correct. |
| Alignment     | ✅ | Naming/structure consistent; security-pass hex guard intact and matches the sibling pattern. |
| Gaps          | ✅ | No missing error handling; degradation paths return best-effort `no-graph`/`null` everywhere. |
| Detrimental   | ✅ | No regressions, no perf anti-patterns on hot paths, no leftover debug or dead code (one dead ternary noted as a Suggestion). |

## Critical Issues (must fix)

None.

## Warnings (should fix) - FIXED in this pass

- [x] **Python extractor does not deduplicate nodes by id; duplicate node ids leak into the snapshot**, `src/graph/extract/python.ts:384-391` (pre-fix `pushNode`)

  The shared helper (`extract/shared.ts:116-130`) and the TypeScript extractor's own copy (`extract/typescript.ts:704-728`) both skip a node whose `id` already exists in `result.nodes`, with the TS copy citing the explicit reason: "NetworkX-style consumers REQUIRE node id uniqueness within a snapshot." Python's local `pushNode` did an **unconditional** `result.nodes.push(node)`. Python readily produces same-id declarations within one file: a property getter/setter pair (`@property def x` + `@x.setter def x`) both emit `<file>:Class.x:method`; a `@overload`-decorated stub plus its implementation; or a module-level reassignment (`x = 1` ... `x = foo()`) emitting two `<file>:x:const` nodes. Each produced a duplicate node id in the aggregated snapshot, breaking the `GraphNode.id` contract ("Globally unique within this snapshot", `types.ts:93`) and the NetworkX node-link consumers the cloud `codebase` table feeds. Within this repo's own renderers the damage degraded quietly (`.find()` first-wins, `find/` listing the same id twice), so it is a Warning rather than a Critical, but it is the same class of defect the TS extractor already treated as P1.

  Fix: routed Python's `pushNode` through the same dedup-by-id guard as the shared/TS extractors, skipping the duplicate push while still registering the `declByName` lookup key (first wins). `tsc --noEmit` clean post-fix; the change is behavior-preserving for all non-duplicate declarations.

  ```ts
  if (result.nodes.some((n) => n.id === node.id)) {
    if (!declByName.has(key)) declByName.set(key, node);
    return;
  }
  result.nodes.push(node);
  ```

## Suggestions (consider improving)

- [ ] **`diff.ts` edge key is delimiter-less; theoretically collidable**, `src/graph/diff.ts:41-43`

  `edgeKey` is `` `${e.source}${e.target}${e.relation}${e.ord ?? 0}` `` with no separators, so two distinct edges could in principle hash to the same key (e.g. a `source`/`target` boundary that shifts by one character while the concatenation stays equal). A collision would make `diffSnapshots` miscount an edge as unchanged. Real node ids are structured (`<file>:<sym>:<kind>`), so a collision is astronomically unlikely in practice, and `snapshot.ts:102-110` (`compareEdges`) already sorts on the separate fields. Left as a Suggestion (no observed failure); a NUL or `\u0000` delimiter, matching the `resolve/cross-file.ts:86` dedup key, would close it for free.

- [ ] **`renderIndex` "Source:" line has a dead ternary and prints `null.json` for commitless builds**, `src/graph/vfs-handler.ts:245,270`

  `commit` is `snap.graph.commit_sha?.slice(0, 7) ?? "no-commit"`, so it is never falsy; the ternary `${commit ? snap.graph.commit_sha : "?"}` always selects `snap.graph.commit_sha`, which for a non-git (commitless) build is `null` and renders as `.../snapshots/null.json`. The actual on-disk file for that case is `<snapshot_sha256>.json` (see `snapshot.ts:208`), and snapshot loading itself uses the correct `last.commit_sha ?? last.snapshot_sha256` fallback (`vfs-handler.ts:189`), so this is a display-only inconsistency on the `index.md` hint line. Replacing the expression with the same `snap.graph.commit_sha ?? snap.observation... ` fallback (or reusing the computed `fileBase`) would make the hint match reality.

- [ ] **Three files independently re-implement the snapshot-id hex guard**, `src/graph/session-context.ts:100-101`, `src/graph/diff.ts:84`, `src/graph/vfs-handler.ts:197`

  This was already raised by the C5 security pass as a non-blocking follow-up. A shared `isValidSnapshotId()` in `src/graph/` would prevent a future `.last-build.json` reader from forgetting the guard. Noted here for traceability; not actioned to keep this audit's blast radius minimal.

## Plan Item Traceability

| #  | C5 focus area / DoD item | Status | Implementation Location | Notes |
|----|--------------------------|--------|-------------------------|-------|
| F1 | AST extraction: tree-sitter traversal, symbol dedup, edge construction | ⚠️→✅ | `extract/*.ts` | Traversal + edge construction correct across all 9 languages; chunked parse handles the 32 KB tree-sitter limit (`shared.ts:34-46`). Symbol dedup was the gap: Python's `pushNode` did not dedup by id; fixed. All other extractors use the shared/local deduping `pushNode`. |
| F2 | Graph build pipeline: incremental build, snapshot ser/deser | ✅ | `snapshot.ts`, `cache.ts`, `diff.ts` | Deterministic node/edge sort + canonical key-sorted JSON; SHA-256 over stable fields only (excludes `observation`) so identical code dedups across worktrees. Content-addressed cache with schema-version + per-item validation and path-rewrite on rename. Atomic tmp+rename throughout. |
| F3 | `build-lock.ts`: contention + stale-lock recovery | ✅ | `build-lock.ts:52-137` | Atomic `O_CREAT\|O_EXCL` acquire; stale recovery `unlink`s then re-attempts `wx` so only one recoverer wins; release is PID-owner-gated so an older build cannot unlink a newer lock. TOCTOU-safe (confirmed by the C5 security pass). |
| F4 | `vfs-handler.ts`: graph rendering into agent context | ✅ | `vfs-handler.ts` | Snapshot load validated (hex-id guard + `nodes`/`links` array shape) and renderer wrapped in try/catch returning best-effort `no-graph`. Dispatcher, find/query/show/impact/neighborhood/layers/tour/path all bounded and deterministic. One display-only `null.json` hint bug (Suggestion). |
| F5 | Error handling: graceful degradation when graph is missing/corrupt | ✅ | `vfs-handler.ts:164-226`, `last-build.ts`, `history.ts`, `deeplake-*.ts`, `spawn-pull-worker.ts` | Missing/corrupt state returns `null`/`no-graph`; all I/O is best-effort and never rolls back a snapshot; detached pull-worker spawn failures absorbed via async `error` listener; cloud pull validates payload + sha256 before writing. |
| F6 | TypeScript: unsafe casts (tree-sitter node types), missing return types | ✅ | `extract/shared.ts:37-59`, `grammar-shims.d.ts`, `extract/*.ts` | `as unknown as` casts are confined to the documented opaque tree-sitter `parse`/`setLanguage` seams; grammar packages typed via the `.d.ts` shim. All exported functions carry explicit return types. No `any` reaching the snapshot. |
| D1 | Read all in-scope files, run `tsc --noEmit` | ✅ | - | All 34 `src/graph/**/*.ts` read in full; tsc clean pre- and post-fix. |
| D2 | Fix every Medium+ finding directly | ✅ | `extract/python.ts` | One Warning fixed (node-id dedup); Suggestions left documented. |
| D3 | Write report to `library/qa/repo-sweep/c5/quality.md` | ✅ | this file | - |
| NG | Do not touch files outside `src/graph/`; no `npm install` | ✅ | - | Only `src/graph/extract/python.ts` changed; no install run. The 4 files under `harnesses/cursor/extension/src/graph/` are a separate tree, out of this chunk's 34-file scope, and were not touched. |

## Files Changed

- `src/graph/extract/python.ts` (M), dedup `pushNode` by node `id` (skip duplicate push, keep first `declByName` key) to mirror the shared and TypeScript extractors and uphold the `GraphNode.id` uniqueness invariant.
