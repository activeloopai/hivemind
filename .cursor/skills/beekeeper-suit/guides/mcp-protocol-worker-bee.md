# MCP Protocol Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `mcp-protocol-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/mcp-protocol-worker-bee.md`](../../../agents/mcp-protocol-worker-bee.md)
**Stinger:** [`.cursor/skills/mcp-protocol-stinger/`](../../mcp-protocol-stinger/)
**Trigger policy:** proactive

---

## Domain

`mcp-protocol-worker-bee` owns the MCP protocol surface and tool-contract correctness for Hivemind. It builds and audits MCP servers and tool contracts with `@modelcontextprotocol/sdk`: the choice between MCP primitives (tools, resources, prompts), tool design and naming, zod/v3 input schemas, stdio vs HTTP transport, the JSON-RPC 2.0 framing underneath MCP, error semantics (the JSON-RPC error channel vs the tool-result channel, standard codes, honest messages), capability negotiation at initialize, and the stability of the tool contract across the six consuming harnesses. It is grounded in the actual Hivemind server (`src/mcp/server.ts`): tools `hivemind_search` / `hivemind_read` / `hivemind_index`, `~/.deeplake/credentials.json` auth, `zod/v3` schemas, stdio transport, built to `mcp/bundle/`.

## Trigger phrases

Route to `mcp-protocol-worker-bee` when the user says any of:

- "Audit this MCP server" / "audit MCP server"
- "Add a hivemind_ tool" / "is this tool schema right?"
- "Tool schema (zod/v3)" / "why does zod v4 break the schema?"
- "stdio or HTTP transport?"
- "What JSON-RPC error code do I return?"
- "Tool vs resource"

Or when the request implicitly involves building or auditing an MCP server, tool contracts, transport, or the JSON-RPC error model.

## Do NOT route when

- The user wants to *document* an existing MCP tool (name/purpose/schema/output/examples) - that is `mcp-tool-docs-worker-bee`. This Bee builds and audits the protocol; the docs Bee describes it.
- The user wants to *wire* the MCP server into a host (registration, installers, capability detection) - that is `harness-integration-worker-bee`. This Bee owns the protocol internals; harness-integration owns plugging it into hosts.
- The user wants Deep Lake credential or OAuth lifecycle - that is `security-worker-bee` (and the schema/query internals are `deeplake-dataset-worker-bee`).
- The user wants process sandboxing, TLS, or build/release topology - that is `ci-release-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The MCP server or tool handler in scope (`src/mcp/server.ts` or a specific handler).
- The protocol decision: a new tool, a schema review, a transport choice, or an error-code question.
- Optional: the consuming harnesses affected by a contract change.

If the server or tool in scope is missing, do not invoke yet - ask the user to point at the handler.

## Outputs the Bee produces

- MCP server and tool-contract audit findings, each citing the spec section, SDK symbol, or JSON-RPC code.
- New or corrected zod/v3 input schemas and tool handlers.
- Transport and error-model rulings (two-channel separation, capability negotiation).

## Multi-Bee sequences this Bee participates in

- **MCP feature build** - `mcp-protocol-worker-bee` designs and audits the tool contract; `mcp-tool-docs-worker-bee` documents it; `harness-integration-worker-bee` registers it across the six hosts; `security-worker-bee` then `quality-worker-bee` close out.

## Critical directives the orchestrator should respect

- **Cite the spec section, SDK symbol, or JSON-RPC code for every ruling.**
- **Never conflate the JSON-RPC error channel with the tool-result channel** - the MCP analog of HTTP "200 with error body".
- **The zod import at the SDK boundary MUST be `zod/v3`** - the SDK generates JSON Schemas against v3 internals; v4 yields a wrong/empty schema.
- **Treat tool names, argument shapes, and parseable output as a cross-harness contract** - a rename is breaking, not a refactor.
- **Do not audit Deep Lake credential/OAuth lifecycle or query/schema internals** - hand off to the right Bee.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
