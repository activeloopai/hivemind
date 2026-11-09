# Guide 01: Capability Detection and Auto-Install

**Sources:** `research/external/2026-06-16-capability-detection.md`, `research/external/2026-06-16-architecture-build.md`

---

## What `hivemind install` does

`hivemind install` auto-detects every coding assistant present on the machine and wires each one. There is one installer per host: `src/cli/install-claude.ts`, `install-codex.ts`, `install-cursor.ts`, `install-hermes.ts`, `install-pi.ts`, `install-openclaw.ts`, plus shared helpers (`install-mcp-shared.ts`, `install-scan.ts`).

Each installer is responsible for three things, in order:

1. **Detect** - is this host present? Cheap, side-effect free.
2. **Wire** - lay down the bundle and write the host's config (hooks file, extension, MCP stanza, or marker block).
3. **Stay idempotent** - re-running install must converge, never duplicate entries.

---

## Detection: cheap and side-effect free

Detection runs on every install for every host. It must only probe the filesystem - never write, never spawn. The standard probe is "does the host's home dir / binary exist?"

```typescript
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Claude Code: presence of ~/.claude/projects/
function claudeProjectsDir(): string {
  return join(homedir(), ".claude", "projects");
}
function isClaudeInstalled(): boolean {
  return existsSync(claudeProjectsDir());
}
```

| Host | Detection probe |
|---|---|
| Claude Code | `~/.claude/projects/` exists (and has `.jsonl` sessions) |
| Codex | `~/.codex/` exists |
| Cursor | `~/.cursor/` exists (hooks need 1.7+) |
| Hermes | `~/.hermes/config.yaml` exists |
| pi | `~/.pi/agent/` exists |
| OpenClaw | OpenClaw binary / plugin dir present |

> Detection must not write files or spawn work. A detection step that mutates state runs on every install and corrupts re-install idempotency. Source: `research/external/2026-06-16-capability-detection.md`.

---

## Wiring per host (what each installer writes)

Once a host is detected, its installer writes the host-specific config and lays down the bundle:

| Host | Config written | Bundle location |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` + `hooks/hooks.json` | `${CLAUDE_PLUGIN_ROOT}/bundle/` |
| Codex | `~/.codex/hooks.json` (+ `install.sh`, `.codex-plugin/plugin.json`) | host bundle dir |
| Cursor | `~/.cursor/hooks.json` + extension install | `~/.cursor/hivemind/bundle/` |
| Hermes | `~/.hermes/config.yaml` (`hooks:` + `mcp_servers.hivemind:`) | `~/.hermes/hivemind/bundle/` |
| pi | `~/.pi/agent/AGENTS.md` marker block + raw `.ts` extension | `~/.pi/agent/` |
| OpenClaw | `openclaw.plugin.json` (contracted tools/commands) | native extension dir |

---

## Idempotency

Every installer must be safe to re-run. The patterns:

- **Marker blocks** (pi's `AGENTS.md`): wrap the injected text in begin/end markers and replace the block on re-install rather than appending.
- **Config keys** (hermes `config.yaml`): upsert the `hivemind` key under `mcp_servers` / detect an existing hivemind hook before adding (`cmd.includes("/.hermes/hivemind/bundle/")`).
- **Hooks files**: rewrite the hivemind hook entries wholesale rather than appending duplicates.

```typescript
// Hermes: recognize an existing hivemind hook so re-install does not duplicate
function isHivemindHook(entry: unknown): boolean {
  const cmd = (entry as { command?: string })?.command;
  return typeof cmd === "string" && cmd.includes("/.hermes/hivemind/bundle/");
}
```

> Source: `research/external/2026-06-16-capability-detection.md`

---

## The shared MCP helper

Hosts that take an MCP server (hermes) use `src/cli/install-mcp-shared.ts` (`ensureMcpServerInstalled`, `MCP_SERVER_PATH`) to lay down `src/mcp/server.ts` and register it. Reuse this helper rather than re-implementing MCP wiring per host. See `guides/05-mcp-registration.md`.

---

## Local mining on first install

`install-scan.ts` performs a cheap one-time scan: if a host has prior sessions (e.g. `~/.claude/projects/*/*.jsonl`) and no mine-local manifest exists yet, it kicks off a background mine of that history into Hivemind. This is the one place install does heavyweight work, and it is explicitly gated behind a manifest check so re-installers never re-mine.

---

*See also:* `templates/install-path.ts` for an annotated installer skeleton, and `guides/00-architecture-and-wiring.md` for the wiring-mechanism matrix.
