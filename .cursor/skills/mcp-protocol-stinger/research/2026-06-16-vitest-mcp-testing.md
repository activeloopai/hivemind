# Testing MCP Servers with Vitest

- **Source:** Hivemind tests/claude-code/mcp-server.test.ts + Vitest ^4 patterns
- **Fetched:** 2026-06-16
- **Authority:** internal + practitioner
- **Relevance:** high

## Key facts

- Pattern: stub `McpServer` so `registerTool(name, config, handler)` captures handlers into a `Map`, stub `StdioServerTransport`, then invoke handlers directly. The transport never opens; the SDK is a stub. (Mock at the boundary - CLAUDE.md rule 5.)
- Mock external deps (auth, config, Deeplake API, version, grep-core) but keep security-critical helpers REAL via `importOriginal` (real `sqlStr`/`sqlLike`) so injection-guard assertions test the real code.
- Coverage per tool: registration shape; unauthenticated short-circuit (no backend call); invalid config; empty result; happy path (+ correct backend-call args); default vs explicit bounds; failure branch; non-Error rejection (`String(err)`); domain-specific classification (fresh-org missing TABLE vs raw missing COLUMN); output-format guarantees (no literal `"null"`/`"undefined"`); input guards (path must start `/`; wildcard `ESCAPE`).
- Run: `npm test` (vitest run), `npx vitest run <file>`, `npm run typecheck`, `npm run ci`.

## Hivemind relevance

The registration-shape test pins the exact set `["hivemind_index","hivemind_read","hivemind_search"]` - it doubles as a contract-drift guard. The fresh-org tests use the exact live-repro 400 string from api.deeplake.ai.
