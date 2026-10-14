# 2026-06-16 - MCP SDK tools + the zod/v3 requirement

Authored 2026-06-16 from `src/mcp/server.ts`. Repo is the source of truth.

## Sources

- `src/mcp/server.ts`, `package.json` (`@modelcontextprotocol/sdk ^1.29`, `zod ^4`).
- https://github.com/modelcontextprotocol/typescript-sdk

## Summary

The MCP server uses `McpServer` and `server.registerTool(name, { description, inputSchema }, handler)`. The defining detail: the server imports **`import * as z from "zod/v3"`**, not the app's `zod ^4`. The SDK's `inputSchema` type inference is written against zod v3, so feeding it v4 schemas breaks the inferred handler argument types. The repo carries both zod majors in one install for exactly this reason.

Observed tool shape (`hivemind_search` / `_read` / `_index`):

- `inputSchema` is a zod object map with `.describe(...)` on every field and bounded numerics (`.int().min(1).max(50)`).
- Each handler resolves context first (`const ctx = getContext(); if ("error" in ctx) return errorResult(ctx.error)`), builds guarded SQL (`sqlStr`/`sqlLike` + `ESCAPE '\\'`), narrows errors (`err instanceof Error ? err.message : String(err)`), maps `isMissingTableError` to a fresh-org hint, and returns `{ content: [{ type: "text", text }] }`.
- The search tool appends a truncation notice when the row cap is hit so a capped page is not read as complete.
- Different users are different paths under `/summaries/<user>/`; tools state this and do not merge them.

## Key facts the guides depend on

- `zod/v3` in the inputSchema path, `zod` (v4) elsewhere - mixing breaks inference (`guides/05`, `guides/12`).
- Return `errorResult`, never throw out of a handler (`guides/05`, `guides/09`).

## Relevance

- `guides/05-mcp-sdk-tools.md`, `guides/12-strict-types-and-zod.md`, `examples/01`, `templates/schema.ts`.
