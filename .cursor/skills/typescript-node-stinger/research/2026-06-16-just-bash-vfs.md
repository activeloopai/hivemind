# 2026-06-16 - just-bash as the VFS shell over Deep Lake

Authored 2026-06-16 from `src/shell/deeplake-shell.ts` and `src/mcp/server.ts`. Repo is the source of truth.

## Sources

- `src/shell/deeplake-shell.ts`, `src/mcp/server.ts` (`buildGrepSearchOptions`, `searchDeeplakeTables`).
- `package.json` (`just-bash ^2.14`, `shell` script).

## Summary

Hivemind presents its Deep Lake-backed memory as a virtual filesystem and uses `just-bash` as the shell engine to interpret familiar commands (`ls`, `cat`, `grep`) against it. Virtual paths (`/summaries/<user>/<id>.md`, `/sessions/<user>/<...>.jsonl`, `/index.md`) map onto Deep Lake rows, not real files. The translation:

- **list/index** -> `SELECT ... WHERE path LIKE '<sqlLike(prefix)>%' ESCAPE '\\' ORDER BY last_update_date DESC`.
- **read/cat** -> `SELECT <col>::text WHERE path = '<sqlStr(path)>'`, with `summary::text` for summaries and `message::text` for sessions.
- **grep/search** -> `buildGrepSearchOptions(params, root)` builds search options mirroring grep flags (`pattern`, `ignoreCase`, `wordMatch`, `filesOnly`, `countOnly`, `lineNumber`, `invertMatch`, `fixedString`), then `searchDeeplakeTables(...)` runs the query and reports truncation.

Every externally supplied path/prefix is guarded; the row cap is surfaced via a truncation flag; the grep-to-SQL helpers are shared (not re-implemented per call site).

## Key facts the guides depend on

- Shell commands still go through the client (no raw fetch) (`guides/03`, `guides/06`).
- Reuse `buildGrepSearchOptions` / `searchDeeplakeTables` rather than re-implementing (a jscpd risk, `guides/13`).

## Relevance

- `guides/06-just-bash-vfs.md`.
