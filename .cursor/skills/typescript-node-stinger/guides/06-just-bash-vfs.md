# 06 - just-bash & the VFS Shell

Hivemind exposes its Deep Lake-backed memory as a filesystem-shaped shell. The engine is `just-bash ^2.14`, wired up in `src/shell/deeplake-shell.ts`. Paths like `/summaries/<user>/<id>.md` and `/sessions/<user>/<...>.jsonl` are virtual - they map onto Deep Lake rows, not real files.

## Why a VFS shell

Agents already know how to `grep`, `ls`, `cat`. Rather than teach every harness a bespoke API, Hivemind presents memory as a virtual filesystem and lets just-bash interpret the commands, translating them into Deep Lake SQL through the client. The MCP tools (`guides/05`) are the structured surface; the shell is the freeform one.

## How it maps

- **`ls` / index** -> a `SELECT path, ... FROM "<memory table>" WHERE path LIKE ... ORDER BY last_update_date DESC`. The prefix is escaped with `sqlLike` and `ESCAPE '\\'`.
- **`cat` / read** -> a `SELECT <column>::text ... WHERE path = '<sqlStr(path)>'`. The column is `summary::text` for `/summaries/...` and `message::text` for `/sessions/...`.
- **`grep` / search** -> `buildGrepSearchOptions(params, root)` produces the search options, then `searchDeeplakeTables(...)` runs the query. The grep params (`pattern`, `ignoreCase`, `wordMatch`, `filesOnly`, `countOnly`, `lineNumber`, `invertMatch`, `fixedString`) mirror real grep flags.

## Rules when touching the shell

1. **Every path component that comes from outside is guarded.** A path or prefix from an agent is untrusted; `sqlStr` / `sqlLike` are mandatory (`guides/17`).
2. **Different users are different paths.** `/summaries/alice/` and `/summaries/bob/` are distinct namespaces - do not merge them. The MCP tool descriptions say this explicitly; the shell honors the same boundary.
3. **Respect the row cap and report truncation.** Searches are capped; when the cap is hit, surface it (the `meta.truncated` flag / truncation notice) so a capped page is not mistaken for the full set.
4. **Reuse `buildGrepSearchOptions` / `searchDeeplakeTables`.** Do not re-implement the grep-to-SQL translation - that is exactly the kind of duplication jscpd will flag (`guides/13`).

## Common findings

- A new shell command that opens its own `fetch` instead of going through the client - **must-fix** (`guides/03`).
- Un-escaped path/prefix interpolation in a shell-to-SQL translation - **must-fix**.
- A re-implementation of grep options that should reuse `buildGrepSearchOptions` - **should-refactor** (and likely a jscpd hit).

## Sources

- `src/shell/deeplake-shell.ts`, `src/mcp/server.ts` (`buildGrepSearchOptions`, `searchDeeplakeTables`).
- `just-bash` `^2.14`.
- `research/2026-06-16-just-bash-vfs.md`.
