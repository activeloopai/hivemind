# Guide 06: The Cursor Extension

Hivemind ships a first-party VS Code/Cursor extension at `harnesses/cursor/extension/`. This guide covers its build, its contributions, and how it relates to the hooks bundle.

## What the extension is

`hivemind-cursor-extension` (publisher `deeplake`, `engines.vscode: ^1.85.0`) runs alongside the hooks integration installed by `hivemind cursor install`. It is a separate build with its own `package.json` and webpack config. It gives the user, inside Cursor:

| Surface | Purpose |
|---|---|
| Status bar | Four-dimension health: Hivemind CLI, `cursor-agent`, login, hooks wired |
| Onboarding | Wire hooks, log in, reload when `hooks.json` changes |
| Dashboard webview | KPIs, settings, recent sessions, codebase graph, rules, skill sync |
| Skill bridge | Symlinks from `~/.claude/skills/` into Cursor skill roots on workspace open |

Hooks (capture, recall, skillify, graph, summaries) still run from `~/.cursor/hivemind/bundle/`. The extension merges `~/.cursor/hooks.json`; it does not replace the hook scripts.

## Manifest contributions (`package.json`)

The `contributes` block declares:

- **Commands** under the `hivemind.*` namespace: `runOnboarding`, `login`, `logout`, `showStatus`, `wireHooks`, `unwireHooks`, `openLogs`, `openDashboard`.
- **`viewsContainers.activitybar`**: a `hivemind` container with `media/icon.svg`.
- **`views.hivemind`**: a `hivemind.dashboard` webview view.

`activationEvents` is `["onStartupFinished"]`; `main` is `./dist/extension.js`.

## Build

Webpack with `ts-loader`, target `node`, output `dist/extension.js` (`commonjs2`), `vscode` marked external. Notable: the webpack config aliases `@hivemind` to the repo's `src/`, so the extension imports shared Hivemind code directly from source.

```bash
# repo root: build the hook scripts first
npm install
npm run build

# then the extension
cd harnesses/cursor/extension
npm install
npm run compile        # webpack --mode production
```

`npm run watch` runs webpack in dev/watch mode; `npm run lint` is `tsc --noEmit`.

## Activation flow (`src/extension.ts`)

On `activate()` the extension:

1. Sets the bundled extension src path for health checks.
2. Creates a `HealthPoller` and a status bar item wired to `hivemind.showStatus`, updating the bar from each poll snapshot.
3. Registers the `hivemind.*` commands and the dashboard webview.
4. Runs auto-sync (the skill bridge) on activation.
5. Starts the poller, and on first run prompts onboarding if not yet healthy.

Source is organized under `src/`: `statusbar/`, `webview/`, `bridge/`, `graph/`, `health/`, `auth/`, `utils/`, `types/`. Helper loaders live in `scripts/` (`load-dashboard.mjs`, `load-sessions.mjs`, `load-rules.mjs`, etc.).

## Bundle provisioning note

A standalone VSIX install does not ship the hook bundle. The bundle must be supplied first by the CLI (`hivemind cursor install`) or the **Hivemind: Wire Hooks** command. When developing from this monorepo, the extension copies the bundle from `harnesses/cursor/bundle/` (the output of `npm run build` at the repo root), not from npm.

## Requirements (for the extension to be healthy)

- Hivemind CLI on PATH (`npm i -g @deeplake/hivemind`).
- Cursor 1.7+ with the hooks API.
- `cursor-agent` on PATH and logged in (session wiki summaries).
- Hook bundle at `~/.cursor/hivemind/bundle/`.

## Handoff boundary

This Bee owns the extension's manifest, contributions, build, and the `vscode.*` activation surface. The TypeScript/UI code inside the dashboard webview and the TypeScript quality of the extension source are `typescript-node-worker-bee`'s. Packaging/publishing and CI are `ci-release-worker-bee`'s.
