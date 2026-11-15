---
source_type: official-docs
authority: high
relevance: high
topic: cursor-hooks
url: https://cursor.com/docs/agent/hooks
retrieved: 2026-06-16
---

# Cursor Agent Hooks (1.7+)

Notes on the Cursor hooks API as used by Hivemind's `src/cli/install-cursor.ts`.

## Config location and shape

Cursor reads a user-global `~/.cursor/hooks.json`:

```jsonc
{ "version": 1, "hooks": { "<event>": [ { "type": "command", "command": "...", "timeout": 30 } ] } }
```

Key differences from Claude Code and Codex hook configs:

- Array entries under each event are command objects directly. There is NO outer `{ hooks: [...] }` wrapper per entry.
- Field names are `type` + `command` + `timeout`. There is NO top-level `matcher` wrapper; a `matcher` (e.g. `"Shell"`) is a sibling field on the command object, applied per entry.

## Lifecycle events Hivemind wires (six)

`sessionStart`, `beforeSubmitPrompt`, `preToolUse` (Shell matcher), `postToolUse`, `afterAgentResponse`, `stop`, `sessionEnd`. The bundle scripts are `session-start.js`, `capture.js`, `pre-tool-use.js`, `graph-on-stop.js`, `session-end.js`.

- `preToolUse` with the Shell matcher rewrites grep/rg against `~/.deeplake/memory/` into a single SQL fast-path call (recall parity with Claude Code / Codex).
- `graph-on-stop.js` runs on `stop` and `sessionEnd`; gated (rate limit + HEAD-changed + source-diff) so the common path is a ~5ms skip, and async so it never blocks Cursor.

## Idempotency and trust fingerprint

Re-running the installer must not duplicate entries and must not perturb Cursor's hooks trust fingerprint. Hivemind achieves this by: matching prior entries on a forward-slash-normalized `/.cursor/hivemind/bundle/` path (so Windows backslash paths still match), stripping then re-appending per event, and only rewriting the file when the merged content changed (`writeJsonIfChanged`).

## Relevance to the stinger

Primary source for `guides/04-cursor-hooks-lifecycle.md`, the `templates/hooks-json-template.json`, and `examples/hooks-wiring-example.md`. Ground truth is the repo's own `src/cli/install-cursor.ts`.
