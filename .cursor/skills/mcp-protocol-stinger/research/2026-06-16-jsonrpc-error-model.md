# JSON-RPC 2.0 Error Model

- **Source:** JSON-RPC 2.0 spec + MCP error conventions
- **Fetched:** 2026-06-16
- **Authority:** official
- **Relevance:** high

## Key facts

- Error object: `{ code: <int>, message: <string>, data?: <any> }` on a response with the matching `id`.
- Reserved/standard codes:
  - `-32700` Parse error (invalid JSON)
  - `-32600` Invalid Request
  - `-32601` Method not found
  - `-32602` Invalid params
  - `-32603` Internal error
  - `-32000` to `-32099` implementation-defined server errors
- MCP distinguishes PROTOCOL errors (JSON-RPC error object) from TOOL-EXECUTION failures (normal tool result with optional `isError: true`). A tool that runs but yields a domain failure should NOT throw a JSON-RPC error.
- Notifications never produce a response (no `id`), so they never carry an error object.

## Hivemind relevance

Hivemind keeps all domain outcomes in the tool-result channel via `errorResult(text)`: unauthenticated, invalid config, no results, classified fresh-org hint, and `<Op> failed: <msg>` (coercing non-Error rejections). Param validation is delegated to the SDK (`-32602`). The fresh-org classification (issue #252) prevents leaking a raw Deeplake 400 into agent context.
