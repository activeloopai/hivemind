# Source: The Capture/Recall Hook Lifecycle

- **Retrieved:** 2026-06-16
- **Source type:** Hivemind repo (authoritative) + host hook docs
- **In-repo anchors:** `harnesses/claude-code/hooks/hooks.json`, the bundle entries it forks

---

## Mechanism

On hooks-based hosts (Claude Code, Codex, Cursor, Hermes shell hooks) Hivemind subscribes to lifecycle events. Each event forks a small Node entry from the bundle, e.g. `node "${CLAUDE_PLUGIN_ROOT}/bundle/<entry>.js"`. The host passes the event payload on stdin; the entry works and exits.

## Claude Code 7-event set (reference)

| Event | Bundle entry | Timeout | Async |
|---|---|---|---|
| SessionStart | session-start.js, session-notifications.js, session-start-setup.js | 10s / 8s / 120s | last async |
| UserPromptSubmit | capture.js | 10s | yes |
| PreToolUse | pre-tool-use.js | 60s | no |
| PostToolUse | capture.js | 15s | yes |
| Stop | capture.js, graph-on-stop.js | 30s | yes |
| SubagentStop | capture.js | - | yes |
| SessionEnd | capture.js | - | yes |

## Per-host subsets

- Codex: hook set in `~/.codex/hooks.json`; **PreToolUse matcher is Bash-only**.
- Cursor: 6 lifecycle events (1.7+) in `~/.cursor/hooks.json` → `~/.cursor/hivemind/bundle/`.
- Hermes: shell hooks in `config.yaml`, plus the MCP server for direct recall.

## Two hard rules

1. **Honor timeouts, dispatch heavy work async.** Recall injection (SessionStart, UserPromptSubmit) is on the critical path; keep it well under timeout. Capture (PostToolUse, Stop, SubagentStop, SessionEnd) is fire-and-forget - mark `async: true`.
2. **Fail open.** A hook must never crash the host. Wrap the entry body; on failure log and `process.exit(0)`. A throwing PreToolUse hook can block the tool call.

## Direction of flow

- Write side: capture entries write traces to the Deep Lake `sessions` table.
- Read side: recall is queried and injected at SessionStart and UserPromptSubmit so the model sees prior memory in context.
