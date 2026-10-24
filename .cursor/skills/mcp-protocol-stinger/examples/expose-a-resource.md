# Example: Expose a Hivemind resource

Walkthrough of exposing the org `/index.md` as an MCP **resource** so a client can pull it at session start without a tool round-trip. This shows the tool-vs-resource decision in practice (see `guides/02-tool-design.md`).

---

## Why a resource here

Hivemind currently reaches everything through tools, including `/index.md` via `hivemind_read`. That requires the model to *decide* to call a tool and supply the path. An `/index.md` is:

- **Addressable** - it has one stable URI.
- **Enumerable** - it is a fixed thing a client can list.
- **Pulled without arguments** - the client just reads it.

That is the resource profile. Exposing it as a resource lets a harness fetch it deterministically at startup instead of hoping the model calls a tool. (This is a design choice, not a bug fix - the tool path still works.)

---

## Step 1 - Declare the resource capability by registering one

With `@modelcontextprotocol/sdk`, registering a resource adds the `resources` capability to the `initialize` handshake automatically (see `guides/05-capability-negotiation.md`). Do **not** hand-declare `resources` capability and then register nothing - that is a contract lie that yields `-32601`.

```typescript
server.registerResource(
  "hivemind-index",
  "hivemind://index",
  {
    title: "Hivemind org index",
    description: "The org-wide memory index (one row per session summary).",
    mimeType: "text/markdown",
  },
  async (uri) => {
    const ctx = getContext();
    if ("error" in ctx) {
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text: ctx.error }] };
    }
    try {
      const sql = `SELECT path, summary::text AS content FROM "${ctx.memoryTable}" WHERE path = '${sqlStr("/index.md")}' LIMIT 1`;
      const rows = await ctx.api.query(sql);
      const text = rows.length ? normalizeContent("/index.md", String(rows[0]["content"] ?? "")) : FRESH_ORG_HINT;
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const text = isMissingTableError(msg) ? FRESH_ORG_HINT : `Read failed: ${msg}`;
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
    }
  },
);
```

---

## Key differences from a tool

| Aspect | Tool | Resource |
|---|---|---|
| Identified by | name (`hivemind_read`) | URI (`hivemind://index`) |
| Invoked via | `tools/call` (model-initiated, with args) | `resources/read` (client-initiated, no args) |
| Return shape | `{ content: [{ type: "text", text }] }` | `{ contents: [{ uri, mimeType, text }] }` |
| Capability group | `tools` | `resources` |

Reuse the same `getContext()` / auth short-circuit / fresh-org classification - the error model (`guides/04`) is identical; only the return shape and the channel differ.

---

## Step 2 - Contract impact

Adding a resource is **additive**, but it adds a new capability group consumers may now use. Multi-harness consistency (`guides/06`) still applies: if more than one harness should pull the index this way, expose it the same way everywhere, and keep the URI (`hivemind://index`) stable.

---

## When NOT to do this

If no client actually enumerates resources in its startup loop, a resource is a primitive nobody calls - keep using `hivemind_read`. Hivemind chose tools-only originally for exactly this reason. Add the resource only when a consuming harness will pull it.
