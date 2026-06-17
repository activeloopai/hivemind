# Security Audit Report: repo-sweep C1 - Core data + shell

**Audit date:** 2026-06-16
**Auditor:** security-worker-bee subagent
**Branch:** `pr/05-security-quality-repo-sweep`
**Chunk:** C1 - Core data + shell
**Scope (files reviewed):**
- `src/config.ts`
- `src/deeplake-api.ts`
- `src/deeplake-schema.ts`
- `src/user-config.ts`
- `src/path-match.ts`
- `src/index-marker-store.ts`
- `src/shell/deeplake-fs.ts`
- `src/shell/deeplake-shell.ts`
- `src/shell/grep-core.ts`
- `src/shell/grep-interceptor.ts`
- `src/shell/goal-paths.ts`

Supporting (read for context, not in remediation scope): `src/utils/sql.ts`, `src/embeddings/sql.ts`.

**Node version audited:** >=22 (ESM)
**`npm audit` result:** not run this pass (chunk-scoped audit; dependency tree owned by `dependency-audit-worker-bee`). Recommend a tree-wide `npm audit` as a separate step.
**OpenClaw bundle scan:** not in this chunk's scope.
**CVE watchlist:** not re-evaluated this pass (chunk-scoped to the listed source files).

---

## Executive Summary

The C1 core-data and shell surface is in good shape. The reachable, agent-influenced write/read paths (the VFS in `src/shell/deeplake-fs.ts` and the grep search path in `src/shell/grep-core.ts`) consistently route every interpolated value through `sqlStr` / `sqlLike` and validate config-driven table identifiers via `sqlIdent` at table-ensure time. No credential or captured-trace PII is logged, no real shell/process execution happens in `src/shell/` (the shell is a `just-bash` in-memory VFS, not a system shell), and credential loading in `src/config.ts` never writes or echoes the token.

No Critical or High findings were reachable with attacker-controlled input. Three defense-in-depth SQL hygiene gaps were found in three **test-only public methods** of `src/deeplake-api.ts` (`updateColumns`, `createIndex`, `upsertRowSql` via `appendRows`/`commit`) where a config-driven table name, caller-supplied column-name keys, and caller-supplied date values were interpolated without `sqlIdent` / `sqlStr`. These map to the catalog's A3 "missing `sqlIdent` on a config-driven identifier" pattern but are not currently reachable from any production caller (only the test suite calls them), so they are classified **Medium**. All three were fixed in-session under the <5-line exception so the public API surface ships hardened.

---

## Scorecard

| Category | Status | Findings |
|---|---|---|
| Credential / Token Exposure | OK | 0 |
| Captured-Trace PII (sessions/memory) | OK | 0 |
| Authentication & Org RBAC / Scope | OK | 0 |
| Injection (Deep Lake SQL API) | ATTN | 3 (Medium, fixed) |
| Dependency & OpenClaw Bundle | n/a | out of chunk scope |
| Configuration (cred modes, capture opt-out, client hardening) | OK | 0 |
| Pre-Tool-Use Gate & Prompt Injection | OK | 0 |

Legend: **OK** = zero findings · **ATTN** = Medium/Low findings documented · **FAIL** = Critical/High findings.

---

## Critical Findings (fixed in this session)

None detected.

---

## High Findings (fixed in this session)

None detected.

---

## Medium Findings (fixed in-session under the <5-line exception)

- [x] **SQL injection (latent, catalog A3 / B1) - missing `sqlIdent` on column-name keys** `src/deeplake-api.ts:352-359` (`updateColumns`) - the column keys of the `columns` record were interpolated directly as bare SQL identifiers (`${col} = ...`) with no `sqlIdent` guard, and the config-driven `this.tableName` was interpolated raw. A caller passing tainted keys would inject. **Fix:** wrapped every column key in `sqlIdent(col)` and the table name in `sqlIdent(this.tableName)`. *Reachability: test-only; no production caller.*
- [x] **SQL injection (latent, catalog A3) - identifier escaped with the wrong helper** `src/deeplake-api.ts:364-366` (`createIndex`) - `column` was interpolated as a bare identifier (`"${column}"`) and `sqlStr(column)` (a value escaper) was misused inside the index name. **Fix:** validate `column` and `this.tableName` with `sqlIdent` and use the validated identifier for both the index name and the indexed column. *Reachability: test-only.*
- [x] **SQL injection (latent) - unescaped caller-supplied date values** `src/deeplake-api.ts:323-349` (`upsertRowSql`) - `row.creationDate` / `row.lastUpdateDate` were interpolated into `'${cd}'` / `'${lud}'` without `sqlStr`, inconsistent with the equivalent VFS path in `deeplake-fs.ts` which escapes them. The config-driven `this.tableName` was also interpolated raw. **Fix:** escape both date values with `sqlStr` and validate the table name with `sqlIdent`. *Reachability: only via `appendRows`/`commit`, which are test-only.*

---

## Low Findings (documentation only)

