# Hivemind Knowledge Base

> Category: Overview | Version: 1.0 | Date: June 2026 | Status: Active

The entry point for everyone working on Hivemind internals: what the product is, how its pieces fit together, and where to read next.

**Related:**
- [`architecture/system-overview.md`](architecture/system-overview.md)
- [`architecture/session-lifecycle.md`](architecture/session-lifecycle.md)
- [`data/deeplake-tables-schema.md`](data/deeplake-tables-schema.md)
- [`auth/auth-architecture.md`](auth/auth-architecture.md)
- [`plugins/integration-model.md`](plugins/integration-model.md)
- [`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)

---

## What Hivemind is

Hivemind is a shared, auto-learning memory layer for coding agents. It gives Claude Code, OpenClaw, Codex, Cursor, Hermes, and pi a single brain: one agent solves a problem on Monday, and every agent on the team can recall and reuse that work afterward. The pitch in the README is "one brain for all your agents," and the mechanics behind it are Capture, Codify, Propagate, Compound.

The product is not a server with a UI. It is a monorepo of plugins, hooks, and a CLI that install into each supported assistant and quietly wire into that assistant's lifecycle events. Every prompt, tool call, and response is captured as a structured trace in Deeplake (a tensor-native database). A background worker mines those traces into reusable `SKILL.md` files, and codified skills propagate back into every connected agent's context at inference time. On the LoCoMo long-context memory benchmark, this approach is 25% cheaper, uses 1.7x fewer tokens, and reaches answers in 31% fewer turns than running with no shared memory.

Installation is one command: `npm i -g @deeplake/hivemind && hivemind install` detects every supported assistant, wires its hooks, and runs a device-flow login. From then on, capture and recall happen automatically with no further user action.

---

## Top-level architecture

Hivemind has four moving parts that recur across every domain.

**Per-agent integration shims.** Each supported assistant exposes a different extension surface: Claude Code takes a marketplace plugin, Codex and Cursor take a `hooks.json`, OpenClaw takes a native extension, Hermes takes shell hooks plus an MCP server, and pi takes a TypeScript extension plus an `AGENTS.md` block. The shims translate each assistant's native lifecycle events into the same capture and recall calls.

**The shared core (`src/`).** The Deeplake API client (`src/deeplake-api.ts`), the table schemas (`src/deeplake-schema.ts`), config loading (`src/config.ts`), credential handling (`src/commands/auth.ts`), and the SQL-safety utilities are all agent-agnostic. The per-agent hooks are thin wrappers over this core.

**Deeplake as the substrate.** All durable state lives in Deeplake tables: `sessions` (raw per-event traces), `memory` (wiki summaries plus the virtual filesystem), `skills`, `rules`, `goals`, `kpis`, and `codebase` (the code graph). Org and workspace boundaries are enforced at the storage layer, so two workspaces never share a row, partition, or index.

**The virtual filesystem (VFS).** Agents read and write memory through ordinary shell commands (`cat`, `ls`, `grep`) against `~/.deeplake/memory/`. A PreToolUse hook intercepts those commands and routes them to SQL queries instead of the real disk, which is how recall feels like browsing files while actually hitting a team-shared database.

External dependencies are intentionally few: Deeplake for storage, the host agent's own CLI (`claude -p`, `codex exec`, `pi --print`) for summary generation so no extra API key is needed, and an optional local nomic-embed daemon for semantic search.

---

## Key components

| Component | Location | Responsibility |
|---|---|---|
| Shared core | `src/` | API client, schemas, config, auth, SQL utils |
| Claude Code hooks | `src/hooks/` | Reference implementation of every lifecycle hook |
| Per-agent hooks | `src/hooks/{codex,cursor,hermes,pi}/` | Agent-specific capture, recall, and summary shims |
| Unified CLI | `src/cli/` | `hivemind install` plus per-agent installers |
| Commands | `src/commands/` | auth, login, session-prune, goals, rules |
| Embeddings | `src/embeddings/` | nomic embed daemon, protocol, SQL helpers |
| MCP server | `src/mcp/` | Recall surface for Hermes and future MCP clients |
| Skillify | `src/skillify/` | Trace-to-skill mining pipeline |
| Graph | `src/graph/` | Live codebase graph extraction and recall |
| Plugin build outputs | `harnesses/claude-code/`, `harnesses/codex/`, `cursor/`, `harnesses/hermes/`, `harnesses/openclaw/`, `harnesses/pi/` | Distributable artifacts per assistant |

---

## Reading guide

Read this overview first, then [`architecture/system-overview.md`](architecture/system-overview.md) for the monorepo map, then [`architecture/session-lifecycle.md`](architecture/session-lifecycle.md) for the per-session hook flow. The table below links every knowledge doc by domain. Shorter companion references also live under [`../../../docs/`](../../../docs/) at the repo root.

### Architecture

| Doc | Covers |
|---|---|
| [`architecture/system-overview.md`](architecture/system-overview.md) | Monorepo layout, subsystems, integration model |
| [`architecture/session-lifecycle.md`](architecture/session-lifecycle.md) | SessionStart through capture, recall, and summary workers |

### Plugins

| Doc | Covers |
|---|---|
| [`plugins/integration-model.md`](plugins/integration-model.md) | Per-assistant install surfaces and event wiring |
| [`plugins/hook-lifecycle.md`](plugins/hook-lifecycle.md) | Hook event matrix and handler dispatch |
| [`plugins/mcp-and-extension-surfaces.md`](plugins/mcp-and-extension-surfaces.md) | MCP server, OpenClaw extension, Hermes skill |

### AI

| Doc | Covers |
|---|---|
| [`ai/session-capture.md`](ai/session-capture.md) | Per-event INSERT capture and embedding attachment |
| [`ai/wiki-summary-workers.md`](ai/wiki-summary-workers.md) | Detached summary workers and host-CLI generation |
| [`ai/skillify-pipeline.md`](ai/skillify-pipeline.md) | Trace mining, gate model, skill propagation |
| [`ai/embeddings-retrieval.md`](ai/embeddings-retrieval.md) | nomic embed daemon and hybrid recall |

### Data

| Doc | Covers |
|---|---|
| [`data/deeplake-tables-schema.md`](data/deeplake-tables-schema.md) | Full table DDL for every Deeplake table |
| [`data/memory-virtual-filesystem.md`](data/memory-virtual-filesystem.md) | VFS path conventions and SQL dispatch |
| [`data/codebase-graph.md`](data/codebase-graph.md) | Live graph build, push, and recall |

### Auth and security

| Doc | Covers |
|---|---|
| [`auth/auth-architecture.md`](auth/auth-architecture.md) | Device-flow login, org binding, token healing |
| [`security/trust-boundaries.md`](security/trust-boundaries.md) | VFS allowlist, SQL safety, tenant isolation |
| [`security/credential-storage.md`](security/credential-storage.md) | On-disk credential layout and permissions |

### Frontend, multi-tenant, and collaboration

| Doc | Covers |
|---|---|
| [`frontend/cursor-extension-architecture.md`](frontend/cursor-extension-architecture.md) | Cursor hooks bundle and dashboard surface |
| [`multi-tenant/org-workspace-model.md`](multi-tenant/org-workspace-model.md) | Org and workspace boundaries at storage |
| [`collaboration/team-skills-sharing.md`](collaboration/team-skills-sharing.md) | Cross-teammate skill pull and rules propagation |

### Infrastructure and operations

| Doc | Covers |
|---|---|
| [`infrastructure/monorepo-build-release.md`](infrastructure/monorepo-build-release.md) | tsc, esbuild bundles, and distribution |
| [`operations/cli-command-architecture.md`](operations/cli-command-architecture.md) | Unified CLI routing and auth subcommands |
| [`operations/notifications-and-health.md`](operations/notifications-and-health.md) | Session banners, savings recap, health checks |

### Standards

| Doc | Covers |
|---|---|
| [`standards/documentation-framework.md`](standards/documentation-framework.md) | Document types, headers, naming, and writing rules for this repo |

### Root docs (shorter references)

| Doc | Covers |
|---|---|
| [`../../../docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) | High-level architecture summary |
| [`../../../docs/CAPTURE_TASKS.md`](../../../docs/CAPTURE_TASKS.md) | Explicit save-and-resume capture tasks |
| [`../../../docs/EMBEDDINGS.md`](../../../docs/EMBEDDINGS.md) | Embedding daemon quick reference |
| [`../../../docs/SKILLIFY.md`](../../../docs/SKILLIFY.md) | Skillify pipeline quick reference |
| [`../../../docs/SUMMARIES.md`](../../../docs/SUMMARIES.md) | Wiki summary worker quick reference |

