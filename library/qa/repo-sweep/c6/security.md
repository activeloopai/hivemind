# Security Audit - Repo Sweep C6 (MCP + Embeddings + Notifications)

- **Auditor:** `security-worker-bee`
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C6 - MCP + embeddings + notifications
- **Scope:**
  - `src/mcp/server.ts` (1 file - MCP server)
  - `src/embeddings/` (9 files - embedding daemon + IPC clients)
  - `src/notifications/` (18 files - recall/usage tracking, session-start banners, delivery)
  - Shared helper read for context: `src/utils/sql.ts`.

---

## Executive Summary

Full-fidelity coverage. This chunk is squarely within the Stinger's target stack (TypeScript / Node / Deep Lake SQL API + Unix-socket IPC).

One **High** finding was identified and **fixed in-session**: the MCP server (`src/mcp/server.ts`) built two Deep Lake `SELECT` statements that interpolated a config-driven table name (`HIVEMIND_TABLE` / `HIVEMIND_SESSIONS_TABLE`, via `config.tableName` / `config.sessionsTableName`) directly into the query string without passing it through `sqlIdent()`. This is the exact `sqlIdent`-on-identifier gap already found and fixed in C1, C3, C4, and C5. The lone correct precedent in this same chunk - `src/notifications/sources/resume-brief.ts:286` - already validates the table name via `sqlIdent` before interpolating, so the MCP server was the inconsistent outlier. Both sites are now wrapped.

No Critical findings. No credential or captured-trace PII exposure. The embedding daemon's Unix-socket IPC is correctly locked down (umask `0o177` before `listen()` + explicit `chmod 0o600`, `0o600` pidfile). The notification framework's file-backed state/queue use a `$HOME` sandbox guard and `0o700`/`0o600` modes. The model-vs-user prompt-injection split (codex P1) is correctly enforced: LLM-derived banner prose is routed only to the user-visible `systemMessage` channel and kept out of the model-visible `additionalContext`.

---

## Findings

### [HIGH] Missing `sqlIdent` on config-driven table names in the MCP server (Deep Lake SQL injection) - FIXED

- **File:** `src/mcp/server.ts:132` (`hivemind_read`) and `src/mcp/server.ts:165` (`hivemind_index`) (pre-fix)
- **Category:** OWASP A03 Injection (SQL injection into the parameterless Deep Lake HTTP query API) / catalog A3 - missing `sqlIdent` on a config-driven identifier.
- **Evidence (pre-fix):**
  ```ts
  // hivemind_read
  const sql = `SELECT path, ${column} AS content FROM "${table}" WHERE path = '${sqlStr(path)}' LIMIT 200`;
  // hivemind_index
  const sql = `SELECT path, description, project, last_update_date FROM "${ctx.memoryTable}" ${where} ORDER BY last_update_date DESC LIMIT ${limit ?? 50}`;
  ```
- **Analysis:** `table` resolves to `ctx.sessionsTable` / `ctx.memoryTable`, which come from `getContext()` -> `loadConfig()` -> `config.sessionsTableName` / `config.tableName`. Those are sourced from `process.env.HIVEMIND_SESSIONS_TABLE` / `process.env.HIVEMIND_TABLE` (`src/config.ts:57-58`, defaulting to `"sessions"` / `"memory"`). The Deep Lake HTTP query endpoint has no parameterized queries, so every identifier must pass `sqlIdent()` (regex `^[A-Za-z_][A-Za-z0-9_]*$`, throws otherwise). These two table names were interpolated raw between double quotes, so a table name containing a `"` could break out of the identifier quoting and inject arbitrary SQL into the query the MCP server runs against shared org memory. The other interpolated inputs in these handlers were already safe: `path` -> `sqlStr`, `prefix` -> `sqlLike(...) ... ESCAPE '\\'`, `column` is a hardcoded literal (`"message::text"` / `"summary::text"`), and `limit` is zod-bounded (`int().min(1).max(50|200)`).
- **Why High (not Critical):** The taint source is the process environment, not remote/agent input. An attacker who can set `HIVEMIND_TABLE` already controls the process. The catalog rates the raw-identifier pattern as Critical in principle; consistent with the C3/C4 calls on the identical pattern, realistic exploitability here is High. Fixed regardless to close the gap and restore codebase-wide consistency (`DeeplakeApi`, `session-queue.ts`, `context-renderer.ts`, the C3 hook sites, the C4 skillify sites, and `resume-brief.ts` in this very chunk all already route table names through `sqlIdent`).
- **Corroboration (two sources):**
  1. `src/notifications/sources/resume-brief.ts:280-290` validates the same config-driven table name via `sqlIdent(cfg?.tableName ?? "memory")` before interpolating into `FROM "${table}"`, with an explicit comment: "sqlStr only escapes literals, not identifiers. Validate it; on a bad value, bail."
  2. The prior repo-sweep audits (`library/qa/repo-sweep/c3/security.md`, `.../c4/security.md`) found and fixed this exact `HIVEMIND_TABLE` / `HIVEMIND_SESSIONS_TABLE` raw-interpolation pattern across the hooks and skillify subsystems.
