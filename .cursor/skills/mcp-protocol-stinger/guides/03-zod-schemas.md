# 03 - zod (v3) Input Schemas

How to author MCP tool input schemas in Hivemind, and the v3-vs-v4 trap.

---

## The v3 pin is deliberate

Hivemind's `package.json` depends on `zod` ^4. The MCP server still imports v3:

```typescript
import * as z from "zod/v3";
```

This is not a mistake to "fix." `@modelcontextprotocol/sdk` ^1.29 generates the tool's JSON Schema from the zod shape using v3 schema internals. Zod v4 changed those internals; passing v4 schema objects to the SDK's `inputSchema` produces a wrong or empty JSON Schema, which means the model gets no parameter documentation and the SDK cannot validate params. **Authoring a tool schema with the v4 import (`import { z } from "zod"`) is a defect; flag it.**

Rule: in any file that registers MCP tools, the zod import MUST be `zod/v3`. Application code elsewhere in the repo may use zod v4 freely - the pin only matters at the SDK boundary.

---

## inputSchema is a raw shape, not z.object

The SDK's `registerTool` config wants a plain object whose values are zod types, not a wrapped object:

```typescript
inputSchema: {
  query: z.string().describe("Keyword or multi-word phrase to search for (literal substring match)."),
  limit: z.number().int().min(1).max(50).optional().describe("Maximum hits to return (default 10)."),
}
```

Not `inputSchema: z.object({ ... })`. The SDK wraps it. Passing a pre-wrapped `z.object` is a common mistake that breaks schema generation.

---

## Field authoring rules

1. **Every field gets `.describe(...)`.** The description becomes the JSON Schema `description` the model reads. `hivemind_read`'s `path` describes the exact format: `"Absolute Hivemind memory path, e.g. /summaries/alice/abc.md"`.
2. **Encode bounds in the type.** `limit` uses `z.number().int().min(1).max(50)` - integer, ranged. The SDK rejects out-of-range params with a JSON-RPC `-32602` before your handler runs.
3. **`.optional()` for optional params; default in the handler.** `limit` is optional in the schema; the handler applies `?? 10`. Keep the schema describing the *shape*, not the policy.
4. **Prefer narrow types over `z.string()` when the value is constrained.** A path that must start with `/` could be validated in-schema with `.regex(/^\//)`; Hivemind instead checks it in the handler and returns a clear message (`"Path must start with '/': got ..."`). Either is defensible - schema rejection gives `-32602`; handler rejection gives a readable in-band result. Decide deliberately and be consistent.
5. **Do not over-constrain free-text search.** `query` is a bare `z.string()` because it is a literal substring; constraining it would reject valid searches.

---

## What the generated schema looks like

The two-tool shape above produces (roughly) this JSON Schema for `hivemind_search`:

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Keyword or multi-word phrase..." },
    "limit": { "type": "integer", "minimum": 1, "maximum": 50, "description": "Maximum hits to return (default 10)." }
  },
  "required": ["query"]
}
```

`query` is required (not `.optional()`); `limit` is not. This is the contract every consuming harness sees in `tools/list`.

---

## Audit checklist (schemas)

- [ ] The zod import in every tool-registering file is `zod/v3`.
- [ ] `inputSchema` is a raw shape object, not `z.object(...)`.
- [ ] Every field has `.describe(...)`.
- [ ] Numeric/string bounds and enums are in the schema.
- [ ] Required vs optional is correct (no accidental `.optional()` on a mandatory field).
- [ ] Defaults live in the handler, not duplicated into the schema.

---

*Sources: `research/2026-06-16-mcp-sdk-typescript.md`, `research/2026-06-16-zod-v3-mcp-pin.md`*
