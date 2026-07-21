# Integration Model

> Category: Plugins | Version: 1.0 | Date: June 2026 | Status: Active

How each of the six supported coding assistants is wired to Hivemind: the distribution channel, the installation path, the capture and recall mechanism, and the notable behavioral differences between agents.

**Related:**
- [`hook-lifecycle.md`](hook-lifecycle.md)
- [`mcp-and-extension-surfaces.md`](mcp-and-extension-surfaces.md)
- [`../architecture/system-overview.md`](../architecture/system-overview.md)
- [`../architecture/session-lifecycle.md`](../architecture/session-lifecycle.md)
- [`../infrastructure/monorepo-build-release.md`](../infrastructure/monorepo-build-release.md)
- [`../overview.md`](../overview.md)
- [`../../../../docs/ARCHITECTURE.md`](../../../../docs/ARCHITECTURE.md)

---

## Why six different mechanisms

No two coding assistants expose the same extension surface. Claude Code offers a first-party marketplace that injects plugins into its hook pipeline. Codex and Cursor both use a `hooks.json` convention but differ in payload shapes and in whether `additionalContext` is model-only or also user-visible. OpenClaw has a native extension contract with its own gateway process. Hermes wires through shell hooks plus an MCP server. pi combines a TypeScript extension with a static `AGENTS.md` block.

The Hivemind answer is the same in every case: map the assistant's native lifecycle events onto the shared `capture.ts` and recall logic in `src/`, emit the same row format to Deeplake, and confine all per-agent differences to the thin shims under `src/hooks/{codex,cursor,hermes,pi}/`. Adding a new assistant means writing a new shim, not a new memory engine.

---

## Integration table

The table below expands `docs/ARCHITECTURE.md` with the install path, distribution channel, additionalContext visibility, and the specific behavioral gaps that exist at each integration point.

| Agent | Mechanism | Install path | Distribution | Context visibility | Notes |
|---|---|---|---|---|---|
| Claude Code | Marketplace plugin | `~/.claude/plugins/hivemind/` | Claude Code Marketplace | Model-only (`additionalContext`) | Reference implementation. Full hook set. Rules and goals injected every SessionStart. |
| Codex | `~/.codex/hooks.json` | `~/.codex/hooks.json` + bundle | npm (`@deeplake/hivemind`) | User-visible (`hook context: <text>` in TUI) | Async setup spawned as a detached process because Codex has no async hook channel. Rules/goals block deliberately omitted to avoid TUI clutter. |
| Cursor (1.7+) | `~/.cursor/hooks.json` | `~/.cursor/hooks.json` + bundle | npm | Model-only (`additional_context`) | Fully parallel to Claude Code. Goals injected via CLI variant because Cursor's PreToolUse only intercepts Shell, not Write/Edit. |
| OpenClaw | Native extension | `~/.openclaw/extensions/hivemind/` | ClawHub | Model-only (via `before_prompt_build` system context) | Event-driven: `agent_end` for capture, `before_agent_start` for recall. No PreToolUse VFS intercept; exposes agent-facing `hivemind_search`/`hivemind_read`/`hivemind_index` tools directly. |
| Hermes | Shell hooks + MCP server | `~/.hermes/skills/hivemind-memory/` | npm | User-visible in TUI (same wire as `context`) | MCP tools (`hivemind_search`, `hivemind_read`, `hivemind_index`) registered alongside the shell hooks. Recall via grep on `~/.deeplake/memory/` or MCP. |
| pi | `~/.pi/agent/AGENTS.md` + TypeScript extension | `~/.pi/agent/hivemind/` | npm (raw `.ts`, compiled by pi) | Depends on pi configuration | No PreToolUse intercept available. Recall via grep on `~/.deeplake/memory/`. Wiki worker shelled via `pi --print`. |

---

## Claude Code: the reference implementation

Claude Code is the integration Hivemind was designed around. The plugin lives at `~/.claude/plugins/hivemind/` and is distributed through the Claude Code Marketplace. It wires every available lifecycle event: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`, and `SessionEnd`.

The `additionalContext` field in Claude Code's SessionStart response is invisible to the user and injected directly into the model's system prompt. This lets the full memory-usage instructions, rules block, goals block, skillify commands, and graph context line land in context without cluttering the conversation.

The reference hook files are `src/hooks/session-start.ts`, `src/hooks/capture.ts`, `src/hooks/pre-tool-use.ts`, and `src/hooks/session-end.ts`. All per-agent variants are intentional derivations from these.

---

## Codex: async setup and minimal injection

Codex reads `~/.codex/hooks.json` and spawns each hook as a subprocess. Unlike Claude Code, there is no async hook channel, so the Codex SessionStart (`src/hooks/codex/session-start.ts`) immediately returns a minimal context string and fires the heavyweight work (table creation, placeholder write, version check) as a separate detached process via `session-start-setup.js`.

Codex's `additionalContext` is rendered as `hook context: <text>` in the user-facing TUI history cell alongside both model context and user-visible entries. Because of this, the bulky memory-usage instructions and the rules/goals block that Claude Code injects are deliberately omitted for Codex. The Codex agent discovers memory tiers via `hivemind --help` and shell commands on demand.

The PreToolUse hook (`src/hooks/codex/pre-tool-use.ts`) intercepts only `Bash` tool calls, not Read/Grep/Glob, matching Codex's narrower tool surface.

---

## Cursor: parallel to Claude Code with CLI goal routing

Cursor 1.7+ supports a `~/.cursor/hooks.json` convention with the same lifecycle event names as Claude Code (lowercase: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterAgentResponse`, `stop`, `sessionEnd`). The Cursor shim (`src/hooks/cursor/`) is structurally the same as the Claude Code reference, with two differences.

