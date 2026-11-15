# Cursor IDE Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `cursor-ide-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/cursor-ide-worker-bee.md`](../../../agents/cursor-ide-worker-bee.md)
**Stinger:** [`.cursor/skills/cursor-ide-stinger/`](../../cursor-ide-stinger/)
**Trigger policy:** proactive

---

## Domain

`cursor-ide-worker-bee` owns Hivemind's Cursor surface: configuring and extending Cursor as the host for this repo, not the code Cursor's agent generates. Its domain covers the Cursor 1.7+ hooks harness (`~/.cursor/hooks.json` and the wiring in `src/cli/install-cursor.ts`, six lifecycle events), the first-party VS Code/Cursor extension at `harnesses/cursor/extension/`, registering the Hivemind MCP server (`src/mcp/server.ts`) inside Cursor, and the `.cursor/` Bee Army platform this repo ships: project rules (`.cursor/rules/*.mdc`), agents (`.cursor/agents/*.md`), skills/Stingers (`.cursor/skills/<base>-stinger/`), the orchestrator commands (`the-beekeeper.md`, `the-smoker.md`), and `model-comparison-matrix.md`.

## Trigger phrases

Route to `cursor-ide-worker-bee` when the user says any of:

- "Cursor hooks" / "wire the Cursor hooks" / "what does install-cursor do"
- "hooks.json"
- ".cursor/rules .mdc" / "add a .cursor/rules .mdc" / "fix this rule"
- "Register the Hivemind MCP server in Cursor"
- "The cursor extension" / "harnesses/cursor/extension"
- "Bee Army layout" / "the .cursor/ layout"

Or when the request implicitly involves the Cursor platform, its hooks, its extension, or the .cursor/ Army layout.

## Do NOT route when

- The user wants harness wiring for Claude Code, Codex, Hermes, pi, or OpenClaw - that is `harness-integration-worker-bee`. This Bee owns the Cursor host; harness-integration owns the other five.
- The user wants the MCP protocol internals of `server.ts` (tool design, transport, error model) - that is `mcp-protocol-worker-bee`. This Bee registers the server in Cursor; the protocol Bee owns its contract.
- The user wants code quality of the TypeScript source - that is `typescript-node-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The Cursor concern in scope (hooks.json, the extension, MCP registration, a `.mdc` rule, the Army layout).
- Access to `src/cli/install-cursor.ts`, `harnesses/cursor/extension/`, and the `.cursor/` tree.
- Optional: the Cursor version (the hooks schema is 1.7+).

If the concern is unclear, do not invoke yet - ask the user what part of Cursor they are configuring.

## Outputs the Bee produces

- Cursor hooks.json wiring and idempotent, Windows-safe merge logic matched to `install-cursor.ts`.
- `.cursor/rules/*.mdc` authoring/fixes and MCP registration in Cursor.
- Cursor extension and Bee Army layout changes.

## Multi-Bee sequences this Bee participates in

- **Cursor host wiring** - sits alongside `harness-integration-worker-bee` (which owns the other five hosts) and defers MCP contract internals to `mcp-protocol-worker-bee`.

## Critical directives the orchestrator should respect

- **Cursor's hooks.json schema differs from Claude/Codex** - event arrays hold command objects directly, no outer `{ hooks: [...] }` wrapper, no top-level `matcher`. Match `install-cursor.ts`.
- **Keep hook merges idempotent and Windows-safe** - strip prior Hivemind entries on a normalized path; only rewrite when changed (preserves Cursor's trust fingerprint).
- **`.cursor/rules/*.mdc` is the only rules format here** - never introduce a `.cursorrules` file.
- **Prefer `alwaysApply: false` with a narrow glob or sharp `description`.**
- **NO em dashes, ever** - enforced by `.cursor/rules/no-em-dashes.mdc`.

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
