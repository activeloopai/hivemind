# Source: Shared-Core + Per-Harness-Bundle Architecture and Build

- **Retrieved:** 2026-06-16
- **Source type:** Hivemind repo (authoritative) + host plugin docs
- **In-repo anchors:** `src/`, `src/cli/install-*.ts`, `harnesses/<agent>/`, `harnesses/claude-code/hooks/hooks.json`

---

## The three-layer model

Hivemind is one TypeScript codebase (TS `^6` / Node `>=22` / ESM) that ships into six coding assistants:

- **Shared core** (`src/`): all real logic - capture, recall, Deep Lake API (`src/deeplake-api.ts`, `src/deeplake-schema.ts`), graph, MCP server (`src/mcp/server.ts`), skillify.
- **Per-agent installer** (`src/cli/install-<agent>.ts`): detects the host, writes its config, lays down its bundle.
- **Per-agent build output** (`harnesses/<agent>/`): the packaged artifact each host loads.

Build: `tsc` for typecheck, `esbuild` to emit per-harness bundles. Tests: Vitest `^4`.

## The six harnesses

| Harness | Build output dir | Mechanism |
|---|---|---|
| Claude Code | `harnesses/claude-code/` | marketplace plugin (plugin.json + hooks.json + skills + bundle/) |
| Codex | `harnesses/codex/` | hooks.json + install.sh + .codex-plugin + skills |
| Cursor | `harnesses/cursor/` | hooks.json wiring + VS Code/Cursor extension/ |
| Hermes | `harnesses/hermes/` | shell hooks + skill + MCP server registration |
| pi | `harnesses/pi/` | AGENTS.md marker + raw-TS extension |
| OpenClaw | `harnesses/openclaw/` | native extension (openclaw.plugin.json + contracted tools) |

## Bundle path resolution

Hook commands resolve from the host's own root variable, never an absolute path:

- Claude Code: `node "${CLAUDE_PLUGIN_ROOT}/bundle/<entry>.js"` (host injects `CLAUDE_PLUGIN_ROOT`).
- Cursor / Hermes: `~/.<host>/hivemind/bundle/`.
- pi: `~/.pi/agent/` (raw `.ts`, compiled at load).

This is why the marketplace plugin and a local install both resolve correctly without manifest edits.

## Data flow

Capture hooks write traces to the Deep Lake `sessions` table; recall is injected at SessionStart and UserPromptSubmit. The integration's job is to capture into shared memory and inject relevant recall, identically across all six hosts.
