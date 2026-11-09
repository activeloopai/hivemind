# Example: Add a new hivemind_* tool with a zod/v3 schema

Walkthrough of adding a read-only `hivemind_recent` tool to `src/mcp/server.ts` - listing the N most recently updated summaries - matching the existing contract conventions.

---

## Goal

A convenience tool that returns the most recently updated summaries without a prefix filter. Read-only, idempotent, safe to retry.

---

## Step 1 - Register the tool (same shape as the existing three)

```typescript
server.registerTool(
  "hivemind_recent",
  {
    description:
      "List the most recently updated Hivemind summaries across all users. Read-only. Use to see the latest org activity before drilling in with hivemind_read. Different paths under /summaries/<username>/ are different users - do not merge them.",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum rows to return (default 20)."),
    },
  },
  async ({ limit }: { limit?: number }) => {
    const ctx = getContext();
    if ("error" in ctx) return errorResult(ctx.error);

    const sql = `SELECT path, description, project, last_update_date FROM "${ctx.memoryTable}" WHERE path LIKE '/summaries/%' ORDER BY last_update_date DESC LIMIT ${limit ?? 20}`;

    try {
      const rows = await ctx.api.query(sql);
      if (rows.length === 0) return errorResult("No summaries found.");
      const lines = rows.map((r) => {
        const path = String(r["path"] ?? "?");
        const desc = String(r["description"] ?? "");
        const project = String(r["project"] ?? "");
        const date = String(r["last_update_date"] ?? "");
        return `${path}\t${date}\t${project}\t${desc}`;
      });
      return { content: [{ type: "text", text: `path\tlast_updated\tproject\tdescription\n${lines.join("\n")}` }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isMissingTableError(msg)) return errorResult(`No summaries found. ${FRESH_ORG_HINT}`);
      return errorResult(`Recent failed: ${msg}`);
    }
  },
);
```

---

## What this follows (and why)

| Convention | Why |
|---|---|
| `import * as z from "zod/v3"` (already at top of file) | The SDK pins v3 schema shapes. v4 produces a wrong JSON Schema. See `guides/03-zod-schemas.md`. |
| Name `hivemind_recent` (prefixed, snake_case) | Namespaces the tool across harnesses; matches the existing contract. See `guides/06-multi-harness-contract.md`. |
| Description says *when* to use it + the per-user caveat | The model routes on the description. |
| `inputSchema` is a raw shape, not `z.object(...)` | The SDK wraps it. |
| `limit` optional in schema, default `?? 20` in handler | Schema describes shape; policy lives in the handler. See `guides/03`. |
| `getContext()` first; unauth/config short-circuit via `errorResult` | Domain failures stay in the tool-result channel. See `guides/04-error-model.md`. |
| `isMissingTableError` -> fresh-org hint | Missing TABLE is "memory empty," not a raw 400 (issue #252). |
| Reuses the exact `path\tlast_updated\tproject\tdescription` output shape | Keeps the parseable contract identical to `hivemind_index`. |
| Reuses `sqlLike`/`sqlStr` if user input ever reaches the SQL | Injection guard. This example takes no string input, so none is needed here. |

---

## Step 2 - This is a contract change

Adding a tool is **additive** (safe) per `guides/06`. But it is still new public surface:
- If a harness (pi, OpenClaw) should also expose `hivemind_recent`, register it there with the identical name and schema, or the agent's tool model diverges per harness.
- Reserve the name; do not let a future tool reuse `hivemind_recent` for a different shape.

---

## Step 3 - Test it (see `examples/test-mcp-tool.md` and `guides/07`)

At minimum: registration-shape test now expects four tools; add unauth, empty, happy, default-limit, and `Recent failed:` branch tests, plus the fresh-org missing-table case.
