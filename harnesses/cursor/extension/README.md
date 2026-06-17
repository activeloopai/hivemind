# Hivemind for Cursor

First-party VS Code / Cursor extension: health checks, login, hook wiring, dashboard, codebase graph, rules, and Cursor skill sync. Works alongside the hooks integration installed by `hivemind cursor install` (see the main [README](../../../README.md#cursor-17)).

## What you get

| Surface | Purpose |
|---------|---------|
| **Status bar** | Four-dimension health: Hivemind CLI, `cursor-agent`, login, hooks wired |
| **Onboarding** | Wire hooks, log in, reload when `hooks.json` changes |
| **Dashboard webview** | KPIs, Hivemind settings, recent sessions, codebase graph, rules, skill sync |
| **Skill bridge** | Symlinks from `~/.claude/skills/` into Cursor skill roots on workspace open |

Hooks (capture, recall, skillify, graph, summaries) still run from `~/.cursor/hivemind/bundle/`. The extension merges `~/.cursor/hooks.json`; it does not replace the hook scripts.

> **Note on bundle provisioning:** the extension can copy the bundle from the monorepo build (`harnesses/cursor/bundle/`) when developing from source. A standalone VSIX install does not ship the bundle; the CLI (`hivemind cursor install`) or **Hivemind: Wire Hooks** must supply it first. See Requirements below.

## Requirements

- **Hivemind CLI** on `PATH` (`npm i -g @deeplake/hivemind`)
- **Cursor 1.7+** with the hooks API enabled
- **`cursor-agent`** on `PATH` and logged in (session wiki summaries; skillify gate on Cursor-only machines)
- **Hook bundle** at `~/.cursor/hivemind/bundle/` (from `hivemind cursor install`, extension **Wire Hooks**, or a dev build below)

When developing from this monorepo, the extension copies the bundle from **`harnesses/cursor/bundle/`** (output of `npm run build` at the repo root), not from npm.

## Install

### From source (development)

```bash
# repo root — build hook scripts first
npm install
npm run build

cd harnesses/cursor/extension
npm install
npm run compile
```

Open the `harnesses/cursor/extension/` folder in Cursor or VS Code, press **F5** (Extension Development Host), then run **Hivemind: Run Onboarding** in the new window.

### VSIX (local install)

```bash
cd harnesses/cursor/extension
npm install
npm run compile
npx @vscode/vsce package
```

Install the generated `.vsix` via **Extensions: Install from VSIX…**.

## Commands

| Command | Title |
|---------|-------|
| `hivemind.runOnboarding` | Hivemind: Run Onboarding |
| `hivemind.login` | Hivemind: Log In |
| `hivemind.logout` | Hivemind: Log Out |
| `hivemind.showStatus` | Hivemind: Show Status |
| `hivemind.wireHooks` | Hivemind: Wire / Refresh Hooks |
| `hivemind.unwireHooks` | Hivemind: Unwire Hooks |
| `hivemind.openLogs` | Hivemind: Open Logs |
| `hivemind.openDashboard` | Hivemind: Open Dashboard |

Activity bar: **Hivemind** container with a **Dashboard** webview.

## Health check dimensions

1. **Hivemind CLI** — `hivemind` on PATH and version probe
2. **cursor-agent** — binary on PATH (summaries + skillify gate)
3. **cursor-agent login** — auth state for headless summary generation
4. **Hooks wired** — all seven events present in `~/.cursor/hooks.json`, bundle at `~/.cursor/hivemind/bundle/`

Status **stale** when hooks reference an older bundle version than installed; run **Wire / Refresh Hooks**.

## Skill paths (Cursor)

Hivemind writes skills canonically under `~/.claude/skills/` and fans symlinks to:

- `~/.cursor/skills-cursor/` (global)
- `<workspace>/.cursor/skills/` (project)

The extension runs a sync on activation so Cursor discovers the same skills as Claude Code after `hivemind skillify pull`. Details: [docs/SKILLIFY.md](../../../docs/SKILLIFY.md).

## Development

```bash
npm run watch   # webpack watch → dist/extension.js
npm run lint    # tsc --noEmit
```

Layout:

```text
harnesses/cursor/
├── bundle/                # hook scripts (npm run build at repo root)
└── extension/
    ├── src/
    │   ├── extension.ts       # activation, status bar, onboarding
    │   ├── auth/              # device flow, API key, safe URL handling
    │   ├── health/            # D1–D4 checks, hook merge / bundle copy
    │   ├── statusbar/         # poller, commands, detail view
    │   ├── webview/           # dashboard shell + data bridge
    │   ├── graph/             # snapshot load, editor sync, impact overlay
    │   └── bridge/            # Cursor skill symlink sync
    ├── media/icon.svg
    └── dist/extension.js      # webpack output (published entry)
```

Architecture notes (hooks + session context): [library/knowledge/private/frontend/cursor-extension-architecture.md](../../../library/knowledge/private/frontend/cursor-extension-architecture.md).

## Troubleshooting

- **Hooks need review in Cursor** — Trust the Hivemind hook commands after install or re-wire; otherwise capture stays off.
- **Bundle missing** — Run `npm run build` in the repo root, then **Wire / Refresh Hooks**, or `hivemind cursor install` from a published npm package.
- **Empty session summaries** — Install `cursor-agent`, sign in, and confirm **Show Status** reports login OK. Check **Open Logs** for `wiki-worker.log` tail.
- **Reload after wiring** — Cursor only picks up `hooks.json` changes after a window reload; onboarding offers **Reload Window** when needed.
