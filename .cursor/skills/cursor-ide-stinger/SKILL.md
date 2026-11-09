---
name: cursor-ide-stinger
description: Equips cursor-ide-worker-bee to own Hivemind's Cursor surface: the Cursor 1.7+ hooks harness (~/.cursor/hooks.json, 6 lifecycle events) wired by src/cli/install-cursor.ts, the first-party VS Code/Cursor extension at harnesses/cursor/extension/, registering the Hivemind MCP server (src/mcp/server.ts) in Cursor, and the .cursor/ Bee Army platform this repo ships (rules .mdc format, agents, skills/Stingers, the-beekeeper/the-smoker commands, model-comparison-matrix). Use when the task touches Cursor hook wiring, .cursor/rules/*.mdc authoring, MCP registration in Cursor, the cursor extension build, or the Army's .cursor/ structure. Do NOT use for code quality of TS source (typescript-node-worker-bee), the MCP protocol internals of server.ts (mcp-protocol-worker-bee), or harness wiring for Claude/Codex/other agents (harness-integration-worker-bee).
license: MIT
---

# cursor-ide Stinger

The knowledge repository for `cursor-ide-worker-bee`. Covers Hivemind's real Cursor surface: the Cursor 1.7+ hooks harness, the first-party Cursor extension, registering the Hivemind MCP server in Cursor, and the `.cursor/` Bee Army platform (rules, agents, skills, commands, model matrix) that this repo ships.

This is the platform knowledge that keeps the Army working inside Cursor: the rules `.mdc` format, the hooks lifecycle, MCP registration, the agents/skills/commands layout, and the cursor harness install.

## When this stinger applies

Load whenever `cursor-ide-worker-bee` is invoked. Typical triggers (any of these phrases):

- "wire the Cursor hooks" / "what does install-cursor do" / "hooks.json" / "Cursor 1.7 hooks"
- "add a `.cursor/rules/*.mdc`" / "fix this rule" / "rule frontmatter" / "alwaysApply / globs"
- "register the Hivemind MCP server in Cursor" / "mcp.json in Cursor"
- "the cursor extension" / "harnesses/cursor/extension" / "the dashboard webview / status bar"
- "the Bee Army layout" / "where do agents/skills/commands live" / "the-beekeeper / the-smoker"
- "model-comparison-matrix"

Do NOT load for:

- Code quality / typing of the TypeScript source itself (`typescript-node-worker-bee`).
- The MCP protocol internals of `src/mcp/server.ts`: tool schemas, transport (`mcp-protocol-worker-bee`).
- Harness wiring for Claude Code, Codex, Hermes, or other agents (`harness-integration-worker-bee`).

## First action when loaded

Read in order before acting:

1. **`guides/01-principles.md`**: the Hivemind Cursor surface map, the rules `.mdc` mental model, and the hard directives (idempotent hook merge, em-dash ban, Cursor field shape).
2. The task-specific guide:
   - `02` for `.cursor/rules/*.mdc` authoring.
   - `03` for registering the Hivemind MCP server in Cursor.
   - `04` for the Cursor hooks lifecycle (the 6 events + `install-cursor.ts`).
   - `05` for the `.cursor/` Bee Army layout.
   - `06` for the cursor extension build.

## Folder layout

```text
cursor-ide-stinger/
+- SKILL.md                          (this file, master index)
+- guides/
|  +- 01-principles.md               (the Hivemind Cursor surface; rules model; hard directives)
|  +- 02-rule-file-authoring.md      (.cursor/rules/*.mdc frontmatter, globs, activation modes)
|  +- 03-mcp-integration.md          (registering the Hivemind MCP server in Cursor)
|  +- 04-cursor-hooks-lifecycle.md   (hooks.json 1.7+, the 6 events, install-cursor.ts wiring)
|  +- 05-cursor-army-layout.md       (.cursor/ rules + agents + skills + commands + model matrix)
|  +- 06-extension-development.md    (harnesses/cursor/extension build, contributions, MCP/hooks surface)
+- examples/
|  +- rule-file-examples.md          (worked .mdc examples, including this repo's live rules)
|  +- mcp-server-example.md          (registering hivemind in Cursor mcp.json + the extension path)
|  +- hooks-wiring-example.md        (a real ~/.cursor/hooks.json after install-cursor)
+- templates/
|  +- rule-file-template.mdc         (canonical .mdc frontmatter template)
|  +- hooks-json-template.json       (Cursor 1.7+ hooks.json wiring template)
+- reports/
|  +- README.md
+- research/                         (Cursor 1.7+ hooks/rules notes, dated 2026-06-16)
   +- research-plan.md
   +- research-summary.md
   +- index.md
   +- internal/  (live repo artifacts)
   +- external/  (Cursor hooks + rules docs)
```

## Critical directives

Stinger-level non-negotiables that `cursor-ide-worker-bee` enforces on every invocation:

