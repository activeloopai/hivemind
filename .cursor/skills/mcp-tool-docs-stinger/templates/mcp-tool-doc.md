# MCP Tool Doc Template

Copy this per tool. Fill every `{{placeholder}}` from the source (`src/mcp/server.ts` for the server tools; the OpenClaw skill + `harnesses/openclaw/src/index.ts` for the goal/KPI tools). All six sections are required.

---

## `{{tool_name}}`

### Purpose

{{One or two sentences: what the tool does and when a caller reaches for it. Start from the `description` string in the source; confirm it matches behavior before publishing.}}

### Input schema

Transcribed from the zod `inputSchema`:

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `{{field}}` | {{string \| number \| boolean \| ...}} | {{yes \| no}} | {{min/max, enum, default - or -}} | {{the `.describe(...)` text}} |

> Mapping notes: `z.string()` -> string. `z.number().int().min(a).max(b)` -> integer, a-b. `.optional()` -> not required; a `?? <value>` in the handler is the default.

### Output shape

Returns `{ content: [{ type: "text", text: string }] }`. The `text` contains:

- **On success:** {{describe exactly what the handler returns}}
- **On empty result:** {{the empty-result message}}
- **On error / not authenticated / fresh org:** {{the real error strings the handler emits}}

### Side effects

{{State honestly. Server tools (`hivemind_search` / `hivemind_read` / `hivemind_index`) are READ-ONLY - they run SQL SELECTs and create nothing. The OpenClaw `hivemind_goal_add` / `hivemind_kpi_add` tools WRITE rows to lazily-created tables - say so. Never claim a side effect the code does not have.}}

### Example

Call:

```json
{{ realistic input JSON }}
```

Response (`text`):

```
{{ realistic output }}
```

---

## Checklist for this doc

- [ ] Name matches `registerTool("<name>", ...)` exactly.
- [ ] Purpose matches the `description` and the real behavior.
- [ ] Schema table matches the zod `inputSchema` field-for-field.
- [ ] Output shape covers success, empty, and error outputs.
- [ ] Side effects are honest (read-only vs writes).
- [ ] At least one realistic example.
