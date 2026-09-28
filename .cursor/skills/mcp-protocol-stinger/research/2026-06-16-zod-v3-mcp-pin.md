# Zod v3 Pin at the MCP SDK Boundary

- **Source:** zod + @modelcontextprotocol/sdk interaction
- **Fetched:** 2026-06-16
- **Authority:** practitioner / SDK behavior
- **Relevance:** critical

## Key facts

- Zod v4 changed schema internals. The MCP SDK's JSON-Schema generation for tool inputs is built against v3 schema shapes.
- Passing v4 schema objects to `inputSchema` produces a wrong or empty JSON Schema: the model gets no parameter docs and the SDK cannot validate params.
- Mitigation in repos depending on zod ^4: import `zod/v3` specifically at the SDK boundary. The `zod` package ships a `zod/v3` entry point for exactly this compatibility need.
- The pin is scoped to tool-registering files; the rest of the codebase can use v4.

## Hivemind relevance

`package.json` depends on `zod` ^4, but `src/mcp/server.ts` opens with `import * as z from "zod/v3"`. This is intentional and load-bearing. Auditing rule: any MCP tool file importing `zod` (v4) instead of `zod/v3` is a defect.
