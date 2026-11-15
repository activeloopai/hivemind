# MCP Spec: Lifecycle, Primitives, Capabilities

- **Source:** modelcontextprotocol.io specification
- **Fetched:** 2026-06-16
- **Authority:** official
- **Relevance:** critical

## Key facts

- MCP is JSON-RPC 2.0 over a transport. Three message types: request (has `id`, expects a response), response (`result` or `error`, same `id`), notification (no `id`, no response).
- **Three primitives:** tools (model-invoked callable functions with JSON Schema input), resources (client-readable, URI-addressed content), prompts (user-invoked message templates).
- **Lifecycle:** `initialize` request (client sends protocol version + client capabilities) -> `initialize` result (server sends agreed version, `serverInfo` name+version, server capabilities) -> `notifications/initialized` (client, no response) -> normal operation -> transport-driven shutdown (for stdio, closing stdin ends the session).
- **Capabilities** declared at initialize gate which method groups are usable. Server capabilities include `tools`, `resources` (with optional `subscribe`/`listChanged`), `prompts`, `logging`. Declaring a capability you do not implement yields `-32601` when a client uses it.
- Tools listed via `tools/list`, called via `tools/call`. Resources via `resources/list` + `resources/read`. Prompts via `prompts/list` + `prompts/get`.
- Tool results carry a `content` array (text/image/resource) and optional `isError: true` for in-band tool-execution failures - distinct from JSON-RPC protocol errors.

## Hivemind relevance

Hivemind declares tools-only (registers three tools, no resources/prompts). The SDK derives the `tools` capability from registration. stdio shutdown is by stdin close.
