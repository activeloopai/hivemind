# Source: Capability Detection and Auto-Install

- **Retrieved:** 2026-06-16
- **Source type:** Hivemind repo (authoritative)
- **In-repo anchors:** `src/cli/install-scan.ts`, `src/cli/install-*.ts`, `src/cli/install-mcp-shared.ts`

---

## Auto-detect

`hivemind install` auto-detects every coding assistant present and wires each. One installer per host (`install-claude.ts`, `install-codex.ts`, `install-cursor.ts`, `install-hermes.ts`, `install-pi.ts`, `install-openclaw.ts`) plus shared helpers (`install-mcp-shared.ts`, `install-scan.ts`).

## Detection: cheap, side-effect free

Detection probes only the filesystem (host home dir / binary). It runs on every install for every host and must NOT write or spawn.

```typescript
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function claudeProjectsDir() { return join(homedir(), ".claude", "projects"); }
```

| Host | Probe |
|---|---|
| Claude Code | `~/.claude/projects/` exists (with `.jsonl` sessions) |
| Codex | `~/.codex/` |
| Cursor | `~/.cursor/` (hooks need 1.7+) |
| Hermes | `~/.hermes/config.yaml` |
| pi | `~/.pi/agent/` |
| OpenClaw | OpenClaw binary / plugin dir |

## Wiring per host

Each installer writes the host config (hooks file, extension, MCP stanza, or AGENTS.md marker) and lays the bundle into the host bundle dir.

## Idempotency

Re-install must converge:
- Marker blocks (pi AGENTS.md): replace between begin/end markers.
- Config keys (hermes config.yaml): upsert the `hivemind` key; recognize an existing hivemind hook by bundle path before adding (`cmd.includes("/.hermes/hivemind/bundle/")`).
- Hooks files: rewrite hivemind entries wholesale, never append duplicates.

## install-scan.ts: one-time local mine

If a host has prior sessions (e.g. `~/.claude/projects/*/*.jsonl`) and no mine-local manifest exists, install kicks off a background mine of that history. It is gated behind a manifest check so re-installers never re-mine. This is the one place install does heavy work; detection itself stays cheap.