First, `additionalContext` in Cursor's SessionStart response is stored under the key `additional_context` (snake_case). It is injected as model-only context, so the full memory block and rules/goals are safe to include.

Second, Cursor's PreToolUse only intercepts Shell tool calls. It cannot intercept Write or Edit on the memory path, so the goal management instructions use the CLI variant (`hivemind goal add/list/...` invoked as shell commands) rather than the Write-tool-intercept pattern available in Claude Code.

---

## OpenClaw: native extension with contracted tools

OpenClaw loads plugins from `~/.openclaw/extensions/hivemind/` as a native extension using a synchronous `register(pluginApi)` entry point defined in `harnesses/openclaw/src/index.ts`. The `register` function must return synchronously; all async work executes inside a fire-and-forget IIFE.

The extension wires two hook events via `pluginApi.on(event, handler)`:

- `before_prompt_build`: injects the SKILL.md body and any update/setup nudges into the system prompt as `prependSystemContext` so they hit the provider's prompt-cache path.
- `before_agent_start`: handles the login nudge (device-flow URL) and the post-auth welcome banner.
- `agent_end`: captures new messages from the conversation into the `sessions` table and fires the skillify worker.

OpenClaw has no PreToolUse analog. Instead, the extension registers three agent-facing tools (`hivemind_search`, `hivemind_read`, `hivemind_index`) plus two write tools (`hivemind_goal_add`, `hivemind_kpi_add`) via `pluginApi.registerTool`. The SKILL.md body embedded at build time (`__HIVEMIND_SKILL__` constant) instructs the agent to call `hivemind_search` before answering questions about past work. OpenClaw also registers a `MemoryCorpusSupplement` so other OpenClaw plugins that expose a `memory_search` tool can federate queries into Hivemind automatically.

Because OpenClaw's bundle scanner treats any `process.env` access in a file that also calls `fetch()` as `env-harvesting`, all `HIVEMIND_*` environment reads are rewritten by esbuild's `define` to `globalThis.__hivemind_tuning__?.HIVEMIND_X`, and `applyOpenclawTuning` bridges the user's `openclaw.json` plugin config into that global.

---

## Hermes: shell hooks plus MCP

Hermes wires Hivemind through a skill directory at `~/.hermes/skills/hivemind-memory/` that contains both shell hook scripts and an MCP server registration. The shell hooks fire on Hermes's event names and relay context via `{ context: "..." }` on stdout. The MCP server (`src/mcp/server.ts`) is spawned as a stdio subprocess and exposes `hivemind_search`, `hivemind_read`, and `hivemind_index` as MCP tools.

The Hermes session-start hook (`src/hooks/hermes/session-start.ts`) is structurally identical to the Cursor variant: it authenticates, heals token drift, runs `autoUpdate`, creates a placeholder row, renders the rules/goals block, pulls skills, fires the graph pull worker, and returns the full context string. The key difference is that Hermes's context field is user-visible in the TUI, so longer injections are somewhat more prominent than in Claude Code or Cursor.

Hermes's PreToolUse intercepts only the `terminal` tool, not Write or Edit. Goals are therefore routed via the CLI variant, same as Cursor.

---

## pi: TypeScript extension and AGENTS.md

pi loads the Hivemind extension from `~/.pi/agent/hivemind/` as raw TypeScript files that pi compiles at load time. There is no pre-compiled bundle; the extension source ships in `harnesses/pi/` under version control. A static `AGENTS.md` block at `~/.pi/agent/AGENTS.md` provides recall instructions that pi injects into every session's system context.

pi has no PreToolUse hook. Recall happens via grep on `~/.deeplake/memory/`, as documented in the `AGENTS.md` block. The wiki worker (`src/hooks/pi/wiki-worker.ts`) is invoked by the extension and shells out to `pi --print --provider <p> --model <m>` for summary generation, using pi's non-interactive mode so it does not recurse back into the extension.

---

## Shared behavioral invariants

Despite the mechanism differences, every integration shares the same invariants enforced by the shared core:

- Every hook exits 0 on error. A crash or timeout in any hook must never break the user's session.
- Capture is gated by `HIVEMIND_CAPTURE !== "false"`. When that flag is set, the hook runs read-only: no DDL, no INSERTs.
- User-facing notices go through the SessionStart banner channel. Hooks never write error text into `additionalContext`, because arbitrary text in context is a prompt-injection risk.
- Each INSERT writes exactly one row per event, never concatenating events into a shared row, to prevent write races.
- All writes use the immutable version-bumped pattern for rules, skills, goals, and KPIs to avoid Deeplake's UPDATE-coalescing quirk.
