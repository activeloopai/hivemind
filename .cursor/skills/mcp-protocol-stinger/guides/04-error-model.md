# 04 - Error Model: JSON-RPC codes + tool-result errors

The two failure channels, the standard JSON-RPC codes, and how Hivemind keeps error output honest.

---

## Two channels, never confused

MCP has two ways a call can fail. Routing a failure to the wrong channel is the central error-model defect.

### Channel 1 - JSON-RPC protocol error

A structured error object on the response. The request never reached a clean tool execution: it was malformed, the method does not exist, or the params failed validation.

```json
{ "jsonrpc": "2.0", "id": 7, "error": { "code": -32602, "message": "Invalid params", "data": { ... } } }
```

Standard codes (JSON-RPC 2.0):

| Code | Meaning | When |
|---|---|---|
| `-32700` | Parse error | Invalid JSON received |
| `-32600` | Invalid Request | Not a valid JSON-RPC object |
| `-32601` | Method not found | Unknown method / unknown tool |
| `-32602` | Invalid params | Params failed the zod schema (SDK raises this) |
| `-32603` | Internal error | Unexpected server fault |
| `-32000` to `-32099` | Server error (implementation-defined) | Reserve for your own protocol-level faults |

The SDK raises `-32602` for you when params violate the `inputSchema`. You rarely throw these by hand.

### Channel 2 - Tool-execution result

The tool ran. The outcome is a domain result - success or a domain failure (no matches, not authenticated, backend empty). These travel as a normal tool result:

```json
{ "content": [{ "type": "text", "text": "..." }], "isError": true }
```

Set `isError: true` (or otherwise mark it) when the result represents a failure the model should treat as such, while still keeping it in-band so the model can react.

---

## The rule

- **Protocol fault => Channel 1 (JSON-RPC error code).** Malformed request, bad params, unknown tool.
- **Domain outcome => Channel 2 (tool result).** "Nothing found," "not logged in," "memory empty."

The MCP analog of HTTP's "200 with error body" anti-pattern is **dressing a Channel-1 fault as a Channel-2 success**, or vice versa. Both directions are wrong.

---

## How Hivemind does it

Hivemind's tools return domain outcomes as ordinary results via a single helper:

```typescript
function errorResult(text: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text }] };
}
```

Notice these are all **domain outcomes**, correctly kept in Channel 2:

- **Not authenticated** => `"Not authenticated. Run \`hivemind login\` to sign in to Deeplake."` The credentials file is missing; that is a state the user fixes, not a protocol fault. Short-circuits before any query.
- **Config invalid** => `"Hivemind config could not be loaded - credentials present but invalid."`
- **No results** => `"No matches for \"<query>\"."` / `"No content found at <path>."` / `"No summaries found."` Empty results are not faults.
- **Backend failure** => `"Search failed: <msg>"` / `"Read failed: <msg>"` / `"Index failed: <msg>"`, coercing non-Error rejections through `err instanceof Error ? err.message : String(err)`.

### The fresh-org classification (issue #252)

A naive handler would let the Deeplake "table does not exist" 400 surface raw. Hivemind classifies it instead:

```typescript
if (isMissingTableError(msg)) return errorResult(`No matches for "${query}". ${FRESH_ORG_HINT}`);
```

`FRESH_ORG_HINT` = `"Hivemind memory is empty - tables are created when the first agent session starts, and entries appear after it ends."`

Why this matters: the agent reads tool output **verbatim** into its recall context. An unclassified `Index failed: 400: {"error":"Table does not exist..."}` poisons that context with a backend implementation detail. The honest result is "memory is empty," and only when the missing thing is a TABLE - a missing COLUMN still surfaces as a raw `Index failed:` because that is a real defect, not a fresh org.

---

## Audit checklist (errors)

- [ ] Param-validation failures go through the SDK as `-32602`, not caught and re-dressed as success.
- [ ] Domain outcomes (empty, unauthenticated, backend down) return as tool results, not thrown JSON-RPC errors.
- [ ] Failure results are marked (`isError` or an unmistakable message) so the model treats them as failures.
- [ ] Raw backend error strings are classified into actionable messages, never leaked verbatim.
- [ ] Non-Error rejections are coerced (`String(err)`) so the handler never returns `[object Object]`.
- [ ] Auth/credential failures short-circuit before any backend call.

---

*Sources: `research/2026-06-16-jsonrpc-error-model.md`, `research/2026-06-16-mcp-sdk-typescript.md`*
