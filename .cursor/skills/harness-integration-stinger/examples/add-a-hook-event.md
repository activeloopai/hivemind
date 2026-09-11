# Example: Add a Hook Lifecycle Event

**Demonstrates:** `guides/02-hook-lifecycle.md`, `guides/00-architecture-and-wiring.md`

This example adds capture on a new lifecycle event (`SubagentStop`) to the hooks-based hosts and wires the bundle entry it forks.

---

## Flow

```
Decide capture vs recall → add/point at a bundle entry → add the event to each hooks-based host
  → set timeout + async correctly → verify it fails open
```

---

## Step 1: Capture or recall?

`SubagentStop` fires when a subagent turn ends. That is a write (capture turn end), not a read. So it reuses the existing `capture.js` entry and runs `async: true` - the host should not wait on it.

## Step 2: Add the event to Claude Code (`harnesses/claude-code/hooks/hooks.json`)

```jsonc
{
  "SubagentStop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"${CLAUDE_PLUGIN_ROOT}/bundle/capture.js\"",
          "timeout": 30,
          "async": true
        }
      ]
    }
  ]
}
```

## Step 3: Mirror it on the other hooks-based hosts

Add the same event to every host whose lifecycle supports it, resolving the bundle path from that host's root:

- **Codex** (`~/.codex/hooks.json`) - remember PreToolUse is Bash-only; SubagentStop is unaffected.
- **Cursor** (`~/.cursor/hooks.json`) - fork from `~/.cursor/hivemind/bundle/capture.js`.
- **Hermes** (`config.yaml` `hooks:`) - fork from `~/.hermes/hivemind/bundle/capture.js`.

Keeping the event set consistent across hosts keeps the capture surface identical, so a subagent turn is recorded the same way everywhere.

## Step 4: The bundle entry

If the event needed new logic (it does not here - `capture.js` already handles turn ends), you would add an esbuild entry point and emit it into each `harnesses/<agent>/bundle/`. The entry reads the event payload on stdin, writes a trace to the Deep Lake `sessions` table, and exits.

## Step 5: Fail open

`capture.js` must never crash the host. Wrap the body so a Deep Lake outage logs and exits 0 rather than returning a status the host treats as a block.

```typescript
try {
  const payload = await readStdin();
  await captureTrace(payload);     // write to sessions table
} catch (err) {
  logQuietly(err);                  // never throw on the hook path
} finally {
  process.exit(0);                  // fail open
}
```

---

## Key patterns demonstrated

1. **Capture events run `async: true`** - off the critical path.
2. **Same event across all hooks-based hosts** - consistent capture surface.
3. **Bundle path resolves from the host root** - `${CLAUDE_PLUGIN_ROOT}` vs `~/.<host>/hivemind/bundle/`.
4. **Honor the per-event timeout** - 30s for the heavier capture entries.
5. **Fail open** - a hook crash must not block the agent.
