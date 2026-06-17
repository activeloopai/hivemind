# Quality Audit - Repo Sweep C6 (MCP + Embeddings + Notifications)

- **Auditor:** `quality-worker-bee`
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C6 - MCP + embeddings + notifications (quality pass)
- **Runs after:** `security-worker-bee` (commit `02094f59`), as required by the loop ordering.
- **Scope:**
  - `src/mcp/server.ts` (1 file - MCP server)
  - `src/embeddings/` (9 files - daemon, IPC clients, nomic wrapper, sql/columns/self-heal/disable)
  - `src/notifications/` (18 files - usage/transcript tracking, session-start banners, queue/state, rules, delivery)

---

## Summary

The chunk is in strong shape. Every in-scope file was read in full and `tsc --noEmit` passes clean both before and after this audit. The MCP server and the entire embeddings layer are defensive, well-documented, and already use `catch (e: unknown)`; the security pass closed the one injection gap. The single Medium finding was a codebase-consistency drift: 13 `catch (e: any)` blocks confined to the older `src/notifications/` files, inconsistent with the `catch (e: unknown)` pattern used everywhere else in the chunk. All 13 were fixed in-session (the user's definition of done authorizes direct remediation of Medium+ findings). No Critical findings. One Suggestion and one scope Note remain for follow-up.

---

## Scorecard

| Category | Status | Notes |
|---|---|---|
| Completeness | ✅ Pass | All focus areas covered; the two named files that do not exist were reconciled to their real counterparts (see Note N1). |
| Correctness | ✅ Pass | Recall-metric writes, dedup logic, notification timing/debouncing, and IPC protocol all verified correct. |
| Alignment | ✅ Pass (post-fix) | `catch (e: any)` drift relative to the rest of the chunk corrected to `catch (e: unknown)`. |
| Gaps | ✅ Pass | Error handling, input validation, empty/degraded states, and fail-soft posture present throughout. |
| Detrimental | ✅ Pass | No regressions, no perf anti-patterns on hot paths, no leftover debug, no security smells beyond the security pass. |

---

## Critical Issues (must fix)

None.

---

## Warnings (should fix)

### [MEDIUM] `catch (e: any)` weakens type safety, inconsistent with the chunk's `catch (e: unknown)` convention - FIXED

- **Files (pre-fix):**
  - `src/notifications/usage-tracker.ts:55, 99, 165`
  - `src/notifications/transcript-parser.ts:92`
  - `src/notifications/index.ts:149`
  - `src/notifications/sources/backend.ts:117`
  - `src/notifications/sources/org-stats.ts:129, 145, 202`
  - `src/notifications/sources/primary-banner.ts:96`
  - `src/notifications/state.ts:119, 128, 152`
- **Axis:** Alignment + Detrimental Patterns (code health / type safety).
- **Evidence (pre-fix):**
  ```ts
  } catch (e: any) {
    log(`appendUsageRecord failed: ${e?.message ?? String(e)}`);
  }
  ```
- **Analysis:** `any` opts the error variable out of type checking, so any future `e.foo` access on these catch bindings would silently compile. The rest of the chunk - `src/mcp/server.ts:103,137,177`, `src/embeddings/daemon.ts:142`, `src/embeddings/client.ts:148,196`, `src/notifications/queue.ts:107`, `resume-brief.ts:287,359`, `open-goals.ts:81`, `self-heal.ts:79,125`, `cold-start-brief.ts:131,404` - already uses `catch (e: unknown)` with an `instanceof Error` narrow. These 13 sites were the inconsistent outliers. Functionally the existing `e?.message ?? String(e)` happened to be safe, so no runtime behavior changed; this is purely a type-safety / consistency hardening.
- **Remediation applied:** Converted all 13 to `catch (e: unknown)`. Message-only sites now use `e instanceof Error ? e.message : String(e)`. The two `state.ts` sites that branch on `e.code` (`tryClaim` EEXIST, `releaseClaim` ENOENT) narrow via `(e as NodeJS.ErrnoException).code`, mirroring the existing precedent in `queue.ts:108`. `tsc --noEmit` passes; no lint errors on the edited files.
  ```ts
  } catch (e: unknown) {
    log(`appendUsageRecord failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  ```

---

## Suggestions (consider improving)

### [SUGGESTION] Unbounded line buffer in the daemon connection handler

- **File:** `src/embeddings/daemon.ts:111-125` (`handleConnection`)
- **Detail:** `buf += chunk` accumulates without an upper bound; a client that streams bytes with no newline grows `buf` indefinitely. Practical risk is low: the socket is created `0o600` and namespaced per uid (`/tmp/hivemind-embed-<uid>.sock`), so only the same local user can connect, and the daemon idles out after 10 minutes. A defensive cap (e.g. drop the connection past a few MB of newline-free input) would harden it without changing the happy path. Non-blocking.

---

## Plan Item Traceability

The "plan" for this standalone sweep is the chunk's focus-area checklist. Each item is traced to its implementation and verdict.

| Focus area | Where it lives | Status | Notes |
|---|---|---|---|
| MCP tool schema completeness | `server.ts:65-183` | ✅ | All three tools (`hivemind_search/read/index`) declare zod `inputSchema` with `.describe()` on every field and a tool-level `description`. |
| MCP error response per JSON-RPC | `server.ts:103-107,137-141,177-181,190-193` | ✅ | Each handler `try/catch`es; missing-table 400 maps to `FRESH_ORG_HINT`; others return `errorResult(msg)`; top-level `main().catch` writes stderr + exits non-zero. |
| MCP tool output shape consistency | `server.ts:46-48` + handlers | ✅ | Every success and error path returns the same `{ content: [{ type: "text", text }] }` shape via `errorResult`/inline. |
| Embeddings IPC protocol robustness | `daemon.ts:111-147`, `client.ts:419-447`, `standalone-embed-client.ts:140-165` | ✅ | NDJSON framing, parse-error sentinel response, `end`-without-response fast-reject, per-request timeout. Buffer bound is the lone Suggestion. |
| Embeddings graceful shutdown | `daemon.ts:91-109` | ✅ | SIGINT/SIGTERM -> close server, unlink socket+pidfile, exit 0; idle timer `unref`'d. |
| Recovery from model load failure | `nomic.ts:108-134`, `client.ts:182-295` | ✅ | `load()` resets `loading` in `finally`; daemon warms in background and re-loads on demand; stuck/incompatible daemon detected via `hello` handshake and recycled (SIGTERM + sock/pid clear) with PID-reuse guard. |
| Embeddings memory management | `daemon.ts:95-102`, `nomic.ts:152-162` | ✅ | 10-min idle-out frees ~200MB; matryoshka truncate + renormalize bounded to `dims`. |
| Recall metric write correctness | `usage-tracker.ts`, `transcript-parser.ts` | ✅ | File-based JSONL (not the named `recall-tracker.ts`, see N1); append-only, backward-compat field defaulting, byte-length-only (no PII persisted). |
| Deduplication logic | `state.ts:77-91,114-163`, `queue.ts:142-177`, `index.ts:109-146` | ✅ | `(id + JSON.stringify(dedupKey))` shown-state dedup, atomic O_EXCL per-notification claim, queue idempotency, session-id dedup in `bumpSessionCount`. |
| Notification timing / debouncing | `org-stats.ts:35,114-133` (1h cache TTL), `cold-start-brief.ts:103` (24h re-nudge), `referral-invite.ts:22` (3-session cadence) | ✅ | Debounce windows and cadence gates all present and correct. |
| Notification error handling | all sources + `index.ts:77-152` | ✅ | Every source is fail-soft to null/[]; `drainSessionStart` wraps the whole drain in try/catch so a broken pipeline never aborts the hook. |
| TypeScript: `catch (e: any)`, unsafe casts, missing return types | chunk-wide | ⚠️ -> ✅ | 13 `catch (e: any)` found and fixed (Warning above). No unsafe casts beyond the deliberate, documented `NodeJS.ErrnoException` / transformers-module normalization casts. Return types present on exported functions. |

---

## Notes

- **N1 - Two named focus-area files do not exist.** The brief named `src/notifications/recall-tracker.ts` and `src/notifications/session-notifications.ts`. Neither exists in this repo. The recall/usage-metric path is `usage-tracker.ts` + `transcript-parser.ts` (file-based JSONL at `~/.deeplake/usage-stats.jsonl`), and the session-notification drain is `index.ts` (`drainSessionStart`) delivered via `delivery/claude-code.ts`. Those real files were audited in their place. The security pass (security.md) reached the same conclusion independently. No action needed; recording for traceability.

---

## Files Changed

| File | Change | Severity addressed |
|---|---|---|
| `src/notifications/usage-tracker.ts` | 3x `catch (e: any)` -> `catch (e: unknown)` with `instanceof Error` narrow. | Medium |
| `src/notifications/transcript-parser.ts` | 1x `catch (e: any)` -> `catch (e: unknown)`. | Medium |
| `src/notifications/index.ts` | 1x `catch (e: any)` -> `catch (e: unknown)`. | Medium |
| `src/notifications/sources/backend.ts` | 1x `catch (e: any)` -> `catch (e: unknown)`. | Medium |
| `src/notifications/sources/org-stats.ts` | 3x `catch (e: any)` -> `catch (e: unknown)`. | Medium |
| `src/notifications/sources/primary-banner.ts` | 1x `catch (e: any)` -> `catch (e: unknown)`. | Medium |
| `src/notifications/state.ts` | 3x `catch (e: any)` -> `catch (e: unknown)`; two errno-branching sites narrowed via `(e as NodeJS.ErrnoException).code`. | Medium |

Verification: `tsc --noEmit` exit 0; `ReadLints` clean on all 7 edited files. No files outside C6 scope were touched (C7's `src/commands/`, `src/dashboard/`, `src/rules/`, `src/utils/` left untouched).

---

## Ordering Note

`security-worker-bee` ran first for chunk C6 (commit `02094f59`, security.md present), so the loop ordering (security -> quality) was respected.
