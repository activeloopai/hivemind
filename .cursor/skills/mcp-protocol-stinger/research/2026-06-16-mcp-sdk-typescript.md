# @modelcontextprotocol/sdk (TypeScript) ^1.29

- **Source:** @modelcontextprotocol/sdk package + docs
- **Fetched:** 2026-06-16
- **Authority:** official
- **Relevance:** critical

## Key facts

- `McpServer({ name, version })` is the high-level server. `name`/`version` populate `serverInfo`.
- `server.registerTool(name, config, handler)`:
  - `config.description` (string) - the model's routing signal.
  - `config.inputSchema` - a RAW zod shape object (e.g. `{ query: z.string(), limit: z.number().optional() }`), NOT a wrapped `z.object(...)`. The SDK wraps it and generates the JSON Schema.
  - `handler(args)` returns `{ content: [{ type: "text", text }] }` (and may set `isError`).
- The SDK validates incoming params against the inputSchema and raises JSON-RPC `-32602` Invalid params on failure, before the handler runs.
- Transports: `StdioServerTransport` (stdin/stdout, stderr for logs) and a Streamable HTTP transport (with SSE). `await server.connect(transport)` starts the session; call it once.
- Newer SDK builds support tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) to declare side-effect semantics structurally.
- `registerResource(name, uriOrTemplate, metadata, handler)` adds a resource and the `resources` capability; resource handlers return `{ contents: [{ uri, mimeType, text }] }`.

## Hivemind relevance

`src/mcp/server.ts` uses exactly this shape: `import * as z from "zod/v3"`, `McpServer({ name: "hivemind", version: getVersion() })`, three `registerTool` calls with raw-shape inputSchemas, `StdioServerTransport`, single `connect`, stderr-only fatal logging.
