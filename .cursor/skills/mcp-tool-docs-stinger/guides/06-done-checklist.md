# 06 - Done Checklist

Run this checklist before declaring Hivemind documentation complete. All 10 items must pass or be explicitly acknowledged.

| # | Check | Pass criteria |
|---|---|---|
| 1 | **Source read** | The actual source for every documented surface was read this session (`src/mcp/server.ts`, `src/cli/index.ts`, `src/commands/*`, exported types) |
| 2 | **Tool name + purpose match** | Every MCP tool's documented name and purpose match `registerTool(...)` and its `description` |
| 3 | **Input schemas match** | Every tool's schema table matches its zod `inputSchema` field-for-field (type, required, constraints, default, describe text) |
| 4 | **Output shapes documented** | Every tool doc states the `content` output, including empty-result and error outputs |
| 5 | **Side effects honest** | Read-only server tools say read-only; the OpenClaw goal/KPI write tools say they write. No doc claims a side effect the code lacks |
| 6 | **Tool examples present** | Every MCP tool doc has at least one realistic call + response |
| 7 | **TypeDoc builds clean** | `npm run docs:api` (TypeDoc) runs with zero warnings on the public entry points |
| 8 | **CLI reference matches dispatch** | Every command/flag in the docs is parsed in `src/cli/index.ts`, and every parsed flag is documented |
| 9 | **Sync check passes** | The doc-sync diff reports no drift, or every drift is explicitly listed (see `guides/04-doc-sync.md`) |
| 10 | **Changelog tied to version** | If this is a version bump or consumer-visible change, a `CHANGELOG.md` entry exists, its top version equals `package.json`, and breaking changes carry `[BREAKING]` |

## Fast-path for "good enough"

For an internal-only change with no external consumers, items 6, 7 may be deferred if:

- The change is internal-only (no public tool, type, or CLI surface touched).
- There is a ticket to backfill the deferred items.
- The deferred items are explicitly listed in the session output.

Never defer items 1, 2, 3, 5, 8, 10 for any change that touches a consumer-facing surface.

## How to emit the checklist

At the end of every `mcp-tool-docs-worker-bee` session, emit the checklist as a markdown table with `pass` / `warn` / `fail` in a "Result" column, plus a brief note for any non-passing item.
