# Hooks Wiring Example

A real `~/.cursor/hooks.json` after `hivemind cursor install`, and what each piece means.

## After install

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/session-start.js\"", "timeout": 30 }
    ],
    "beforeSubmitPrompt": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/capture.js\"", "timeout": 10 }
    ],
    "preToolUse": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/pre-tool-use.js\"", "timeout": 30, "matcher": "Shell" }
    ],
    "postToolUse": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/capture.js\"", "timeout": 15 }
    ],
    "afterAgentResponse": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/capture.js\"", "timeout": 15 }
    ],
    "stop": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/capture.js\"", "timeout": 15 },
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/graph-on-stop.js\"", "timeout": 30 }
    ],
    "sessionEnd": [
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/session-end.js\"", "timeout": 30 },
      { "type": "command", "command": "node \"/Users/you/.cursor/hivemind/bundle/graph-on-stop.js\"", "timeout": 30 }
    ]
  },
  "_hivemindManaged": { "version": "x.y.z" }
}
```

## What each event does

- **`sessionStart`** -> `session-start.js`: injects memory recall and Hivemind context as the session opens.
- **`beforeSubmitPrompt`** -> `capture.js`: captures the user's prompt.
- **`preToolUse`** (matcher `Shell`) -> `pre-tool-use.js`: rewrites a grep/rg against `~/.deeplake/memory/` into a single SQL fast-path call, matching Claude Code / Codex recall accuracy.
- **`postToolUse`** / **`afterAgentResponse`** -> `capture.js`: capture tool results and the agent's response.
- **`stop`** -> `capture.js` + `graph-on-stop.js`: final capture plus a gated, async code-graph build.
- **`sessionEnd`** -> `session-end.js` + `graph-on-stop.js`: session summary plus code graph.

## On a Windows machine

`install-cursor.ts` writes backslash paths, for example `node "C:\\Users\\you\\.cursor\\hivemind\\bundle\\capture.js"`. The re-install matcher normalizes those to forward slashes before checking for the `/.cursor/hivemind/bundle/` marker, so a second `hivemind cursor install` does not duplicate any entry.

## Coexisting with your own hooks

If `hooks.json` already has non-Hivemind entries, `install-cursor.ts` keeps them: for each event it strips only the prior Hivemind entries (matched on the bundle path) and appends the current ones. Your own hooks under the same event survive untouched. A no-op re-install does not rewrite the file at all, preserving Cursor's hooks trust fingerprint.
