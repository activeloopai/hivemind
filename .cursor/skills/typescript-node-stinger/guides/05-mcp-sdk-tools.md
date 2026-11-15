# 05 - MCP SDK Tools

The MCP server (`src/mcp/server.ts`) exposes Hivemind's shared memory to agents as Model Context Protocol tools. This is the API-layer discipline for this repo.

## The shape

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v3";

const server = new McpServer({ name: "hivemind", version: getVersion() });

server.registerTool(
  "hivemind_search",
  {
    description: "Search Hivemind shared memory ...",
    inputSchema: {
      query: z.string().describe("Keyword or multi-word phrase ..."),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum hits ..."),
    },
  },
  async ({ query, limit }: { query: string; limit?: number }) => {
    const ctx = getContext();
    if ("error" in ctx) return errorResult(ctx.error);
    // ... do the work ...
    return { content: [{ type: "text", text }] };
  },
);
```

## The five non-negotiables

### 1. Import `zod/v3`, not the app's zod ^4

The MCP SDK's `inputSchema` inference is written against zod v3. The app is on `zod ^4`. The server module imports `import * as z from "zod/v3"` so the schema types line up with the SDK. Importing the app's `zod` into the MCP server silently breaks `inputSchema` inference and is a **must-fix**. This is the single most common MCP footgun in this repo.

### 2. `inputSchema` is a zod object map, fully described

Every field gets a zod type and a `.describe(...)`. The description is what the agent reads to decide how to call the tool - a missing or vague description is a real usability bug, not a style nit. Constrain ranges (`.int().min(1).max(50)`) so a bad call is rejected at the boundary instead of producing a runaway query.

### 3. Resolve context first; return `errorResult` on failure

Every handler starts with `const ctx = getContext(); if ("error" in ctx) return errorResult(ctx.error);`. `errorResult` produces the MCP error-content shape. Do not throw out of a handler - return the structured error so the agent sees a usable message.

### 4. Guard the SQL and handle missing-table

Tool handlers build SQL with `sqlStr` / `sqlLike` (an LLM-supplied `query` or `prefix` is untrusted) and catch `isMissingTableError` to turn a fresh-org empty state into a friendly hint:

```ts
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (isMissingTableError(msg)) return errorResult(`No matches for "${query}". ${FRESH_ORG_HINT}`);
  return errorResult(`Search failed: ${msg}`);
}
```

### 5. Return the content shape

`{ content: [{ type: "text", text }] }`. When a result set was capped, append the truncation notice so the agent does not treat a capped page as the complete set (the search tool does exactly this with `meta.truncated`).

## The existing tools

- `hivemind_search` - keyword/phrase search across summaries + raw sessions (fixed-string, case-insensitive grep over Deep Lake).
- `hivemind_read` - read the full content at a path (`/summaries/...` -> memory table, `/sessions/...` -> sessions table; note the `message::text` vs `summary::text` column split).
- `hivemind_index` - list summary entries, optionally filtered by a `sqlLike`-escaped prefix.

## Adding a tool

See `examples/01`. The skeleton: `registerTool(name, { description, inputSchema }, handler)`, import `zod/v3`, resolve context, guard SQL, narrow errors, return content. Then add a `*.test.ts` under `tests/` (`guides/10`) that exercises the handler against a mocked client.

## Sources

- `src/mcp/server.ts` (the real tools, `errorResult`, the zod/v3 import).
- `@modelcontextprotocol/sdk` `^1.29`.
- `research/2026-06-16-mcp-sdk-zod-v3.md`.
