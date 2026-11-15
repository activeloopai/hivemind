# Research Summary: mcp-protocol-stinger

Date: 2026-06-16.

---

## Depth Tier

**normal** - 6 structured source notes grounded in the MCP spec, the TypeScript SDK ^1.29, JSON-RPC 2.0, and Hivemind's own server + tests + harness consumers.

## Files Written

| File | Topic |
|---|---|
| `2026-06-16-mcp-spec-lifecycle.md` | lifecycle, three primitives, capability negotiation |
| `2026-06-16-mcp-sdk-typescript.md` | `McpServer`, `registerTool`, transports, content shape |
| `2026-06-16-zod-v3-mcp-pin.md` | why the server imports `zod/v3` despite zod ^4 |
| `2026-06-16-jsonrpc-error-model.md` | the two failure channels and standard codes |
| `2026-06-16-mcp-tool-contract-stability.md` | the contract across Hermes/OpenClaw/pi/Claude Code/Codex/Cursor |
| `2026-06-16-vitest-mcp-testing.md` | the boundary-mock test pattern |

---

## Most Influential Findings

1. **The server is the contract.** `src/mcp/server.ts` exposes exactly `hivemind_search`, `hivemind_read`, `hivemind_index` over stdio, loads `~/.deeplake/credentials.json`, and builds to `mcp/bundle/`. Those three names + shapes are duplicated (deliberately) into the pi extension and described in the Hermes skill doc - they are a cross-harness contract, not an implementation detail.

2. **The zod v3 pin is load-bearing.** `import * as z from "zod/v3"` is correct even though `package.json` depends on zod ^4; the SDK generates tool JSON Schemas against v3 internals. Importing v4 at the SDK boundary is a defect.

3. **Two failure channels.** Protocol faults (bad params) => JSON-RPC `-32602` (SDK-raised). Domain outcomes (empty, unauthenticated, fresh org, backend error) => normal tool results via `errorResult`. The fresh-org classification (issue #252) is the canonical example of not leaking a raw backend 400 into agent context.

4. **stdio is the right transport.** Local, per-user credentials, client-spawned subprocess. stdout is reserved for the JSON-RPC frame stream; logs go to stderr.

5. **The test pins the contract.** The registration-shape test asserts the exact three-tool set, doubling as a contract-drift guard; SQL-escaping helpers are kept real so injection guards are genuinely tested.

---

## Open Questions for the User

1. **Resources vs tools-only:** should `/index.md` (and maybe whole-summary reads) be exposed as MCP resources for deterministic client-startup pulls, or stay tool-only? See `examples/expose-a-resource.md`.
2. **Side-effecting tools on the MCP server:** OpenClaw contracts `goal_add`/`kpi_add` today (OpenClaw-side). If they migrate onto the MCP server, do they need idempotency keys to survive agent retries?
3. **Tool annotations:** should the three recall tools carry explicit `readOnlyHint: true` annotations now that the SDK supports them, rather than relying on description text?
4. **HTTP transport:** is a shared/remote Hivemind MCP endpoint on any roadmap? If so, credential handling moves from a local file to per-request auth (a `security-worker-bee` concern).
