# 01 - Documenting MCP Tools

How to document a Hivemind MCP tool from its source. Read `research/external/2026-06-16-mcp-tool-resource-documentation.md` before running this guide.

Hivemind's MCP server lives in `src/mcp/server.ts`. It runs over **stdio**, is **read-only**, and authenticates from `~/.deeplake/credentials.json`. The tools shipped today are `hivemind_search`, `hivemind_read`, and `hivemind_index`. OpenClaw additionally contracts `hivemind_goal_add` and `hivemind_kpi_add` (see the bottom of this guide).

## The six required parts

Every tool doc carries all six. They are facts, not prose - transcribe them from the source.

### 1. Name

The exact string passed to `server.registerTool("<name>", ...)`. Case and underscores matter: `hivemind_search`, not `Hivemind Search`.

### 2. Purpose

What the tool does and when a caller should reach for it, in one or two sentences. The repo already writes a `description` field for each tool - start from that string verbatim, then confirm it matches behavior. Do not improve the wording into something the code does not do.

### 3. Input schema (from the zod `inputSchema`)

Transcribe the zod schema field by field. For each field record: name, type, required vs optional, constraints, default, and the `.describe(...)` text. Example, from `hivemind_search`:

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `query` | string | yes | - | Keyword or multi-word phrase to search for (literal substring match). |
| `limit` | number (int) | no | 1-50, default 10 | Maximum hits to return. |

`z.string()` -> string. `z.number().int().min(1).max(50).optional()` -> optional integer, 1-50. `.optional()` means not required; a `?? <value>` in the handler tells you the default.

### 4. Output shape

What the handler returns. Hivemind tools return `{ content: [{ type: "text", text: string }] }`. Document what the `text` actually contains:

- `hivemind_search` - matching paths and snippets joined by `\n\n---\n\n`; appends a truncation notice when the row cap is hit; returns `No matches for "<query>"` on an empty result.
- `hivemind_read` - the full content at the path, or `No content found at <path>.`
- `hivemind_index` - a tab-separated table: `path\tlast_updated\tproject\tdescription`.

Record the not-authenticated and fresh-org messages too - those are real outputs a caller will see.

### 5. Side effects

State them honestly. The Hivemind MCP server is **read-only**: `hivemind_search`, `hivemind_read`, and `hivemind_index` perform SQL `SELECT`s against Deeplake tables and create nothing. If a doc claims a write, it is wrong - flag it. (The OpenClaw goal/KPI tools below *do* write; document that lazy table creation.)

### 6. Examples

At least one realistic call and its response. Use real path shapes (`/summaries/alice/abc.md`, `/sessions/alice/alice_org_ws_xyz.jsonl`) - not `{"string": "string"}`.

## Reading a registerTool block

Each tool is a `server.registerTool(name, { description, inputSchema }, handler)` call. To document it:

1. Copy the **name** (first arg).
2. Copy the **description** (start of purpose).
3. Walk **`inputSchema`** field by field into the schema table.
4. Read the **handler** to find the real output strings and any side effects.
5. Note error branches - `Not authenticated`, the fresh-org hint, `Search failed: <msg>` - they are outputs too.

## The OpenClaw goal/KPI tools

OpenClaw exposes two extra tools, contracted in `harnesses/openclaw/skills/hivemind-goals/SKILL.md` and implemented in `harnesses/openclaw/src/index.ts`:

- **`hivemind_goal_add({ text })`** - creates a goal. Returns `goal_id` (UUID). Status starts at `opened`. **Side effect:** writes a row to the lazily-created `hivemind_goals` table.
- **`hivemind_kpi_add({ goal_id, kpi_id, target, unit, name? })`** - adds a KPI to an existing goal. **Side effect:** writes a KPI row. Only call when the user explicitly asks for KPIs.

Document these with the same six-part shape. The key difference from the read-only server tools is that these **write** - say so.

## Minimum viable tool-doc set

For every tool, provide:

1. Name + one-line purpose.
2. The full input-schema table.
3. The output shape, including empty-result and error outputs.
4. The side-effect statement (read-only vs writes).
5. One worked example call + response.

Use the template at `templates/mcp-tool-doc.md`. See `examples/hivemind-search-tool-doc.md` for a complete worked doc.

*Source: `research/external/2026-06-16-mcp-tool-resource-documentation.md`*