- **Remediation applied:** Added `sqlIdent` to the existing `../utils/sql.js` import and wrapped both table identifiers: `FROM "${sqlIdent(table)}"` and `FROM "${sqlIdent(ctx.memoryTable)}"`. In `hivemind_index` the `const sql = ...` line was moved inside the existing `try` block so that a `sqlIdent` throw on a malformed table name degrades to the handler's graceful `errorResult(...)` path rather than escaping the tool handler. A legitimate table name passes `sqlIdent` unchanged, so behavior for all valid configs is identical. Minimal blast radius: one import edit plus two query-construction lines.
  ```ts
  const sql = `SELECT path, ${column} AS content FROM "${sqlIdent(table)}" WHERE path = '${sqlStr(path)}' LIMIT 200`;
  // ...
  const sql = `SELECT path, description, project, last_update_date FROM "${sqlIdent(ctx.memoryTable)}" ${where} ORDER BY last_update_date DESC LIMIT ${limit ?? 50}`;
  ```

---

## Category Scorecard

| Focus area | Result |
|---|---|
| **MCP tool input validation** | **OK.** `hivemind_search` / `hivemind_read` / `hivemind_index` declare zod input schemas (`z.string()`, `z.number().int().min().max().optional()`). `limit` is range-bounded by zod so the raw `LIMIT ${limit}` interpolation is safe. |
| **MCP SQL injection via tool args** | **None remaining.** `query` -> grep-core with `fixedString` (lexical), `path` -> `sqlStr`, `prefix` -> `sqlLike(...) ESCAPE '\\'`. Config-driven table identifiers were the one gap (see High finding) and are now `sqlIdent`-wrapped. |
| **MCP tool output sanitization / secret echo** | **None detected.** Tool results return memory `path` + content snippets only. No token, credential path, or `Authorization` header is echoed. `getContext()` returns a plain "Not authenticated" string when creds are absent, not the credential contents. |
| **MCP auth / authorization** | **OK.** Identity/org/token are resolved from `loadCredentials()` + `loadConfig()` (the credential store), never from tool arguments. No tool accepts an org id or scope as an argument. `DeeplakeApi` is constructed from the authenticated `config`. |
| **MCP JSON-RPC error handling** | **OK.** Each handler wraps the query in `try/catch`; the missing-table 400 is mapped to a friendly "memory is empty" hint (`FRESH_ORG_HINT`) and other errors return `errorResult(msg)`. The top-level `main().catch` writes to stderr and exits non-zero. Errors echo the Deep Lake error text but no org id or resolved path (low-risk verbose-error surface; below Medium threshold). |
| **Embeddings IPC socket security (world-accessible?)** | **None detected.** `daemon.ts:81-84` sets `umask(0o177)` immediately before `listen()` (closing the bind-to-chmod window) then `chmodSync(socketPath, 0o600)`; pidfile written `{ mode: 0o600 }`. Socket path is `/tmp/hivemind-embed-<uid>.sock`, namespaced per uid. Owner-only access. |
| **Embeddings model input sanitization** | **OK / N/A.** Embed `text` is prefixed (`search_document:` / `search_query:`) and fed to the local nomic feature-extraction pipeline - a numeric vectorizer, not a code/SQL/shell sink. The daemon's response is runtime-validated in `standalone-embed-client.ts:347-349` (rejects non-finite / non-number) before it can reach the SQL literal pipeline; `embeddingSqlLiteral` (`src/embeddings/sql.ts`) independently re-checks `Number.isFinite` and emits `NULL` otherwise. |
| **Embeddings daemon file-system access** | **OK.** Daemon does no SQL and no shell. It writes only its own socket + pidfile, and `self-heal.ts` manages a single `node_modules` symlink conservatively (never clobbers a real dir, removes only dangling links, atomic tmp+rename). Daemon spawn uses `spawn(process.execPath, [daemonEntry], { detached, stdio:"ignore" })` - array args, no `shell:true`. `daemonEntry` resolves from opt -> `HIVEMIND_EMBED_DAEMON` env -> canonical install path; it is an executable path, not interpolated into a shell string. |
| **Recall / usage metrics writes (SQL parameterization)** | **None applicable.** There is no `src/notifications/recall-tracker.ts`; the recall/usage metric path is `usage-tracker.ts` + `transcript-parser.ts`, which are **file-based JSONL** (`~/.deeplake/usage-stats.jsonl`), not SQL. No interpolation sink exists. `transcript-parser.ts` computes only byte counts/counts and never persists transcript content (no PII written). |
| **Notifications -> Deep Lake reads** | **OK.** `resume-brief.ts` validates the table via `sqlIdent` and escapes `project` / `author` via `sqlStr`, scoping reads to `author = <userName>` AND `project`. `open-goals.ts` delegates to the canonical `listOpenGoals` reader (owner-form exact matching, never a `'%user%'` substring scan, `version=MAX` dedup) - cross-user goal leakage is structurally prevented. The goals-table SQL construction lives in `context-renderer.ts` (C3 scope, already `sqlIdent`/`sqlStr`-guarded there). |
| **Credential / token leakage to logs** | **None detected.** `backend.ts` / `org-stats.ts` send `Authorization: Bearer <token>` + `X-Activeloop-Org-Id` from the credential store and log only the URL + status, never the token. No `console.*`/`log()` call in the chunk interpolates a token, header, or credential-file content. |
| **Captured-trace PII exposure** | **None detected.** Notification bodies are server- or rule-authored copy + aggregate counts (tokens saved, session counts, goal first-lines), not raw captured prompts. `transcript-parser.ts` reads transcript content only to measure byte length. |
| **Prompt-injection surface (banners injected at SessionStart)** | **Hardened.** The model-vs-user channel split (`delivery/claude-code.ts:42-55`) sends LLM-derived prose only to `systemMessage` (user terminal) when `userVisibleOnly: true`; only statically-authored bodies reach the model's `additionalContext`. Every mined/summary-derived banner (`local-mined.ts`, `primary-banner.ts` welcome/savings/cold-start) sets `userVisibleOnly: true`. Backend free-text pushes (`backend.ts:74`) also set it. This is the codex P1 fix, correctly enforced end to end. |
| **Notifications state/queue file safety** | **OK.** `state.ts` / `queue.ts` writes refuse to leave `$HOME` (resolved at call time), `mkdir` with `0o700`, write tmp with `0o600` then atomic `rename`. Cross-process safety via `O_EXCL` claim files / advisory lock with stale reclaim. Claim file names sanitize the id (`[^a-zA-Z0-9_.:-] -> _`) + sha256 dedup hash, so a crafted notification id cannot path-traverse. |
| **Outbound HTTP (`fetch`) hardening** | **OK.** `backend.ts` / `org-stats.ts` use `AbortController` with a 1.5s timeout, fail-soft to `[]` / stale-cache / null, validate response shape, and clamp the balance header via `^-?\d+$`. URL is `creds.apiUrl + <fixed path>`; no untrusted input is interpolated into the URL. |
| **`process.env` secret reads** | **None detected.** Env reads in scope are benign: `USER` (uid fallback), `HIVEMIND_EMBED_DAEMON` (spawn path), `HIVEMIND_EMBED_DIMS` / `HIVEMIND_EMBED_IDLE_MS` (coerced via `Number`), `HOME` (referenced in a comment). `standalone-embed-client.ts` deliberately avoids a literal `process.env.USER` read to not trip ClawHub's env-harvesting static scan. |
| **Dynamic `require` / `eval`** | **OK (deliberate).** `nomic.ts` / `disable.ts` use `createRequire(...).resolve("@huggingface/transformers")` to locate the native dep from the canonical shared-deps location - the documented resolution pattern, not arbitrary code execution. No `eval` / `new Function`. |

