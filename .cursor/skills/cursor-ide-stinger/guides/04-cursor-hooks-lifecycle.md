# Guide 04: Cursor Hooks Lifecycle

The Cursor 1.7+ hooks harness: the six lifecycle events Hivemind wires, the `hooks.json` schema, and the `src/cli/install-cursor.ts` merge logic.

## The harness, end to end

`hivemind cursor install` runs `installCursor()` in `src/cli/install-cursor.ts`:

1. Copies the built hook bundle from `harnesses/cursor/bundle/` to `~/.cursor/hivemind/bundle/`.
2. Reads the existing `~/.cursor/hooks.json` (if any), merges in Hivemind's hook entries, and writes it back only if it changed.
3. Symlinks `~/.cursor/hivemind/node_modules` to the shared embed-deps node_modules when present, and writes a version stamp.

`uninstallCursor()` strips Hivemind's entries back out and deletes `hooks.json` if nothing meaningful remains (it counts keys ignoring `version`, so an empty `{}` or a `{ version: 0 }` leftover is handled correctly).

## The `hooks.json` schema (Cursor 1.7+)

Cursor reads `~/.cursor/hooks.json`:

```jsonc
{
  "version": 1,
  "hooks": {
    "<event>": [ { "type": "command", "command": "node \"...\"", "timeout": 30 } ]
  }
}
```

Two Cursor-specific shape rules (different from Claude Code / Codex):

- **Array entries are command objects directly.** No outer `{ hooks: [...] }` wrapper per entry.
- **No top-level `matcher` wrapper.** Fields are `type`, `command`, `timeout`. A `matcher` (e.g. `"Shell"`) is a sibling field on the command object, used only where needed (`preToolUse`).

The `CursorHookEntry` type in `install-cursor.ts`:

```typescript
interface CursorHookEntry {
  type: "command" | "prompt";
  command?: string;
  timeout?: number;
  matcher?: string | Record<string, unknown>;
}
```

## The six lifecycle events Hivemind wires

From `buildHookConfig()`:

| Event | Bundle script(s) | Timeout | Purpose |
|---|---|---|---|
| `sessionStart` | `session-start.js` | 30 | Inject memory recall + Hivemind context at session open |
| `beforeSubmitPrompt` | `capture.js` | 10 | Capture the user's prompt |
| `preToolUse` | `pre-tool-use.js` (matcher `Shell`) | 30 | Rewrite grep/rg against `~/.deeplake/memory/` into a single SQL fast-path call |
| `postToolUse` | `capture.js` | 15 | Capture tool results |
| `afterAgentResponse` | `capture.js` | 15 | Capture the agent's response |
| `stop` | `capture.js`, `graph-on-stop.js` | 15, 30 | Final capture + auto-build the code graph |
| `sessionEnd` | `session-end.js`, `graph-on-stop.js` | 30, 30 | Session summary + code graph |

That is six distinct events plus `stop`/`sessionEnd` each running two scripts. The `preToolUse` Shell matcher is what gives Cursor the same memory-recall accuracy as Claude Code / Codex: it converts a terminal grep into one SQL query instead of a slow filesystem scan.

`graph-on-stop.js` is the same code-graph builder Claude Code registers under Stop + SessionEnd. It is gated (rate limit + HEAD-changed + source-diff) so the common path is a ~5ms skip, and it runs async so it never blocks Cursor.

## Idempotent, Windows-safe merge

`mergeHooks()` and `isHivemindEntry()` keep re-installs clean:

```typescript
// Match a Hivemind entry on a normalized path so Windows backslashes still match.
return cmd.replace(/\\/g, "/").includes("/.cursor/hivemind/bundle/");
```

For each event, prior Hivemind entries are stripped (via `isHivemindEntry`) before Hivemind's current entries are appended, so a re-install never duplicates hooks. Without the backslash normalization, Windows paths (`...\.cursor\hivemind\bundle\capture.js`) would not match and every re-install would stack duplicates. A `_hivemindManaged` marker carrying the version is written at the root.

`writeJsonIfChanged()` skips the rewrite when the merged config is unchanged, so a no-op install does not perturb Cursor's hooks trust fingerprint.

## When editing the wiring

- Keep the entry shape exactly as `buildHookCmd` / `buildHookCmdShellMatcher` produce it.
- Preserve idempotency: strip-then-append on the normalized path; never blindly push.
- Preserve `writeJsonIfChanged` (do not force an unconditional write).
- If you add a hook script, add it to the bundle build and reference it as `bundle/<name>.js`.

## Handoff boundary

This Bee owns the Cursor hook wiring. The bundle scripts' internal logic (capture, recall, graph) is shared with the other harnesses; harness wiring for Claude Code, Codex, and Hermes is `harness-integration-worker-bee`'s. The TypeScript quality of `install-cursor.ts` is `typescript-node-worker-bee`'s.
