---
name: harness-integration-stinger
description: Hivemind multi-harness integration specialist. Covers adding and auditing harness adapters across the six supported coding assistants (Claude Code, Codex, Cursor, Hermes, pi, OpenClaw), capability detection and auto-install (src/cli/install-*.ts), per-host wiring (hooks vs extension vs MCP vs AGENTS.md marker), the capture/recall hook lifecycle, the shared-core + per-harness-bundle build model, MCP server registration (hermes), contracted tools (openclaw), and keeping the tool/hook contract stable across hosts. Use when the user says "wire a new harness", "add a hook event", "register the MCP server in hermes", "audit a harness adapter", "the OpenClaw bundle fails ClawHub scan", "capability detection for install", or when harness-integration-worker-bee is invoked. Do NOT use for Deep Lake dataset schema (deeplake-dataset-stinger), embeddings runtime (embeddings-runtime-stinger), MCP protocol internals beyond registration (mcp-protocol-stinger), or CI/CD pipeline topology (ci-release-stinger).
---

# harness-integration-stinger

The integration playbook for `harness-integration-worker-bee`. Encodes how Hivemind plugs into six coding assistants through one shared core (`src/`), per-agent installers (`src/cli/install-*.ts`), and per-agent build outputs (`harnesses/<agent>/`) - from a fresh adapter to a ClawHub-clean OpenClaw bundle.

## Quick navigation

| Task | Guide |
|---|---|
| Understand the shared-core + per-harness-bundle model, pick a wiring mechanism | `guides/00-architecture-and-wiring.md` |
| Add or audit capability detection + auto-install | `guides/01-capability-detection-install.md` |
| Wire the capture/recall hook lifecycle (Claude Code, Codex, Cursor, Hermes) | `guides/02-hook-lifecycle.md` |
| Keep the hivemind_search/read/index tool contract stable | `guides/03-tool-contract.md` |
| Wire a native extension (Cursor VS Code, pi TS, OpenClaw) | `guides/04-extension-adapters.md` |
| Register the MCP server in hermes | `guides/05-mcp-registration.md` |
| Ship the Claude Code marketplace plugin and a ClawHub-clean OpenClaw bundle | `guides/06-distribution-and-audit.md` |

## Critical directives

These are the non-negotiables. Violating any of them is the most common cause of a broken harness adapter. See the relevant guide for code patterns.

1. **Keep the tool and command contract identical across every host.** `hivemind_search`/`hivemind_read`/`hivemind_index` (plus `hivemind_goal_add`/`hivemind_kpi_add` on OpenClaw) must have the same name, args, and return shape everywhere. A drift in one host silently breaks cross-harness recall. Source: `research/external/2026-06-16-tool-contract.md`.

2. **Hooks must be fast and fail-open.** Capture hooks run on the agent's critical path. Honor the per-event timeout (SessionStart 10s, PreToolUse 60s, capture 10-30s), dispatch heavy work `async: true`, and never let a hook crash block the host. Source: `research/external/2026-06-16-hook-lifecycle.md`.

3. **Capability detection must be cheap and side-effect free.** `hivemind install` auto-detects each assistant by probing for its home dir / binary (`~/.claude/projects`, `~/.codex`, `~/.cursor`, `~/.hermes`, `~/.pi`, OpenClaw). Detection runs on every install; it must not write files or spawn work. Source: `research/external/2026-06-16-capability-detection.md`.

4. **Never hardcode bundle paths - resolve them per host.** Claude Code forks `node "${CLAUDE_PLUGIN_ROOT}/bundle/<entry>.js"`; Cursor/Hermes use `~/.<host>/hivemind/bundle/`. Use the host's own root variable so the marketplace plugin and local installs both resolve correctly. Source: `research/external/2026-06-16-architecture-build.md`.

5. **The OpenClaw bundle must pass the ClawHub static scanner.** ClawHub forbids bare `spawn`/`execFileSync`. Route subprocess access through `createRequire`-based indirection (see `src/skillify/gate-runner.ts` comments and `scripts/audit-openclaw-bundle.mjs`) or the bundle is rejected. Source: `research/external/2026-06-16-openclaw-clawhub.md`.

6. **Register the MCP server only where the host supports it.** Hermes wires the MCP server (`src/mcp/server.ts`) under `mcp_servers.hivemind` in `~/.hermes/config.yaml`. Do not assume every host has an MCP transport - Claude Code and Cursor use hooks; pi/OpenClaw use native extensions. Source: `research/external/2026-06-16-mcp-registration.md`.

7. **pi ships raw TypeScript; do not pre-compile it.** `harnesses/pi/extension-source/hivemind.ts` is delivered as `.ts` and pi compiles it at load. Bundling or transpiling it in the installer breaks the load path. Source: `research/external/2026-06-16-pi-extension.md`.

## Scope note

This stinger covers the **integration surface**: the six harness adapters, their wiring mechanisms (hooks, native extensions, MCP, AGENTS.md marker), capability detection, the build model, and the tool/hook contract. It does **not** cover the Deep Lake dataset schema, the embeddings runtime, retrieval ranking internals, or MCP wire-protocol details beyond registration - route those to the relevant stinger (`deeplake-dataset-stinger`, `embeddings-runtime-stinger`, `retrieval-stinger`, `mcp-protocol-stinger`).

## Handoff map

- Deep Lake `sessions`/`summaries` table schema and the capture write path internals: route to `deeplake-dataset-stinger`.
- Embeddings model selection, batching, runtime cost: route to `embeddings-runtime-stinger`.
- MCP protocol internals (tool schemas, transport framing) beyond hermes registration: route to `mcp-protocol-stinger`.
- Bundling/esbuild pipeline topology and release CI: route to `ci-release-stinger`.
- Login device flow and token vault security audit: route to `security-stinger`.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
