# System Overview

> Category: Architecture | Version: 1.0 | Date: June 2026 | Status: Active

How Hivemind is laid out as a monorepo, the major subsystems, and how a shared core fans out into six per-agent integrations backed by a single Deeplake substrate.

**Related:**
- [`session-lifecycle.md`](session-lifecycle.md)
- [`../overview.md`](../overview.md)
- [`../plugins/integration-model.md`](../plugins/integration-model.md)
- [`../data/deeplake-tables-schema.md`](../data/deeplake-tables-schema.md)
- [`../ai/session-capture.md`](../ai/session-capture.md)
- [`../../../../docs/ARCHITECTURE.md`](../../../../docs/ARCHITECTURE.md)

---

## Why the architecture looks like this

Hivemind has to live inside six different coding assistants that share almost nothing at the integration layer. Claude Code wants a marketplace plugin; Codex and Cursor want a `hooks.json`; OpenClaw wants a native extension; Hermes wants shell hooks plus an MCP server; pi wants a TypeScript extension and an `AGENTS.md` block. The architecture answers that fragmentation with a single rule: write the memory logic once, then wrap it per agent. Everything durable and agent-agnostic lives in `src/`, and each assistant gets a thin shim that maps its native lifecycle events onto the same capture and recall calls.

That choice keeps the surface area honest. Adding a new assistant means writing a new shim, not a new memory engine. Fixing a capture bug means editing the shared core, and every agent inherits the fix on its next build.

---

## Monorepo structure

The repository separates the shared core from per-agent plugin sources and their build outputs, as described in `docs/ARCHITECTURE.md`.

```
hivemind/
├── src/                    ← shared core (API client, auth, config, SQL utils)
│   ├── hooks/              ← Claude Code hooks (the reference implementation)
│   ├── hooks/codex/        ← Codex hooks
│   ├── hooks/cursor/       ← Cursor hooks
│   ├── hooks/hermes/       ← Hermes shell hooks
│   ├── hooks/pi/           ← pi wiki-worker (extension in harnesses/pi/extension-source/)
│   ├── embeddings/         ← nomic embed-daemon + protocol + SQL helpers
│   ├── mcp/                ← MCP server (Hermes today; any MCP-aware client later)
│   ├── commands/           ← auth, auth-creds, auth-login, session-prune
│   └── cli/                ← unified `hivemind install` CLI + per-agent installers
├── harnesses/claude-code/            ← Claude Code plugin source (marketplace-distributed)
├── harnesses/codex/                  ← Codex plugin build output (npm-distributed)
├── cursor/                 ← Cursor plugin build output (npm-distributed)
├── harnesses/hermes/                 ← Hermes plugin build output (npm-distributed)
├── mcp/                    ← MCP server build output
├── harnesses/openclaw/               ← OpenClaw plugin source + build output (ClawHub)
├── harnesses/pi/                     ← pi extension source (ships raw .ts; pi compiles at load)
└── bundle/                 ← unified `hivemind` CLI build output
```

The Claude Code hooks under `src/hooks/` are the reference implementation. The per-agent subdirectories (`src/hooks/codex/`, `cursor/`, `hermes/`, `pi/`) re-express the same handlers against each assistant's event names and payload shapes, reusing the shared core for the actual work. The build step (`npm run build`) runs `tsc` plus `esbuild` and emits the per-agent bundles into `harnesses/claude-code/bundle/`, `harnesses/codex/bundle/`, `harnesses/cursor/bundle/`, `harnesses/openclaw/dist/`, `mcp/bundle/`, and `bundle/cli.js`.

---

## Major subsystems

```mermaid
flowchart TB
    subgraph agents["Host assistants"]
        claudeCode["Claude Code"]
        codex["Codex"]
        cursor["Cursor"]
        openclaw["OpenClaw"]
        hermes["Hermes"]
        pi["pi"]
    end

    subgraph shims["Per-agent integration shims"]
        marketplacePlugin["Marketplace plugin"]
        hooksJson["hooks.json hooks"]
        nativeExt["Native extension"]
        shellHooks["Shell hooks + MCP"]
        piExt["pi extension + AGENTS.md"]
    end

    subgraph core["Shared core (src/)"]
        captureCore["Capture handlers"]
        recallCore["Recall + VFS intercept"]
        wikiWorker["Wiki summary worker"]
        skillify["Skillify miner"]
        graph["Codebase graph"]
        apiClient["Deeplake API client"]
    end

    subgraph deeplake["Deeplake substrate"]
        sessionsTable["sessions table"]
        memoryTable["memory table + VFS"]
        skillsTable["skills table"]
        rulesGoals["rules / goals / kpis"]
        codebaseTable["codebase table"]
    end

    agents --> shims
    shims --> captureCore
    shims --> recallCore
    captureCore --> apiClient
    recallCore --> apiClient
    wikiWorker --> apiClient
    skillify --> apiClient
    graph --> apiClient
    apiClient --> deeplake
```

