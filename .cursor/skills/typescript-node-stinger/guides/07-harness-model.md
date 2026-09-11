# 07 - The Harness Model

Hivemind ships to many coding agents. Each one is a "harness" with its own packaging and install path. The same `src/` builds into per-harness bundles via `esbuild.config.mjs` (`guides/04`).

## The harnesses

| Harness | Bundle output | Notes |
|---|---|---|
| Claude Code | `harnesses/claude-code/bundle` | Full hook set (session-start, capture, pre-tool-use, session-end, graph + skillify workers). Plugin manifest under `.claude-plugin/`. |
| Codex | `harnesses/codex/bundle` + `harnesses/codex/skills` | Has its own `package.json`. |
| Cursor | `harnesses/cursor/bundle` | |
| OpenClaw | `harnesses/openclaw/dist` + `skills` + `openclaw.plugin.json` + `package.json` | The OpenClaw plugin; `audit:openclaw` checks the bundle. |
| Hermes | `harnesses/hermes/bundle` | |
| pi | `harnesses/pi/extension-source` | Extension source. |
| MCP | `mcp/bundle` | The MCP server (`guides/05`). |
| CLI | `bundle/cli.js` | The `hivemind` bin. |

## What is shared vs per-harness

- **Shared:** everything in `src/`. The Deep Lake client, the schema, the SQL guards, the shell, the skillify logic - written once.
- **Per-harness:** which entry points get bundled, where they land, and the manifest/plugin JSON. Different harnesses fire different hooks (e.g. only the Claude Code session-start fires the SkillOpt trigger).

The `package.json#files` allowlist enumerates exactly which harness outputs ship to npm (`guides/14`, `guides/18`).

## Detached workers resolve relative to their bundle

Some hooks spawn workers detached (the graph builder, the SkillOpt worker). Because each harness bundles into a different directory, a detached worker must resolve its sibling via `import.meta.url`, not a hardcoded path:

```ts
const here = fileURLToPath(new URL(".", import.meta.url));
const worker = resolve(here, "skillopt-worker.js");
```

A hardcoded path works in one harness and breaks in the others - **must-fix**.

## Wiring a new harness install path

See `examples/06`. The steps:

1. Add the harness's entry-list and a `build({...})` call (or `outdir`) in `esbuild.config.mjs`.
2. Add the harness's `package.json` / plugin manifest to `SCALAR_TARGETS` in `scripts/sync-versions.mjs` so its version stays single-sourced.
3. Add the harness output paths to `package.json#files`.
4. Add a `tests/<harness>/` folder mirroring it, with at least one `*.test.ts`.

## Common findings

- A worker resolved by hardcoded path instead of `import.meta.url` - **must-fix**.
- A new harness manifest not added to `sync-versions` `SCALAR_TARGETS` - **must-fix** (version drifts).
- Harness-specific output missing from `package.json#files` - **must-fix** (ships broken).
- No `tests/<harness>/` mirror - **should-refactor**.

## Sources

- `esbuild.config.mjs`, `scripts/sync-versions.mjs`, `package.json#files`.
- `harnesses/` tree in the repo.
- `research/2026-06-16-esbuild-multi-target-bundling.md`.
