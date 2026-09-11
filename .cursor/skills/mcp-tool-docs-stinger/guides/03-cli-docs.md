# 03 - Documenting the `hivemind` CLI

How to document the `hivemind` command surface. The CLI bin is `hivemind` (`bundle/cli.js`); routing lives in `src/cli/index.ts`, with command implementations under `src/commands/*` and per-platform installers under `src/cli/install-*.ts`.

Document from the routing, never from memory. The `USAGE` string in `src/cli/index.ts` and the `if (cmd === ...)` / `if (sub === ...)` dispatch are the source of truth.

## Reading the dispatch

`src/cli/index.ts` routes on the first arg (`cmd`) and, for grouped commands, a sub-arg (`sub`). To document a command:

1. Find its branch in the dispatch (`if (cmd === "status") { runStatus(); return; }`).
2. Follow the handler into `src/commands/*` or `src/cli/*` to learn what it actually does and what it writes.
3. Read the matching block of the `USAGE` constant for the official flag list.

## The command surface

### Top-level install / lifecycle

| Command | Purpose | Key flags |
|---|---|---|
| `hivemind install` | Auto-detect assistants on this machine and wire Hivemind into each. | `--only <platforms>` (comma-separated), `--skip-auth`, `--token <value>` (or `HIVEMIND_TOKEN`) |
| `hivemind uninstall` | Auto-detect installed assistants and remove Hivemind from each. | `--only <platforms>` |
| `hivemind <agent> install` / `uninstall` | Install or remove for one assistant. `<agent>` ∈ `claude`, `codex`, `claw`, `cursor`, `hermes`, `pi`. | - |
| `hivemind login` | Device-flow login (opens a browser). | - |
| `hivemind status` | Show which assistants are wired up. | - |
| `hivemind update` | Check npm for a newer `@deeplake/hivemind`, upgrade the CLI, and refresh every detected agent bundle. | `--dry-run` |

`--only` takes the platform-id list from `allPlatformIds()`. `--token` (or env `HIVEMIND_TOKEN`) signs in non-interactively for CI; without it, a TTY install shows a consent prompt and a headless install skips auth.

### Memory and project commands

| Command | Purpose |
|---|---|
| `hivemind goal` / `goals` | Goal capture and listing (see `src/commands/goal.ts`). |
| `hivemind kpi` / `kpis` | KPI management against goals. |
| `hivemind context` | Print context for harnesses that lack a SessionStart hook (codex / pi / openclaw). |
| `hivemind graph` | Codebase-graph operations (`src/commands/graph.ts`). |
| `hivemind dashboard [--cwd <path>] [--out <path>] [--no-open] [--serve] [--port <n>]` | Build a self-contained HTML dashboard (KPI cards + codebase-graph) for the repo. |
| `hivemind rules` | Rules management (`src/commands/rules.ts`). |
| `hivemind skillify` | Skillify spec operations (`src/commands/skillify.ts`). |
| `hivemind embeddings <install\|enable\|disable\|uninstall\|status>` | Manage the embeddings runtime. |

Confirm every flag and subcommand against the current `USAGE` string and dispatch before publishing - the surface evolves.

## What to capture per command

For each command, the reference records:

1. **Usage line** - `hivemind <command> [flags]`, exactly as in `USAGE`.
2. **Purpose** - one or two sentences.
3. **Flags** - each flag, whether it takes a value, its default, and any env-var fallback.
4. **Side effects** - what it writes or changes. `install` patches assistant config files and copies bundles; `login` writes `~/.deeplake/credentials.json`; `dashboard` writes an HTML file. Be specific.
5. **Example** - a real invocation.

Use the template at `templates/cli-command-reference.md`. See `examples/hivemind-cli-reference.md` for a worked reference covering `install` / `status` / `login`.

## Honesty checks

- A flag in the docs that is not parsed in the dispatch is a defect. A parsed flag missing from the docs is a defect.
- `--only` values must match `allPlatformIds()` - do not invent platform ids.
- State the side effects precisely; "installs Hivemind" is not enough - say which files are touched.
