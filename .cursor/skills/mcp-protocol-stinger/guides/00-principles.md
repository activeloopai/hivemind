# 00 - Principles

Core reasoning model for every MCP server and tool-contract audit in Hivemind.

---

## SDK-first reasoning

MCP semantics are defined by the protocol spec and pinned by the SDK, not by framework convention. Before ruling on any MCP concern, ask: "What does the spec / `@modelcontextprotocol/sdk` say?" The hierarchy is:

1. **MCP specification (modelcontextprotocol.io)** - the normative source for the lifecycle (initialize, capability negotiation), the three primitives (tools, resources, prompts), and the JSON-RPC 2.0 message shapes.
2. **JSON-RPC 2.0** - the wire contract underneath every MCP message: request, response, notification framing, and the error object (`code` + `message` + optional `data`).
3. **`@modelcontextprotocol/sdk` ^1.29** - the implementation Hivemind ships against (`src/mcp/server.ts`). `McpServer.registerTool(name, config, handler)` is the registration surface; `StdioServerTransport` is the transport. The SDK's runtime behavior is binding for this repo.
4. **`zod/v3`** - input schemas are authored with `import * as z from "zod/v3"`. The SDK pins v3 schema shapes; even though the package depends on `zod` ^4, the MCP server imports `zod/v3` deliberately. Authoring tool input schemas with v4 shapes is a defect.
5. **Hivemind server specifics** - the three tools (`hivemind_search`, `hivemind_read`, `hivemind_index`), `~/.deeplake/credentials.json` auth, and the `mcp/bundle/` build output. These are the concrete contract this stinger audits against.

**Cite the spec section or the SDK symbol, not just "MCP says so."** "The SDK's `registerTool` config takes `inputSchema` as a raw zod shape" is auditable; "the protocol requires it" is not.

---

## Tool idempotency and side-effect declaration

(Transferable from HTTP idempotency, reframed for MCP.)

A tool's idempotency is not enforced by the protocol - it is a property of the handler you write, and consumers reason about it. State it explicitly.

| Property | Definition | Hivemind example |
|---|---|---|
| **Read-only** | The tool causes no state change. Safe to call repeatedly, safe to retry on transport error. | `hivemind_search`, `hivemind_read`, `hivemind_index` are all read-only - the MCP server runs as a READ-role member and could not `CREATE TABLE` anyway. |
| **Idempotent** | Calling N times produces the same backend state as calling once. | A hypothetical `hivemind_index_rebuild` keyed on a content hash would be idempotent; an append-style tool would not. |
| **Side-effecting / non-idempotent** | Each call can change state differently (append, increment, send). | OpenClaw's contracted `goal_add` / `kpi_add` write new rows; they are not idempotent, so retries can duplicate. |

Implications:
- Read-only tools should say so in their `description` so the agent (and the harness retry logic) can call them freely.
- A side-effecting tool that the agent might retry on a transport hiccup needs an idempotency strategy (client-supplied key, dedupe on content) or an explicit "this writes; do not blind-retry" note.
- The MCP tool-annotation surface (`readOnlyHint`, `destructiveHint`, `idempotentHint` in newer SDK builds) is the structured way to declare this. When unavailable, encode it in the description text.

---

## Tools vs resources vs prompts (the MCP uniform interface)

(Transferable from "REST vs RPC", reframed.) MCP exposes three primitives. Choosing the wrong one is the MCP analog of putting a verb in a REST URL.

1. **Tools** - callable functions with a JSON Schema (from zod) input. The model decides to invoke them. Use for actions and parameterized queries: `hivemind_search { query, limit? }` is a tool because the model supplies arguments and triggers execution.
2. **Resources** - readable, addressable content identified by a URI, listed and fetched by the client. Use for stable, enumerable context the client pulls without "calling." A Hivemind `/index.md` or a specific summary path is conceptually resource-shaped; today it is reached through the `hivemind_read` tool instead.
3. **Prompts** - reusable, parameterized message templates the user can invoke. Hivemind does not currently expose prompts.

Rule of thumb: **if the model must decide arguments and trigger a side effect or a search, it is a tool. If the client should be able to enumerate and read addressable content directly, it is a resource. If it is a canned interaction the user picks, it is a prompt.** Hivemind chose tools for everything because the six harnesses drive recall by model-initiated calls, and a single tool call returns ranked hits across all summaries and sessions in one SQL query.

---

## JSON-RPC error-code honesty

(Transferable from "status-code honesty", reframed.) The MCP analog of the "200 with error body" anti-pattern is **returning a successful tool result whose text says "error" instead of signaling the failure through the right channel.**

Two distinct failure channels exist, and conflating them is the core defect:

1. **Protocol-level JSON-RPC errors** - malformed request, unknown method, invalid params. These travel as a JSON-RPC `error` object with a numeric `code` (e.g. `-32602` Invalid params, `-32601` Method not found, `-32700` Parse error) and a `message`. The SDK raises these for you on schema-validation failure.
2. **Tool-execution results** - a tool that ran but produced a domain outcome (no matches, not authenticated, backend down). MCP models these as a normal tool result, optionally with `isError: true` in the content, so the model sees the failure in-band.

Honesty rules:
- **Do not throw a JSON-RPC error for a normal domain outcome.** Hivemind returns "No matches for ..." as ordinary tool-result text, not a `-32603`; that is correct, because "nothing found" is not a protocol fault.
- **Do not bury a real protocol fault inside a success result.** If the params fail the zod schema, let the SDK reject with `-32602`; do not catch it and hand back a cheerful "ok" content block.
- **Never leak a raw backend error string as if it were a clean result.** Hivemind classifies the Deeplake "table does not exist" 400 into the fresh-org hint (issue #252) rather than surfacing the raw 400; the agent reads tool output verbatim, so an unclassified `Index failed: 400: {...}` poisons the recall context.
- **`message` must be honest and actionable.** "Not authenticated. Run `hivemind login`..." tells the agent and the user exactly what to do.

---

## Boundary with peer Bees

| Concern | Owner |
|---|---|
| Deeplake auth token lifecycle, OAuth flows, credential storage hardening | `security-worker-bee` |
| TLS / process sandboxing / where the stdio subprocess runs | `ci-release-worker-bee` |
| MCP tool/resource/prompt contract shape, JSON-RPC framing, zod input schemas | `mcp-protocol-worker-bee` (this Bee) |
| JSON-RPC error-code honesty and the result-vs-error channel choice | `mcp-protocol-worker-bee` |
| Injection-safe SQL inside tool handlers (OWASP-level) | `security-worker-bee` (flag here; hand off) |
| Deeplake query semantics, table schema, vector search internals | `deeplake-dataset-worker-bee` |

---

*Sources: `research/2026-06-16-mcp-spec-lifecycle.md`, `research/2026-06-16-mcp-sdk-typescript.md`, `research/2026-06-16-jsonrpc-error-model.md`*