- [ ] **Config-driven table identifiers interpolated raw on reachable paths (defense-in-depth)** `src/shell/deeplake-fs.ts` (e.g. `"${this.table}"`, `"${this.sessionsTable}"`, `"${safe}"` at lines ~222, 263, 453, 493, 543, 1070, etc.) and `src/shell/grep-core.ts:343,347,361,366,401,402` (`"${memoryTable}"`, `"${sessionsTable}"`) - these table names come from config (`HIVEMIND_TABLE` / `HIVEMIND_SESSIONS_TABLE` / `HIVEMIND_GOALS_TABLE` / `HIVEMIND_KPIS_TABLE`). The memory/goals/kpis tables are validated via `sqlIdent` at `ensure*Table()` time before the VFS uses them; `sessionsTable` is not re-validated in `deeplake-fs.ts`. The trust boundary is the process environment (an attacker who controls these env vars already controls the process), so this is hygiene, not an exploitable hole. **Recommendation:** centralize a `sqlIdent`-validated table-name accessor so every interpolation site is guarded by construction rather than by a separate ensure call. Not fixed here to keep the diff minimal and avoid sprawling across ~20 sites.
- [ ] **SQL trace can echo captured content under explicit debug opt-in** `src/deeplake-api.ts:43-49` (`traceSql`) - when `HIVEMIND_TRACE_SQL=1` or `HIVEMIND_DEBUG=1`, a 220-char summary of each SQL statement (which may include `summary` / `message` content) is written to stderr. This is opt-in debug behavior, never logs tokens (auth lives only in headers, never the SQL body), and one-shot shell mode force-deletes these env vars (`deeplake-shell.ts:39-42`). Acceptable as-is; flagged for awareness only.

---

## Dependency Audit

```text
Not run in this chunk-scoped pass. Dependency tree + OpenClaw bundle are owned by
dependency-audit-worker-bee. Recommend a tree-wide `npm audit --audit-level=high`
as a separate sweep step.
```

---

## Surface Integrity Check

| Check | Expected | Observed | Status |
|---|---|---|---|
| **SQL guards** (`src/utils/sql.ts`) | `sqlIdent` regex `[A-Za-z_][A-Za-z0-9_]*`; values via `sqlStr`/`sqlLike` | Confirmed; helpers correct (sqlStr escapes `\ ' NUL` + control chars; sqlLike escapes `% _`) | OK |
| **Config table names via `sqlIdent`** | `HIVEMIND_*_TABLE` wrapped before DDL | `ensure*Table()` + `buildCreateTableSql` + `healMissingColumns` all wrap via `sqlIdent`; reachable VFS read/write rely on ensure-time validation | OK (with Low note) |
| **Schema DDL safety** (`deeplake-schema.ts`) | Column names/SQL from frozen, validated constants; identifiers via `sqlIdent`; introspection values via `sqlStr` | Confirmed; `validateSchema` enforces identifier regex + NOT NULL/DEFAULT at module load | OK |
| **Shell command execution** (`src/shell/`) | No real `child_process` / shell-string exec on user input | Confirmed; `just-bash` VFS only; no `exec`/`spawn` in scope files | OK |
| **Credential handling** (`config.ts`) | Token read only; never logged or copied | Confirmed; `loadConfig` reads `credentials.json` / env, returns in-memory; no writes, no logging | OK |
| **No token in logs / traces** | No `Authorization`/token in any log or capture | Confirmed; auth lives only in fetch headers (`deeplake-api.ts:249-252,449-452`); never interpolated into SQL or logs | OK |
| **Embedding literals** (`embeddings/sql.ts`) | Numeric-only; non-finite -> NULL | Confirmed; `Number.isFinite` guard before interpolation | OK |

---

## Files Changed (remediation)

| File | Change Summary |
|---|---|
| `src/deeplake-api.ts` | `upsertRowSql`: `sqlIdent` the table name, `sqlStr` the caller-supplied `creationDate`/`lastUpdateDate`. `updateColumns`: `sqlIdent` the table name and every column-name key. `createIndex`: `sqlIdent` the column + table identifiers (replacing a misused `sqlStr` on an identifier). |

Typecheck (`tsc --noEmit`) passes after the change. `git diff` reviewed and confirmed security-scoped on 2026-06-16 (1 file, +22 / -8, no unrelated changes).

---

## Recommended Follow-Up (architectural)

1. **Centralized table-identifier accessor.** Introduce a single `sqlIdent`-validated accessor for every config-driven table name so the ~20 raw `"${table}"` interpolation sites in `deeplake-fs.ts` / `grep-core.ts` are guarded by construction rather than relying on a separate `ensure*Table()` call having run first. Closes the Low finding and removes the misleading `const safe = this.goalsTable` (named "safe" but not actually `sqlIdent`-validated at that point) in `deeplake-fs.ts:488,537`.
2. **Tree-wide dependency + OpenClaw audit.** Run `npm audit --audit-level=high` and `npm run audit:openclaw` as a dedicated sweep step (owned by `dependency-audit-worker-bee`).
