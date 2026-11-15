# 04 - Doc-to-Code Sync

Keeping Hivemind's docs honest as the code changes. Drift is the default state of documentation; the only docs that stay true are the ones a machine re-checks.

## What drifts

| Surface | Drift symptom | Source of truth |
|---|---|---|
| MCP tool | Description or schema no longer matches the zod `inputSchema`; a tool added/removed in `registerTool` | `src/mcp/server.ts` |
| TS public API | A hand-written API page contradicts the exported types | exported symbols + TypeDoc |
| CLI | A flag renamed/removed in the dispatch but still in the docs (or vice versa) | `src/cli/index.ts` `USAGE` + dispatch |
| In-repo docs | `docs/ARCHITECTURE.md`, `SKILLIFY.md`, `EMBEDDINGS.md`, `SUMMARIES.md`, `CAPTURE_TASKS.md` describe behavior the code no longer has | the relevant `src/` modules |
| Changelog | A released `@deeplake/hivemind` version with no entry | `package.json` version (single-sourced by `sync-versions`) |

## Manual sync pass

Run this before any docs-touching PR merges:

1. **Tools.** For each `registerTool` in `src/mcp/server.ts`, confirm the doc's name, description, schema table, output shape, and side-effect statement match. Confirm no tool was added or removed.
2. **CLI.** Walk the dispatch in `src/cli/index.ts`. Every routed command and flag must appear in the reference; every documented flag must be parsed.
3. **TS API.** Regenerate TypeDoc (`npm run docs:api`) and diff against the committed reference, or rely on CI to fail on a new undocumented export.
4. **In-repo docs.** Spot-check claims in `docs/*` against the modules they describe.
5. **Changelog.** Confirm the top of the changelog matches `package.json`'s version.

Emit a drift table:

| Surface | Item | Doc says | Code says | Action |
|---|---|---|---|---|
| MCP tool | `hivemind_search.limit` | max 100 | max 50 | Fix doc |
| CLI | `--token` | (missing) | parsed | Add to doc |

## CI gate

Gate sync in CI so drift cannot merge silently. Use the template at `templates/docs-sync-workflow.yml`. The workflow:

1. Runs `typedoc` and fails on warnings (a new undocumented export breaks the build).
2. Runs a check that the changelog's top version equals `package.json`'s version.
3. Optionally greps `src/mcp/server.ts` for the set of `registerTool` names and fails if a documented tool list does not match.

The point is not perfection - it is that a renamed flag or an added tool produces a red build, not a stale doc.

## Sync after a refactor

When a PR touches `src/mcp/server.ts`, the CLI dispatch, or an exported type:

1. Re-read the changed file.
2. Update the affected tool doc / CLI reference / doc comment **in the same PR**.
3. Regenerate TypeDoc if a public symbol changed.
4. Add a changelog entry if the change is consumer-visible.

Docs land with the code that changes them. A docs-only catch-up PR is a sign the gate failed.
