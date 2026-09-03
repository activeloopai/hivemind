# Guide 01: Principles

The mental model for `cursor-ide-worker-bee`. Read this before any rule, MCP, hook, layout, or extension work.

## The Hivemind Cursor surface

This repo (`@deeplake/hivemind`, TS ^6 / Node >=22 / ESM) integrates with Cursor across four real surfaces. Know which one a task touches before you act:

1. **The hooks harness.** `src/cli/install-cursor.ts` merges `~/.cursor/hooks.json` (Cursor 1.7+) and copies built hook scripts to `~/.cursor/hivemind/bundle/`. Six lifecycle events are wired so Hivemind captures sessions, recalls memory, and builds the code graph. This is `guides/04`.
2. **The extension.** `harnesses/cursor/extension/` is a first-party VS Code/Cursor extension (its own webpack + `package.json`). It surfaces health, onboarding, a dashboard webview, the codebase graph, and skill sync, and can wire/refresh the same hooks. This is `guides/06`.
3. **The MCP server in Cursor.** `src/mcp/server.ts` (stdio) exposes `hivemind_search` / `hivemind_read` / `hivemind_index`. Registering it inside Cursor is a `mcp.json` entry. This is `guides/03`.
4. **The `.cursor/` Bee Army platform.** The rules (`.mdc`), agents (`*.md`), skills/Stingers, commands (`the-beekeeper`, `the-smoker`), and `model-comparison-matrix.md` that make the Army run inside Cursor. Authoring rules is `guides/02`; the layout is `guides/05`.

Everything this Bee does lives in one of those four. If a task is about the TypeScript quality, the MCP tool schemas, or another agent's harness, it belongs to a different Bee (see "When to defer" below).

## Cursor's hooks.json is its own shape

Cursor 1.7+ reads `~/.cursor/hooks.json`:

```jsonc
{ "version": 1, "hooks": { "<event>": [ { "type": "command", "command": "...", "timeout": 30 } ] } }
```

This differs from Claude Code and Codex in two ways that matter:

- **No outer wrapper per entry.** The array entries under each event ARE the command objects directly. There is no `{ hooks: [...] }` nesting inside an entry.
- **No top-level `matcher` wrapper.** Field names are `type` + `command` + `timeout`. A `matcher` (e.g. `"Shell"`) is a sibling field on the command object itself, used on `preToolUse`.

Getting this shape wrong is the most common way to break the harness. `install-cursor.ts` is the authoritative reference.

## Idempotent, Windows-safe hook merges

`install-cursor.ts` must be safe to run repeatedly:

- It strips prior Hivemind entries before re-adding them, matched on a path normalized to forward slashes (`cmd.replace(/\\/g, "/").includes("/.cursor/hivemind/bundle/")`). Without normalization, Windows backslash paths would not match and re-install would duplicate every hook.
- It only rewrites `hooks.json` when the merged content actually changed (`writeJsonIfChanged`), so it does not perturb Cursor's hooks trust fingerprint on a no-op install.

Preserve both properties in any change to the wiring.

## The `.cursor/rules/*.mdc` model

Cursor project rules are `.mdc` files with YAML frontmatter. Three fields select the activation mode:

| Mode | `alwaysApply` | `globs` | `description` | Fires when |
|---|---|---|---|---|
| Always Apply | `true` | any | any | Every chat, composer, and agent context |
| Apply to Specific Files | `false` | set | any | A file matching the glob is in context |
| Apply Intelligently | `false` | unset | set | The agent reads `description` and decides |
| Apply Manually | `false` | unset | unset | Only when `@`-mentioned |

**Prefer the most specific mode that satisfies the rule's purpose.** Every `alwaysApply: true` rule is prepended to every context window, so reserve it for short, always-true directives. This repo uses `alwaysApply: true` only for `no-em-dashes.mdc`; `plan-construction-protocol.mdc` and `respect-agent-work-boundaries.mdc` ride on `description` / globs.

One rule file per logical concern, named descriptively. Keep individual files well under Cursor's 500-line composability ceiling.

## NO em dashes (hard rule)

`.cursor/rules/no-em-dashes.mdc` (alwaysApply) bans em dashes (`U+2014`) and en dashes (`U+2013`) in any prose authored on the user's behalf: chat, docs, commit messages, comments, every file this Bee writes. Use a comma, colon, parentheses, or a period instead. Write hyphens directly; do not run a blanket replace that could corrupt code.

## When to defer to other Bees

`cursor-ide-worker-bee` owns the Cursor configuration and platform layer. Hand off when:

- The TypeScript quality or typing of `install-cursor.ts` / the extension source is the concern -> `typescript-node-worker-bee`.
- The MCP server's tool schemas, Zod validation, or transport is the concern -> `mcp-protocol-worker-bee`.
- The harness for Claude Code, Codex, or Hermes is the concern -> `harness-integration-worker-bee`.
- TypeScript/UI code inside the extension's webview -> `typescript-node-worker-bee`.
- Publishing or CI for the extension -> `ci-release-worker-bee`.
- Every implementation task closes out with `security-worker-bee` first, then `quality-worker-bee`.
