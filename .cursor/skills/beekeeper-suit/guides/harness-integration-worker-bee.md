# Harness Integration Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `harness-integration-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/harness-integration-worker-bee.md`](../../../agents/harness-integration-worker-bee.md)
**Stinger:** [`.cursor/skills/harness-integration-stinger/`](../../harness-integration-stinger/)
**Trigger policy:** proactive

---

## Domain

`harness-integration-worker-bee` owns Hivemind's multi-harness integration surface: the shared core (`src/`) plus per-agent installers (`src/cli/install-*.ts`) and per-agent build outputs (`harnesses/<agent>/`) that wire Hivemind into Claude Code, Codex, Cursor, Hermes, pi, and OpenClaw. It covers capability detection and auto-install, the choice of wiring mechanism per host (lifecycle hooks vs native extension vs MCP server vs `AGENTS.md` marker block), the capture/recall hook lifecycle, MCP server registration (hermes), contracted tools (OpenClaw), and keeping the `hivemind_search`/`read`/`index` tool and command contract identical across every host. It defers to the dataset, embeddings, MCP-protocol, and CI Bees for their respective internals.

## Trigger phrases

Route to `harness-integration-worker-bee` when the user says any of:

- "Wire a new harness" / "audit a harness adapter"
- "Add a hook event"
- "Register the MCP server in hermes" / "capability detection"
- "Fix capability detection in install" / "install-*.ts"
- "The OpenClaw bundle fails ClawHub" / "ClawHub bundle audit"

Or when the harness integration surface (installers, hooks, native extensions, MCP registration, the AGENTS.md marker, the cross-host tool contract) is in scope.

## Do NOT route when

- The user wants the Deep Lake dataset schema - that is `deeplake-dataset-worker-bee`.
- The user wants the embeddings runtime - that is `embeddings-runtime-worker-bee`.
- The user wants MCP wire-protocol internals beyond registration (tool design, transport, error model) - that is `mcp-protocol-worker-bee`. This Bee wires the host; the protocol Bee owns the contract.
- The user wants the bundling or release CI topology - that is `ci-release-worker-bee`.
- The user wants the Cursor-specific platform surface (hooks.json, the Cursor extension, the .cursor/ Bee Army layout) - that is `cursor-ide-worker-bee`. This Bee owns the other five hosts; cursor-ide owns the Cursor one.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The host(s) in scope (Claude Code, Codex, Cursor, Hermes, pi, OpenClaw).
- The integration concern: an installer, a hook event, capability detection, MCP registration, or a contract-stability check.
- Access to the relevant `src/cli/install-*.ts` and `harnesses/<agent>/` paths.

If the host or the integration concern is missing, do not invoke yet - ask the user which host and what they are wiring.

## Outputs the Bee produces

- New or audited per-host adapters (installers, hooks, native extensions, MCP registration).
- Capability-detection fixes that stay cheap and side-effect free.
- Cross-harness contract-stability findings (tool name/args/return shape parity across all six hosts).

## Multi-Bee sequences this Bee participates in

- **MCP feature build** - after `mcp-protocol-worker-bee` lands the tool contract and `mcp-tool-docs-worker-bee` documents it, `harness-integration-worker-bee` registers it across the six hosts.
- **Plan execution loop** - the implementation Bee whose change `security-worker-bee` then `quality-worker-bee` close out.

## Critical directives the orchestrator should respect

- **Keep the tool and command contract identical across every host** - a one-host-only contract change is a Critical cross-harness recall break.
- **Hooks must be fast and fail-open** - heavy work dispatched `async: true`; a hook crash must never block the host.
- **Capability detection must be cheap and side-effect free** - detection that writes files or spawns work is Critical.
- **Never hardcode bundle paths** - resolve per host (`${CLAUDE_PLUGIN_ROOT}`, `~/.<host>/hivemind/bundle/`).
- **The OpenClaw bundle must pass the ClawHub static scanner** - no bare `spawn`/`execFileSync`.
- **pi ships raw TypeScript; do not pre-compile it.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
