---
source_type: internal-artifact
authority: high
relevance: high
topic: cursor-hooks
url: src/cli/install-cursor.ts
fetched: 2026-06-16
---

# Live Harness: src/cli/install-cursor.ts

## Summary

The authoritative source for how Hivemind wires Cursor. `installCursor()` copies the built hook bundle from `harnesses/cursor/bundle/` to `~/.cursor/hivemind/bundle/`, merges Hivemind's hook entries into `~/.cursor/hooks.json`, symlinks shared embed-deps node_modules when present, and writes a version stamp.

## Key facts

- **Schema (Cursor 1.7+):** `{ version, hooks: { <event>: [ { type, command, timeout, matcher? } ] } }`. Array entries are command objects directly; no outer `{ hooks: [...] }` wrapper per entry; no top-level matcher wrapper.
- **Six events wired** by `buildHookConfig()`: `sessionStart`, `beforeSubmitPrompt`, `preToolUse` (matcher `Shell`), `postToolUse`, `afterAgentResponse`, `stop` (capture + graph-on-stop), `sessionEnd` (session-end + graph-on-stop).
- **Idempotent merge:** `isHivemindEntry()` matches on a forward-slash-normalized `/.cursor/hivemind/bundle/` path so Windows backslash paths still match; `mergeHooks()` strips prior Hivemind entries per event before appending current ones.
- **Trust fingerprint:** `writeJsonIfChanged()` skips the rewrite on a no-op install so Cursor's hooks trust fingerprint is not perturbed.
- **`_hivemindManaged`** marker at root carries the installed version.
- **Uninstall:** `stripHooksFromConfig()` removes Hivemind entries and deletes `hooks.json` when only `version` (or nothing) remains.

## Relevance to the stinger

Ground truth for `guides/04-cursor-hooks-lifecycle.md`, `templates/hooks-json-template.json`, and `examples/hooks-wiring-example.md`.
