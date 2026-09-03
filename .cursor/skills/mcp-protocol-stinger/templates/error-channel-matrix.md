# Error Channel Decision Matrix

Use this matrix to route a failure to the correct MCP channel. The core defect is sending a failure down the wrong channel (the MCP analog of HTTP "200 with error body").

---

## "Where does this failure go?"

| Scenario | Channel | How |
|---|---|---|
| Invalid JSON on the wire | JSON-RPC error | `-32700` Parse error (SDK/transport) |
| Not a valid JSON-RPC object | JSON-RPC error | `-32600` Invalid Request |
| Unknown tool / method | JSON-RPC error | `-32601` Method not found |
| Params fail the zod inputSchema | JSON-RPC error | `-32602` Invalid params (SDK raises) |
| Unexpected server fault | JSON-RPC error | `-32603` Internal error |
| Your own protocol-level fault | JSON-RPC error | `-32000`..`-32099` server error range |
| Tool ran, no results found | Tool result | normal `{ content: [...] }`, honest "No matches..." |
| Tool ran, user not authenticated | Tool result | `{ content: [...] }` with the auth message (short-circuit first) |
| Tool ran, backend table missing (fresh org) | Tool result | classify -> empty-memory hint, never raw 400 |
| Tool ran, backend error | Tool result | `<Op> failed: <msg>`, `isError`-marked, coerced via `String(err)` |

---

## Quick disambiguation

| Question | Answer |
|---|---|
| "JSON-RPC error or tool result?" | Did the tool execute? No -> JSON-RPC error. Yes (it just produced a failure outcome) -> tool result. |
| "Should empty results throw?" | No. "Nothing found" is a domain outcome -> tool result. |
| "Should I catch the zod validation error?" | No. Let the SDK reject with `-32602`. |
| "Can I return the raw backend 400?" | No. Classify it (missing TABLE -> empty-memory hint; otherwise a clean `<Op> failed:`). |
| "What if `err` is not an Error?" | Coerce: `err instanceof Error ? err.message : String(err)`. |

---

## Standard JSON-RPC codes

| Code | Meaning |
|---|---|
| `-32700` | Parse error |
| `-32600` | Invalid Request |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32000`..`-32099` | Implementation-defined server error |
