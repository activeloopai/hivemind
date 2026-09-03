# Example: Hivemind Breaking Change Entry

> Demonstrates: identifying a contract break across the wide surface, labeling the bump, the Deprecated -> Removed path, migration notes, and where to distribute.
> Guide references: `guides/02-semver-decisions.md`, `guides/03-copy-craft.md`, `guides/04-release-mechanics.md`

---

## Input (what the team provided)

```
We changed the Deep Lake capture schema: the `embedding` tensor moved from
float32 to float16 to halve storage. Datasets written by the new CLI cannot be
read by clients before this version, and vice versa.
We also renamed the MCP tool `search_memory` to `memory.search` for consistency.
The harness contract is unchanged.
Migration: run `hivemind migrate --to 0.9` to re-encode existing datasets.
We warned about the MCP rename one release ago (deprecated in 0.8.2).
```

---

## Semver decision

Two contract breaks:
- **Deep Lake schema:** old and new clients cannot read each other's datasets -> **breaking**.
- **MCP tool surface:** `search_memory` removed (renamed) -> **breaking** for any agent still wired to the old name. It was deprecated in 0.8.2, so the removal path is clean.

Highest candidate is **MAJOR** -> `0.9.0` (treated as the breaking bump on the `0.x` line per repo convention). Set `package.json` deliberately; do not let the pipeline auto-patch it (`guides/04-release-mechanics.md`).

---

## Output (the CHANGELOG entry)

```markdown
## [0.9.0] - 2026-06-16

Breaking: the capture schema changed to halve storage, and the `search_memory` MCP tool is now `memory.search`. Run the migration before upgrading shared datasets.

### Changed
- **Deep Lake schema:** the capture `embedding` tensor is now `float16` (was `float32`), halving dataset storage. **Datasets written by 0.9+ cannot be read by older clients, and vice versa.** Re-encode existing datasets with `hivemind migrate --to 0.9` before upgrading any client that shares them.

### Removed
- **MCP tool `search_memory`:** renamed to `memory.search` (deprecated since 0.8.2). Update any agent wired to `search_memory`. The input and result schemas are unchanged - only the tool name.

### Migration
1. On one machine, upgrade to 0.9.0 and run `hivemind migrate --to 0.9` against each shared dataset.
2. Upgrade every client and harness that reads those datasets to 0.9.0; mixed-version access is not supported.
3. Repoint any agent calling `search_memory` to `memory.search`.
```

---

## Why the schema change is a `Changed`, not just `Removed`

The capability (capture/recall) still exists; its on-disk contract changed incompatibly. That is a breaking `Changed` with an explicit migration. The MCP rename is a `Removed` because the old tool name is gone.

---

## Distribution (mandatory for a contract break)

- **GitHub Release** body = this entry, with the migration steps front and center (cut by `release.yaml`).
- **README:** add an upgrade callout linking the migration steps; harness users read the README before pinning a new version.
- **Slack community post:** lead with "0.9.0 is a breaking release - migrate shared datasets first," then the two-line how-to and the release link. This is the channel the six-harness users watch; do not let a schema break surprise them.

---

## Notes on format

- Breaking entries open with `Breaking:` so the impact is unmissable.
- A schema or MCP break always carries explicit migration steps and a removal/deprecation lineage.
- The harness contract was unchanged here, so it gets no entry - only name the surfaces that actually moved.