- **Cursor's hooks.json schema differs from Claude/Codex.** Array entries under each event are command objects directly (`{ type, command, timeout }`), with NO outer `{ hooks: [...] }` wrapper and NO top-level `matcher` wrapper. See `guides/04`.
- **Hook merges must stay idempotent and Windows-safe.** `install-cursor.ts` strips prior Hivemind entries (matched on a normalized `/.cursor/hivemind/bundle/` path so backslash paths on Windows do not duplicate) before re-adding, and only rewrites `hooks.json` when content changed so it does not perturb Cursor's trust fingerprint.
- **`.cursor/rules/*.mdc` is the only rules format.** This repo ships `.mdc` rules with frontmatter (`description` / `globs` / `alwaysApply`). Never introduce a `.cursorrules` file here.
- **Prefer `alwaysApply: false` with a narrow glob or a sharp `description`.** Reserve `alwaysApply: true` for short, always-true directives (this repo uses it only for `no-em-dashes.mdc`).
- **NO em dashes, ever.** Write hyphens directly. This is enforced by `.cursor/rules/no-em-dashes.mdc` and applies to every file this Bee authors.

## Key facts by domain (quick reference)

### The Hivemind Cursor surface (what this repo actually ships)

| Surface | Path | Purpose |
|---|---|---|
| Hook installer | `src/cli/install-cursor.ts` | Merges `~/.cursor/hooks.json`, copies the bundle to `~/.cursor/hivemind/bundle/` |
| Hook bundle | `harnesses/cursor/bundle/` | Built hook scripts (`session-start.js`, `capture.js`, `pre-tool-use.js`, `graph-on-stop.js`, `session-end.js`) |
| Extension | `harnesses/cursor/extension/` | First-party VS Code/Cursor extension: status bar, onboarding, dashboard webview, codebase graph, skill sync |
| MCP server | `src/mcp/server.ts` | stdio server exposing `hivemind_search` / `hivemind_read` / `hivemind_index` |
| Bee Army | `.cursor/` | `rules/*.mdc`, `agents/*.md`, `skills/<base>-stinger/`, `commands/`, `model-comparison-matrix.md` |

### Cursor 1.7+ hooks (`~/.cursor/hooks.json`)

```jsonc
{
  "version": 1,
  "hooks": {
    "sessionStart":        [{ "type": "command", "command": "node \"...bundle/session-start.js\"", "timeout": 30 }],
    "beforeSubmitPrompt":  [{ "type": "command", "command": "node \"...bundle/capture.js\"", "timeout": 10 }],
    "preToolUse":          [{ "type": "command", "command": "node \"...bundle/pre-tool-use.js\"", "timeout": 30, "matcher": "Shell" }],
    "postToolUse":         [{ "type": "command", "command": "node \"...bundle/capture.js\"", "timeout": 15 }],
    "afterAgentResponse":  [{ "type": "command", "command": "node \"...bundle/capture.js\"", "timeout": 15 }],
    "stop":                [{ "...": "capture.js + graph-on-stop.js" }],
    "sessionEnd":          [{ "...": "session-end.js + graph-on-stop.js" }]
  }
}
```

Six lifecycle events are wired: `sessionStart`, `beforeSubmitPrompt`, `preToolUse` (Shell matcher rewrites grep/rg against `~/.deeplake/memory/` into a SQL fast path), `postToolUse`, `afterAgentResponse`, `stop`, and `sessionEnd`. `graph-on-stop.js` auto-builds the code graph on `stop` and `sessionEnd` (gated, async, never blocks Cursor).

### Rules (`.cursor/rules/*.mdc`)

Cursor project rules are `.mdc` files with frontmatter. Activation is driven by three fields:

| Mode | `alwaysApply` | `globs` | `description` |
|---|---|---|---|
| Always Apply | `true` | any | any |
| Apply to Specific Files | `false` | set | any |
| Apply Intelligently | `false` | unset | set |
| Apply Manually | `false` | unset | unset |

This repo's live rules: `no-em-dashes.mdc` (alwaysApply), `plan-construction-protocol.mdc`, `respect-agent-work-boundaries.mdc`.

### MCP registration in Cursor

The Hivemind MCP server (`src/mcp/server.ts`, stdio) exposes `hivemind_search`, `hivemind_read`, `hivemind_index`. To use it inside Cursor, add a `mcpServers` entry to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) pointing at the built server. See `guides/03`.

## Pairing

| Role | Artifact |
|---|---|
| This stinger | `.cursor/skills/cursor-ide-stinger/` |
| Paired Bee | `.cursor/agents/cursor-ide-worker-bee.md` |
| Harness Bee (other agents) | `.cursor/agents/harness-integration-worker-bee.md` |
| MCP protocol Bee | `.cursor/agents/mcp-protocol-worker-bee.md` |
| Orchestrator commands | `.cursor/commands/the-beekeeper.md`, `.cursor/commands/the-smoker.md` |

## Refresh cadence

- Guides `01`-`06`: refresh on any Cursor major version, or when `install-cursor.ts` / the extension `package.json` changes.
- Research folder: re-run on any Cursor 1.x hooks API change.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
