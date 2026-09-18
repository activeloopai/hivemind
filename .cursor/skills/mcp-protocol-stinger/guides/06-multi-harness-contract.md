# 06 - Multi-Harness Contract Stability

The Hivemind MCP/tool contract is consumed by multiple harnesses. Changing it is a breaking-change decision, not a refactor.

---

## The consumers

Hivemind's memory is reached through more than one surface. The tool names and their argument shapes are a public contract across all of them:

| Consumer | How it reaches the tools | Tool set it depends on |
|---|---|---|
| **Hermes harness** | Registers the MCP server under `mcp_servers.hivemind` in `~/.hermes/config.yaml`; spawns `node .../.hermes/hivemind/bundle/...`. Direct `tools/call`. | `hivemind_search`, `hivemind_read`, `hivemind_index` |
| **OpenClaw** | Plugin declares contracted tools. | `hivemind_search`, `hivemind_read`, `hivemind_index`, plus `goal_add`, `kpi_add` |
| **pi** | Extension (`harnesses/pi/extension-source/hivemind.ts`) registers tools via `pi.registerTool({ name: "hivemind_search", ... })`. | `hivemind_search`, `hivemind_read`, `hivemind_index` |
| **Claude Code, Codex, Cursor** | Consume the same memory surface through their installers/bundles. | the `hivemind_*` recall tools |

Two facts follow:

1. **The three recall tools (`hivemind_search`, `hivemind_read`, `hivemind_index`) are the stable core.** They appear, by the same names and the same argument shapes, in the MCP server (`src/mcp/server.ts`) AND in the pi extension AND in Hermes' skill doc AND in OpenClaw. The names are duplicated across implementations precisely *because* they are a contract; they must stay in lockstep.
2. **OpenClaw additionally contracts `goal_add` / `kpi_add`.** These are not in the MCP server today - they are OpenClaw-side tools. If they ever migrate to the MCP server, the names and shapes are already claimed and must match.

---

## What "stable contract" means in practice

A change is **safe** (additive):
- Adding a brand-new tool with a new name.
- Adding an `.optional()` parameter with a handler default.
- Widening a numeric bound (e.g. `max(50)` -> `max(100)`).
- Improving a `description` without changing behavior.

A change is **breaking** (coordinate across all consumers, escalate):
- Renaming a tool (`hivemind_search` -> `hivemind_query`). Every harness that hard-codes the name breaks.
- Renaming, removing, or making-required a previously-optional parameter.
- Changing a parameter's type or tightening a bound so previously-valid calls now fail `-32602`.
- Changing the result content shape consumers parse (e.g. the tab-separated `path\tlast_updated\tproject\tdescription` format `hivemind_index` returns is parsed downstream - reshaping it is breaking).
- Removing a tool, or changing which channel a failure uses.

---

## Cross-surface consistency rules

When auditing or changing the contract:

- **The MCP server is the source of truth for the three recall tools.** If the pi extension's `hivemind_search` schema drifts from `src/mcp/server.ts`, that is a defect even though both "work" - the agent's mental model of the tool must be identical wherever it runs.
- **Descriptions should agree across surfaces.** Hermes' skill doc, the pi extension, and the MCP server all describe `hivemind_search` as keyword/regex search across summaries + sessions. Divergent descriptions teach the model different things depending on harness.
- **Version reporting must be consistent.** `serverInfo.version` (MCP) and the bundle versions are synced by `scripts/sync-versions.mjs`. A version mismatch between surfaces is a release defect.
- **The output format is part of the contract.** `hivemind_index` returns a header line plus tab-separated rows with `?`/empty placeholders for null fields (never the literal strings `"null"`/`"undefined"`). Anything parsing that output depends on the format and the placeholder convention.

---

## Audit checklist (multi-harness)

- [ ] The three recall tool names match exactly across `src/mcp/server.ts`, the pi extension, the Hermes skill doc, and OpenClaw.
- [ ] Argument shapes (names, types, optionality, bounds) match across surfaces.
- [ ] Any proposed rename/removal/required-param change is flagged as breaking and coordinated.
- [ ] Result content shapes consumers parse are unchanged (or the change is propagated everywhere).
- [ ] `goal_add` / `kpi_add` names/shapes stay reserved-and-consistent even though they live OpenClaw-side today.
- [ ] Version reporting is synced across all bundles and the MCP `serverInfo`.

---

*Sources: `research/2026-06-16-mcp-tool-contract-stability.md`, `research/2026-06-16-mcp-sdk-typescript.md`*