---

## Where to start by task

**New to the codebase:** this overview, then [`architecture/system-overview.md`](architecture/system-overview.md), then [`architecture/session-lifecycle.md`](architecture/session-lifecycle.md).

**Working on capture or recall:** [`architecture/session-lifecycle.md`](architecture/session-lifecycle.md), [`ai/session-capture.md`](ai/session-capture.md), [`data/memory-virtual-filesystem.md`](data/memory-virtual-filesystem.md).

**Working on a specific assistant integration:** [`plugins/integration-model.md`](plugins/integration-model.md) and the matching `src/hooks/<agent>/` directory.

**Investigating storage or schema:** [`data/deeplake-tables-schema.md`](data/deeplake-tables-schema.md) (canonical DDL); `src/deeplake-schema.ts` is the runtime source of truth.

**Auth, credentials, or tenancy:** [`auth/auth-architecture.md`](auth/auth-architecture.md), [`security/credential-storage.md`](security/credential-storage.md), [`multi-tenant/org-workspace-model.md`](multi-tenant/org-workspace-model.md).

**Build, release, or CLI:** [`infrastructure/monorepo-build-release.md`](infrastructure/monorepo-build-release.md), [`operations/cli-command-architecture.md`](operations/cli-command-architecture.md).

**Writing or filing docs:** [`standards/documentation-framework.md`](standards/documentation-framework.md).

---

## Coverage stats

- Knowledge docs authored: 22 (this overview plus 21 domain docs)
- Domains covered: architecture, plugins, AI, data, auth, security, frontend, multi-tenant, collaboration, infrastructure, operations, standards
- Source material: `README.md`, `docs/`, and the `src/` tree
- Last updated: June 2026