**Capture.** Every prompt, tool call, and assistant response becomes one row in the `sessions` table. The Claude Code reference handler is `src/hooks/capture.ts`, which writes a single INSERT per event and never concatenates, sidestepping write races.

**Recall and the VFS.** Agents read memory by running shell commands against `~/.deeplake/memory/`. The PreToolUse hook (`src/hooks/pre-tool-use.ts`) intercepts those commands and rewrites them into SQL queries against the `sessions` and `memory` tables. From the agent's view it is `cat` and `grep` on files; underneath it is a team-shared database with hybrid lexical and semantic search.

**Summarization.** At session end and on periodic checkpoints, a detached background worker (`src/hooks/wiki-worker.ts`, spawned by `src/hooks/spawn-wiki-worker.ts`) shells out to the host agent's own CLI to write a structured wiki summary into the `memory` table. Using the host CLI means no separate API key is needed.

**Skillify.** An async miner (`src/skillify/`) reads recent in-scope sessions, asks a gate model whether the activity is worth keeping, and writes a `SKILL.md` that propagates to teammates' agents.

**Graph.** The codebase graph subsystem (`src/graph/`) builds a live graph of files, symbols, and imports from the same traces, so recall walks the structures agents actually touched rather than plain text.

**Deeplake API client.** `src/deeplake-api.ts` is the single chokepoint to storage. It owns table creation, lazy schema healing, and query execution; `src/deeplake-schema.ts` is the single source of truth for every column.

---

## Integration model per agent

Each assistant wires the same logical events through a different mechanism, as documented in `docs/ARCHITECTURE.md`.

| Agent | Mechanism | Lifecycle events wired |
|---|---|---|
| Claude Code | Marketplace plugin | SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, SessionEnd |
| Codex | `~/.codex/hooks.json` | SessionStart, UserPromptSubmit, PreToolUse(Bash), PostToolUse, Stop |
| OpenClaw | Native extension at `~/.openclaw/extensions/hivemind/` | `agent_end` capture, `before_agent_start` recall, contracted `hivemind_search` / `read` / `index` tools |
| Cursor (1.7+) | `~/.cursor/hooks.json` | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| Hermes | Skill at `~/.hermes/skills/hivemind-memory/` plus shell hooks and MCP server | recall via grep on `~/.deeplake/memory/` |
| pi | `~/.pi/agent/AGENTS.md` block plus extension | recall via grep on `~/.deeplake/memory/` |

The differences are real but shallow: event names and payload field names vary, so each shim normalizes its input into the shared `HookInput` shape before handing off to the core. Codex, for example, is deliberately excluded from the SessionStart rules-injection block to keep its TUI clean, while pi and OpenClaw fall back to an on-demand `hivemind context` call.

---

## State and storage

All durable state lives in Deeplake tables defined in `src/deeplake-schema.ts`. The `sessions` table holds raw per-event traces with an optional `message_embedding` vector. The `memory` table holds wiki summaries plus the virtual filesystem entries and their `summary_embedding`. Separate tables back skills, rules, goals, KPIs, and the codebase graph. Rules, skills, goals, and KPIs all use the same immutable, version-bumped write pattern (every edit INSERTs version N+1 and reads take the highest version) to sidestep a Deeplake UPDATE-coalescing quirk that previously dropped concurrent writes.

Tenant isolation is enforced at the storage layer, not just the API: org and workspace boundaries mean sessions never share a row, partition, or index across workspaces. Credentials live on disk with mode `0600` and the config directory with mode `0700`, and the device-flow login keeps tokens out of the environment and out of source.

For the per-event flow that produces these rows, see [`session-lifecycle.md`](session-lifecycle.md).
