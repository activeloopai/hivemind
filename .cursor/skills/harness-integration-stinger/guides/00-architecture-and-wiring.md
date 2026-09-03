# Guide 00: Architecture and the Wiring-Mechanism Decision

**Sources:** `research/external/2026-06-16-architecture-build.md`, `research/external/2026-06-16-capability-detection.md`

---

## The shared-core + per-harness-bundle model

Hivemind is one TypeScript codebase that ships into six different coding assistants. The model has three layers:

| Layer | Location | Role |
|---|---|---|
| Shared core | `src/` | All real logic: capture, recall, Deep Lake API, graph, MCP server, skillify |
| Per-agent installer | `src/cli/install-<agent>.ts` | Detects the host, writes its config, lays down its bundle |
| Per-agent build output | `harnesses/<agent>/` | The packaged artifact each host loads (plugin, extension, skills, hooks) |

Stack: TypeScript `^6` / Node `>=22` / ESM. The build is `tsc` for typecheck plus `esbuild` to produce per-harness bundles. One core, six packaging shapes.

```
src/ (shared core)
  └─ tsc + esbuild
       ├─ harnesses/claude-code/   (marketplace plugin: plugin.json + hooks.json + skills + bundle/)
       ├─ harnesses/codex/         (hooks.json + install.sh + .codex-plugin + skills)
       ├─ harnesses/cursor/        (hooks.json wiring + first-party VS Code/Cursor extension/)
       ├─ harnesses/hermes/        (shell hooks + skill + MCP server registration)
       ├─ harnesses/pi/            (AGENTS.md marker + raw-TS extension)
       └─ harnesses/openclaw/      (native extension: openclaw.plugin.json + contracted tools)
```

> Source: `research/external/2026-06-16-architecture-build.md`

---

## The six harnesses and their wiring mechanisms

Each host exposes a different integration surface. Pick the mechanism the host actually supports - do not force hooks onto an extension-only host.

| Harness | Primary mechanism | Where it wires | Notes |
|---|---|---|---|
| Claude Code | Lifecycle hooks | `harnesses/claude-code/.claude-plugin/plugin.json` + `hooks/hooks.json` | Marketplace plugin; 7 hook events; skills (hivemind-memory/goals/graph) |
| Codex | Lifecycle hooks | `~/.codex/hooks.json` + `install.sh` + `.codex-plugin/plugin.json` | PreToolUse matcher is Bash-only |
| Cursor | Lifecycle hooks (1.7+) + extension | `~/.cursor/hooks.json` → `~/.cursor/hivemind/bundle/` | 6 lifecycle events; plus first-party VS Code/Cursor extension at `harnesses/cursor/extension/` |
| Hermes | Shell hooks + MCP server | `~/.hermes/config.yaml` (`hooks:` + `mcp_servers.hivemind`) | Registers `src/mcp/server.ts`; skill `hivemind-memory` |
| pi | AGENTS.md marker + TS extension | `~/.pi/agent/AGENTS.md` marker block + `harnesses/pi/extension-source/hivemind.ts` | Ships raw `.ts`; pi compiles at load; registers `hivemind_search`/`read`/`index` |
| OpenClaw | Native extension | `harnesses/openclaw/openclaw.plugin.json` | Declares contracted tools + commands; must pass ClawHub static scanner |

> Source: `research/external/2026-06-16-architecture-build.md`

---

## Wiring-mechanism decision matrix

Answer this first because the choice shapes the installer, the bundle, and how recall is delivered.

```
Does the host have a lifecycle-hook system (SessionStart/PreToolUse/Stop/etc.)?
  YES → Use hooks. Fork node "<bundle>/<entry>.js" per event.
         (Claude Code, Codex, Cursor, Hermes shell hooks)
   NO → Does the host load a native extension (VS Code API, plugin manifest)?
         YES → Ship an extension that registers the contracted tools.
                (Cursor extension, pi TS extension, OpenClaw native)
          NO → Does the host speak MCP?
                YES → Register src/mcp/server.ts as an MCP server. (Hermes)
                 NO → Fall back to an AGENTS.md marker block that
                      instructs the agent to call the tools. (pi)
```

Most real hosts combine mechanisms: Cursor uses hooks AND ships an extension; hermes uses shell hooks AND an MCP server; pi uses an AGENTS.md marker AND a TS extension.

---

## Bundle path resolution

**Never hardcode an absolute bundle path.** Resolve it from the host's own root variable so both the marketplace plugin and a local install work.

- **Claude Code** forks hooks as `node "${CLAUDE_PLUGIN_ROOT}/bundle/<entry>.js"`. `CLAUDE_PLUGIN_ROOT` is injected by the host; it points at wherever the plugin was installed.
- **Cursor / Hermes** resolve to `~/.<host>/hivemind/bundle/` (e.g. `~/.cursor/hivemind/bundle/`, `~/.hermes/hivemind/bundle/`).
- **pi** loads `~/.pi/agent/` extensions; the raw `.ts` is dropped there and compiled at load.

```jsonc
// harnesses/claude-code/hooks/hooks.json - every command resolves via the host root var
{
  "type": "command",
  "command": "node \"${CLAUDE_PLUGIN_ROOT}/bundle/session-start.js\"",
  "timeout": 10
}
```

> Source: `research/external/2026-06-16-architecture-build.md`

---

## What flows through the integration

The capture hooks write traces to the Deep Lake `sessions` table. Recall is injected back into the agent at `SessionStart` and `UserPromptSubmit`. `hivemind install` auto-detects which assistants are installed and wires each one. The integration's whole job is to (a) capture activity into shared memory and (b) inject relevant recall - identically across all six hosts.

---

*See also:* `guides/01-capability-detection-install.md` for how detection and auto-install work, and `guides/02-hook-lifecycle.md` for the event set.
