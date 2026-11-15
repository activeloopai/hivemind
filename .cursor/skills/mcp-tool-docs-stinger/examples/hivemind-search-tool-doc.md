# Example: MCP Tool Doc for `hivemind_search`

A complete, honest tool doc built from `src/mcp/server.ts`. This is the shape every Hivemind MCP tool doc should take.

**Demonstrates:** `guides/01-mcp-tool-docs.md` (the six required parts), `templates/mcp-tool-doc.md`

---

## `hivemind_search`

### Purpose

Search Hivemind shared memory (summaries + raw sessions) by keyword or multi-word phrase. Returns matching paths and snippets. Use this first when the user asks about prior work, conversations, or context that may exist in Hivemind. Different paths under `/summaries/<username>/` are different users - do not merge them.

### Input schema

Transcribed from the zod `inputSchema`:

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `query` | string | yes | - | Keyword or multi-word phrase to search for (literal substring match). |
| `limit` | number (integer) | no | 1-50, default 10 | Maximum hits to return. |

### Output shape

Returns `{ content: [{ type: "text", text: string }] }`. The `text` contains:

- **On hits:** one block per match, each formatted as `[<path>]` followed by up to 600 characters of normalized content, blocks joined by `\n\n---\n\n`. When the row cap is reached, a truncation notice is appended so the caller knows the page is not the complete set.
- **On no hits:** `No matches for "<query>".`
- **On a fresh org** (memory tables not yet created): `No matches for "<query>". Hivemind memory is empty - tables are created when the first agent session starts, and entries appear after it ends.`
- **Not authenticated:** `Not authenticated. Run \`hivemind login\` to sign in to Deeplake.`
- **Other failure:** `Search failed: <message>`

### Side effects

**None.** `hivemind_search` runs a read-only keyword/regex search (SQL `SELECT`, case-insensitive, fixed-string) across the memory and sessions tables. The MCP server is read-only; it creates and writes nothing.

### Example

Call:

```json
{ "query": "embeddings rollout", "limit": 5 }
```

Response (`text`):

```
[/summaries/alice/2026-06-10-embeddings.md]
Rolled out the embeddings runtime to the staging org. Enabled on-write
indexing; recall latency dropped from 900ms to 220ms ...

---

[/sessions/alice/alice_org_ws_xyz.jsonl]
... discussed enabling embeddings by default for new orgs ...
```

---

*References: `guides/01-mcp-tool-docs.md`, `src/mcp/server.ts`*