---

## Files Changed

| File | Change | Severity addressed |
|---|---|---|
| `src/mcp/server.ts` | Added `sqlIdent` import; wrapped the config-driven table identifier in `sqlIdent(...)` in both `hivemind_read` and `hivemind_index`; moved the `hivemind_index` query construction inside the existing `try` so a `sqlIdent` throw degrades gracefully. | High |

`git diff` verified: the only in-scope change is the three lines above in `src/mcp/server.ts`. An unrelated modification to `src/graph/extract/python.ts` present in the worktree belongs to the concurrent C5 `quality-worker-bee` run (which owns `src/graph/`); it was deliberately left untouched and excluded from this commit, per the work-boundaries rule.

---

## Recommendations (non-blocking, follow-up)

- **Centralized `sqlIdent`-validated table-name accessor.** This is now the fifth chunk (C1, C3, C4, C5, C6) to find a config-driven table identifier interpolated raw. A single `sqlIdent`-validated accessor for `HIVEMIND_TABLE` / `HIVEMIND_SESSIONS_TABLE` / `HIVEMIND_GOALS_TABLE` (already recommended in the C1 and C5 reports) would make every `FROM "${...}"` site guarded by construction rather than relying on each call site remembering to wrap. Low priority; documented here, not actioned, to keep this audit's blast radius minimal.
- **MCP error verbosity (Low).** `hivemind_*` handlers surface the raw Deep Lake error message to the MCP client on failure. It does not currently leak org id or a resolved credential path, so it stays below the Medium threshold, but a redacting wrapper would harden it further.

---

## Ordering Note

No `*-qa-report.md` / `*-quality-report.md` for chunk C6 was found predating this audit (`library/qa/repo-sweep/c6/` contained no quality report before this run). `security-worker-bee` ran before `quality-worker-bee` for this chunk, as required.
