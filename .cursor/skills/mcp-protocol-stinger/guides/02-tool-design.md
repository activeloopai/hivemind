# 02 - Tool Design: tools vs resources vs prompts

How to decide which MCP primitive to expose, and how to shape a Hivemind tool.

---

## Pick the primitive

| Primitive | The model... | The client... | Pick it when |
|---|---|---|---|
| **Tool** | decides arguments and triggers execution | lists via `tools/list`, calls via `tools/call` | the work is an action or a parameterized query (search, write, compute). |
| **Resource** | references a URI | enumerates via `resources/list`, fetches via `resources/read` | content is addressable, enumerable, and pulled without arguments. |
| **Prompt** | fills template slots | lists via `prompts/list`, invokes via `prompts/get` | it is a canned, user-selected interaction. |

Hivemind exposes **only tools** today: `hivemind_search`, `hivemind_read`, `hivemind_index`. The rationale (see `guides/00-principles.md`): all six harnesses drive recall through model-initiated calls, and one tool call returns ranked hits across summaries and sessions in a single SQL query. There is no client-side resource enumeration in the loop, so resources would add a primitive nobody calls.

A future case for a resource: exposing `/index.md` as a readable resource URI so a client can pull it at session start without a tool round-trip. That is a legitimate design change; it is not a bug in the current tools-only shape.

---

## Anatomy of a Hivemind tool

`registerTool(name, config, handler)`:

```typescript
server.registerTool(
  "hivemind_search",
  {
    description: "Search Hivemind shared memory (summaries + raw sessions) by keyword or multi-word phrase. Returns matching paths and snippets. Use this first when the user asks about prior work...",
    inputSchema: {
      query: z.string().describe("Keyword or multi-word phrase to search for (literal substring match)."),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum hits to return (default 10)."),
    },
  },
  async ({ query, limit }: { query: string; limit?: number }) => { /* ... */ },
);
```

Design rules drawn from this shape:

1. **Name = `hivemind_<verb>`.** Stable, prefixed, lowercase-with-underscores. The prefix namespaces the tool across harnesses and avoids collision with other servers' tools.
2. **Description is a contract, not a label.** It tells the model *when* to reach for the tool ("Use this first when the user asks about prior work"), what it returns, and a critical correctness note ("Different paths under /summaries/<username>/ are different users - do not merge them."). The model only sees the description and schema; everything the model must know lives there.
3. **`inputSchema` is a raw zod shape object**, not a wrapped `z.object(...)`. Each field carries `.describe(...)` so the generated JSON Schema documents itself.
4. **Optional params have defaults applied in the handler, not the schema.** `limit` is `.optional()`; the handler does `opts.limit = limit ?? 10`. The schema states the bound (`min(1).max(50)`); the default lives where it is used.
5. **The handler returns the MCP content shape**: `{ content: [{ type: "text", text }] }`. Hivemind centralizes the error variant in `errorResult(text)` so every failure returns the same shape.

---

## Tool description checklist

- [ ] Name is prefixed and stable (`hivemind_*`).
- [ ] Description says *when to use it*, not just what it is.
- [ ] Description states the return shape and any correctness caveat (e.g. per-user isolation).
- [ ] Read-only vs side-effecting is stated (or annotated) so retries are safe or guarded.
- [ ] Every input field has a `.describe(...)`.
- [ ] Bounds (`min`/`max`, enums) are in the schema; defaults are in the handler.

---

## Anti-patterns to flag

- A verb-in-name that is really three tools (`hivemind_do_stuff`). Split by action.
- A tool whose description is a noun phrase ("Memory search") - the model cannot route on that.
- Returning structured failure as a success result without `isError` (see `guides/04-error-model.md`).
- Re-deriving the same context object inside every handler instead of a shared `getContext()` - Hivemind's `getContext()` is the right pattern.

---

*Sources: `research/2026-06-16-mcp-sdk-typescript.md`, `research/2026-06-16-mcp-spec-lifecycle.md`*
