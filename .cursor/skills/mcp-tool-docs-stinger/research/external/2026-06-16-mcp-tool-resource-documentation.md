# MCP Tool & Resource Documentation Conventions

- **Retrieved:** 2026-06-16
- **Topic:** documenting Model Context Protocol tools and resources
- **Authority:** Model Context Protocol specification + SDK conventions
- **Relevance:** critical

## What an MCP tool is, for documentation purposes

In the Model Context Protocol, a server exposes **tools** that a client (an LLM agent) can discover and call. Each tool has:

- A **name** - a stable string identifier (e.g. `hivemind_search`).
- A **description** - natural-language text the client reads to decide *when* to call the tool. This is consumed by the model, so it must accurately reflect behavior; a misleading description causes the wrong tool to fire.
- An **input schema** - a JSON Schema describing the arguments. In the TypeScript SDK (`@modelcontextprotocol/sdk`), `McpServer.registerTool(name, { description, inputSchema }, handler)` accepts a zod schema for `inputSchema`, which the SDK converts to JSON Schema for the client.
- A **result** - the SDK convention is `{ content: [{ type: "text", text: string }, ...] }`. Tools can also signal errors; the simplest pattern (used by Hivemind) returns a human-readable error string in the same `content` shape rather than throwing.

## Documentation implication: the schema and description are part of the contract

Because the client selects and calls tools purely off the name, description, and schema, those three are the API contract. Documentation that paraphrases the description into something prettier-but-inaccurate, or that omits a schema constraint (a `min`/`max`, an `.optional()`), produces callers that build wrong requests. The honest move is to transcribe the zod schema field-for-field: name, type, required-vs-optional, constraints, default, and the `.describe(...)` text.

## Side effects must be stated

The spec distinguishes read-only tools from tools that mutate state (some clients surface this via annotations). For documentation, the rule is simpler: state plainly whether a tool writes anything. A read-only server (Hivemind's MCP server runs `SELECT`s and creates nothing) must say "no side effects"; a tool that lazily creates a table and inserts a row (OpenClaw's goal/KPI tools) must say it writes.

## Resources vs tools

MCP also defines **resources** (read-only addressable content the client can fetch). Hivemind currently exposes its memory via tools (`hivemind_read` takes a path argument) rather than as MCP resources, so the documentation surface here is tools. If resources are added later, document each with its URI template, MIME type, and what it returns.

## A practical tool-doc shape (six parts)

Synthesized from the SDK conventions, a complete tool doc carries: **name**, **purpose** (the verified description), **input schema** (transcribed from zod), **output shape** (what the `content` text actually contains, including empty/error cases), **side effects** (read-only vs writes), and **at least one example** call + response. This is the shape used by `templates/mcp-tool-doc.md`.

## Notes / caveats

- The exact JSON Schema the SDK emits from a zod schema can include constraints the prose forgets (integer-ness, bounds). Read the zod schema, not a summary of it.
- Transport (stdio, HTTP) is a protocol concern, not a tool-documentation concern - route transport questions to `mcp-protocol-worker-bee`.
- Error-reporting style (string-in-content vs thrown error vs `isError`) varies by server; document what the handler actually does.
