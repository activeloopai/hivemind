# Guide 02: The Capture/Recall Hook Lifecycle

**Sources:** `research/external/2026-06-16-hook-lifecycle.md`, `research/external/2026-06-16-architecture-build.md`

---

## How hooks plug Hivemind in

On hooks-based hosts (Claude Code, Codex, Cursor, Hermes shell hooks), Hivemind subscribes to the host's lifecycle events. Each event forks a small Node entry from the bundle. Two jobs run across the lifecycle:

- **Capture** - write a trace of session activity to the Deep Lake `sessions` table.
- **Recall** - inject relevant prior memory back into the agent at session start and on each prompt.

```
node "${CLAUDE_PLUGIN_ROOT}/bundle/<entry>.js"
```

The host invokes the entry with the event payload on stdin; the entry does its work and exits. Heavy work runs `async: true` so it never blocks the agent.

---

## Claude Code event set (7 events)

`harnesses/claude-code/hooks/hooks.json` wires seven events. This is the reference set - other hosts implement a subset.

| Event | Entry (bundle) | Timeout | Async | Role |
|---|---|---|---|---|
| `SessionStart` | `session-start.js` + `session-notifications.js` + `session-start-setup.js` | 10s / 8s / 120s | last one async | Inject recall, surface notifications, background setup |
| `UserPromptSubmit` | `capture.js` | 10s | yes | Capture prompt; inject prompt-time recall |
| `PreToolUse` | `pre-tool-use.js` | 60s | no | Pre-tool gating/capture (runs before the tool) |
| `PostToolUse` | `capture.js` | 15s | yes | Capture tool result |
| `Stop` | `capture.js` + `graph-on-stop.js` | 30s | yes | Capture turn end; update graph |
| `SubagentStop` | `capture.js` | - | yes | Capture subagent turn end |
| `SessionEnd` | `capture.js` | - | yes | Final capture / flush |

> The capture hooks write traces to the Deep Lake `sessions` table; recall is injected at `SessionStart` and `UserPromptSubmit`. Source: `research/external/2026-06-16-hook-lifecycle.md`.

---

## Per-host subsets

| Host | Events | Notes |
|---|---|---|
| Claude Code | 7 (above) | Full set |
| Codex | hook set in `~/.codex/hooks.json` | **PreToolUse matcher is Bash-only** |
| Cursor | 6 lifecycle events (1.7+) | Wired in `~/.cursor/hooks.json` → `~/.cursor/hivemind/bundle/` |
| Hermes | shell hooks in `config.yaml` | Plus the MCP server for direct recall |

When adding an event, add it to every hooks-based host that supports it - keep the capture surface consistent. See `examples/add-a-hook-event.md`.

---

## The two hard rules for hooks

### 1. Honor the timeout, dispatch heavy work async

Each event has a timeout. Capture and graph work is heavier than a fast recall inject, so it runs `async: true` - the host does not wait for it.

```jsonc
{
  "PostToolUse": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/bundle/capture.js\"",
          "timeout": 15,
          "async": true
        }
      ]
    }
  ]
}
```

Recall injection (SessionStart, UserPromptSubmit) is on the critical path - keep it well under its timeout. Capture (PostToolUse, Stop, SubagentStop, SessionEnd) is fire-and-forget - mark it `async`.

### 2. Fail open

A hook must never crash the host. Wrap the entry body so any failure (network down, Deep Lake unreachable, bad payload) exits cleanly without a non-zero status that the host treats as a block. Capture failures are logged, not fatal - the agent keeps working.

> A hook that throws on the PreToolUse path can block the tool call. Always fail open. Source: `research/external/2026-06-16-hook-lifecycle.md`.

---

## Recall injection

At `SessionStart` and `UserPromptSubmit`, the entry queries Hivemind for relevant prior memory and emits it back to the host so the model sees it in context. This is the read side of the loop; capture is the write side. Both must stay fast and identical in behavior across hosts so memory recalled in one harness matches what another wrote.

---

## Codex caveat: Bash-only PreToolUse matcher

Codex's PreToolUse matcher only fires for Bash tool calls. Do not assume Codex captures pre-tool state for non-Bash tools - design any pre-tool logic to degrade gracefully when the matcher does not fire.

---

*See also:* `guides/03-tool-contract.md` for the tool surface recall uses, and `examples/add-a-hook-event.md` for adding an event end-to-end.
