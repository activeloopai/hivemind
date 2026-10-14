---
name: mcp-protocol-stinger
description: MCP protocol authority for Hivemind - builds and audits MCP servers and tool contracts with @modelcontextprotocol/sdk. Covers tool vs resource vs prompt design, zod (v3) input schemas, stdio vs HTTP transport choice, JSON-RPC request/response/notification framing, error semantics (codes + messages), capability negotiation, stable tool contracts across the six harnesses, and the Hivemind server specifics (hivemind_search/read/index, credentials.json, mcp/bundle). Activate when the user says "audit this MCP server", "add a hivemind_ tool", "is this tool schema right?", "stdio or HTTP transport?", "what JSON-RPC error code?", "tool vs resource", "why does zod v4 break the schema?", or when reviewing src/mcp/server.ts, a tool handler, or a harness MCP config. Do NOT activate for Deeplake credential/OAuth lifecycle (security-worker-bee), process sandboxing/TLS (ci-release-worker-bee), or Deeplake query/schema internals (deeplake-dataset-worker-bee).
---

# mcp-protocol Stinger

Procedural arsenal for `mcp-protocol-worker-bee`, the MCP protocol authority for Hivemind.

This stinger encodes the reference material needed to build and audit Hivemind's MCP server and its tool contract against the MCP specification, `@modelcontextprotocol/sdk` ^1.29, and JSON-RPC 2.0. It is organized around eight concern areas, each with its own guide, plus templates for common deliverables and worked examples for the most frequent tasks. Ground truth is the actual server at `src/mcp/server.ts` (stdio transport, tools `hivemind_search` / `hivemind_read` / `hivemind_index`, `~/.deeplake/credentials.json` auth, built to `mcp/bundle/`, input schemas authored with `zod/v3`).

**Paired Bee:** `.cursor/agents/mcp-protocol-worker-bee.md`

---

## First action when this stinger is loaded

Read these in order before doing anything:

1. **`guides/00-principles.md`** - SDK-first reasoning; tool idempotency + side-effect declaration; tools vs resources vs prompts; JSON-RPC error-code honesty. This is the foundation every other guide builds on.
2. The guide most relevant to the current task (see index below).

Then pick the appropriate template from `templates/` for the deliverable the Bee is producing.

---

## Guide index

| Guide | Topic | When to open |
|---|---|---|
| `guides/00-principles.md` | SDK-first reasoning; idempotency; tools vs resources vs prompts; error-code honesty | Every invocation |
| `guides/01-transport.md` | stdio vs HTTP/SSE; why Hivemind uses stdio; stdout hygiene | Transport-choice questions; "stdio or HTTP?" |
| `guides/02-tool-design.md` | Tool vs resource vs prompt; anatomy of a Hivemind tool; descriptions | Designing or auditing a tool; "tool or resource?" |
| `guides/03-zod-schemas.md` | zod/v3 pin; raw-shape inputSchema; field rules; the v4 trap | Schema authoring; "why is the schema empty?" |
| `guides/04-error-model.md` | Two failure channels; JSON-RPC codes; fresh-org classification | Error reviews; "what code do I return?" |
| `guides/05-capability-negotiation.md` | initialize lifecycle; capabilities; what the SDK handles | Handshake questions; capability mismatches |
| `guides/06-multi-harness-contract.md` | The contract across Hermes/OpenClaw/pi/Claude Code/Codex/Cursor; breaking vs additive | Any change to tool names/shapes/output |
| `guides/07-testing-mcp.md` | Boundary-mock pattern; what every tool's tests must cover; Vitest | Writing or auditing MCP tests |

---

## Template index

| Template | Use when |
|---|---|
| `templates/findings-report.md` | Producing the MCP server / tool audit findings report |
| `templates/tool-contract-checklist.md` | Evaluating whether a tool is well-formed and contract-stable |
| `templates/error-channel-matrix.md` | Routing a failure to the correct channel (JSON-RPC error vs tool result) |
| `templates/transport-decision.md` | Choosing stdio vs HTTP, or diagnosing stdio hygiene |

---

## Example index

| Example | Shows |
|---|---|
| `examples/add-hivemind-tool.md` | Add a new `hivemind_*` tool with a zod/v3 schema, matching the contract |
| `examples/expose-a-resource.md` | Expose `/index.md` as an MCP resource (the tool-vs-resource decision) |
| `examples/test-mcp-tool.md` | Test an MCP tool with the Vitest boundary-mock pattern |

