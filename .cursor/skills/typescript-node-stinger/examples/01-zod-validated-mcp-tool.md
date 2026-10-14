# Example 01 - Add a zod-validated MCP tool

Goal: add a `hivemind_recent` tool to the MCP server that lists the most recently updated summaries for a user. Shows the full Hivemind MCP-tool shape: `zod/v3` inputSchema, context resolution, guarded SQL, narrowed errors, content result.

## 1. Register the tool in `src/mcp/server.ts`

```ts
// Note: the MCP server imports zod/v3 (the SDK speaks v3), NOT the app's zod ^4.
import * as z from "zod/v3";

server.registerTool(
  "hivemind_recent",
  {
    description:
      "List the most recently updated Hivemind summaries for a user. Returns path + project + last update date, newest first. Use to catch up on what a teammate has been doing.",
    inputSchema: {
      user: z.string().describe("Username whose summaries to list, e.g. 'alice'."),
      limit: z.number().int().min(1).max(100).optional().describe("Max rows (default 20)."),
    },
  },
  async ({ user, limit }: { user: string; limit?: number }) => {
    const ctx = getContext();
    if ("error" in ctx) return errorResult(ctx.error);

    // The user comes from an agent -> untrusted. Build the prefix and escape it
    // with sqlLike (+ ESCAPE) so it can't widen the match (guides/17).
    const prefix = `/summaries/${user}/`;
    const sql =
      `SELECT path, project, last_update_date FROM "${ctx.memoryTable}" ` +
      `WHERE path LIKE '${sqlLike(prefix)}%' ESCAPE '\\' ` +
      `ORDER BY last_update_date DESC LIMIT ${limit ?? 20}`;

    try {
      const rows = await ctx.api.query(sql);
      if (rows.length === 0) return errorResult(`No summaries for ${user}.`);
      const text = rows
        .map((r) => `${r["path"]}  (${r["project"] ?? "-"}, ${r["last_update_date"] ?? "-"})`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isMissingTableError(msg)) return errorResult(`No summaries for ${user}. ${FRESH_ORG_HINT}`);
      return errorResult(`hivemind_recent failed: ${msg}`);
    }
  },
);
```

## What this demonstrates

- **`zod/v3` import** - the single most common MCP footgun is reaching for the app's `zod ^4`; the SDK's `inputSchema` inference needs v3 (`guides/05`, `guides/12`).
- **`.describe` on every field** - the agent reads these to call the tool; bounded `limit` rejects a runaway query at the boundary.
- **Context first, `errorResult` on failure** - never throw out of a handler.
- **Guarded SQL** - `sqlLike(prefix)` + `ESCAPE '\\'` so `user='%'` can't dump every user's summaries (`guides/17`).
- **Narrowed errors + missing-table hint** - `err instanceof Error`, fresh-org friendly message (`guides/09`).
- **Goes through `ctx.api.query`** - inherits retry + Semaphore; no hand-rolled fetch (`guides/03`).

## 2. Test it

Add `tests/mcp/hivemind-recent.test.ts` (or the right mirror) that drives the handler against a fake client and asserts the SQL was `sqlLike`-escaped. See `examples/03` and `templates/example.test.ts`.

## 3. Verify the gate

```bash
npm run typecheck   # tsc --noEmit
npm run dup         # jscpd src - if the error tail duplicates another tool's, extract a helper
npm test            # vitest run
```

## See also

- `guides/05-mcp-sdk-tools.md`, `guides/12-strict-types-and-zod.md`, `guides/17-secrets-and-sql-guards.md`.
- `src/mcp/server.ts` (the real `hivemind_search` / `_read` / `_index` tools).