---

## Critical directives (lifted from Command Brief)

- **Cite the spec section or SDK symbol for every ruling.** Why: it is the only way the developer can verify the ruling and learn the principle, not just take the Bee's word.
- **Never conflate the JSON-RPC error channel with the tool-result channel.** Why: dressing a protocol fault as a success (or vice versa) is the MCP analog of HTTP "200 with error body" and poisons the agent's context.
- **The zod import at the SDK boundary MUST be `zod/v3`.** Why: the SDK generates tool JSON Schemas against v3 internals; v4 produces a wrong/empty schema and breaks param validation.
- **Treat tool names + arg shapes + parseable output as a cross-harness contract.** Why: Hermes, OpenClaw, pi, Claude Code, Codex, and Cursor all depend on them; a rename is breaking, not a refactor.
- **Do not audit Deeplake credential/OAuth lifecycle** - hand off to `security-worker-bee`. **Do not audit Deeplake query/schema internals** - hand off to `deeplake-dataset-worker-bee`.

---

## Key Hivemind ground truth

- **Server:** `src/mcp/server.ts`, stdio transport, built to `mcp/bundle/`. Constructs `McpServer({ name: "hivemind", version: getVersion() })`.
- **Tools:** `hivemind_search { query, limit? }`, `hivemind_read { path }`, `hivemind_index { prefix?, limit? }` - all read-only.
- **Auth:** loads `~/.deeplake/credentials.json`; missing creds short-circuit to "Not authenticated. Run `hivemind login`...".
- **Schemas:** authored with `import * as z from "zod/v3"`; raw-shape `inputSchema`, each field `.describe(...)`.
- **Error model:** domain outcomes via `errorResult(text)`; fresh-org missing-TABLE 400 classified into the empty-memory hint (issue #252), not leaked raw; non-Error rejections coerced via `String(err)`.
- **Consumers:** Hermes (`mcp_servers.hivemind`), OpenClaw (contracts `hivemind_search/read/index` + `goal_add`/`kpi_add`), pi (extension registers `hivemind_search/read/index`), plus Claude Code, Codex, Cursor.
- **Tests:** `tests/claude-code/mcp-server.test.ts` (Vitest ^4) - boundary-mock pattern, registration-shape contract guard, real SQL-escaping helpers.

---

## Folder layout

```
mcp-protocol-stinger/
+- SKILL.md                           (this file - master index)
+- README.md                          (one-page human overview)
+- guides/
|  +- 00-principles.md                (SDK-first reasoning; idempotency; primitives; error honesty)
|  +- 01-transport.md                 (stdio vs HTTP; Hivemind's stdio choice; stdout hygiene)
|  +- 02-tool-design.md               (tool vs resource vs prompt; anatomy of a Hivemind tool)
|  +- 03-zod-schemas.md               (zod/v3 pin; raw-shape inputSchema; the v4 trap)
|  +- 04-error-model.md               (two channels; JSON-RPC codes; fresh-org classification)
|  +- 05-capability-negotiation.md    (initialize lifecycle; capabilities; SDK responsibilities)
|  +- 06-multi-harness-contract.md    (contract stability across the six harnesses)
|  +- 07-testing-mcp.md               (boundary-mock Vitest pattern; required coverage)
+- examples/
|  +- add-hivemind-tool.md            (new hivemind_* tool with a zod/v3 schema)
|  +- expose-a-resource.md            (expose /index.md as an MCP resource)
|  +- test-mcp-tool.md                (test an MCP tool with Vitest)
+- templates/
|  +- findings-report.md              (audit output template)
|  +- tool-contract-checklist.md      (tool well-formedness + contract stability)
|  +- error-channel-matrix.md         (JSON-RPC error vs tool-result routing)
|  +- transport-decision.md           (stdio vs HTTP + stdio hygiene)
+- reports/
|  +- README.md                       (how audit findings accumulate)
+- research/                          (MCP SDK + protocol notes, dated 2026-06-16)
   +- research-plan.md
   +- research-summary.md
   +- index.md
   +- 2026-06-16-mcp-spec-lifecycle.md
   +- 2026-06-16-mcp-sdk-typescript.md
   +- 2026-06-16-zod-v3-mcp-pin.md
   +- 2026-06-16-jsonrpc-error-model.md
   +- 2026-06-16-mcp-tool-contract-stability.md
   +- 2026-06-16-vitest-mcp-testing.md
```

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
