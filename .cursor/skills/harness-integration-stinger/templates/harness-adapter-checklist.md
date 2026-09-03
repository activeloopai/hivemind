# Template: Harness Adapter Checklist

Use this to add or audit a Hivemind harness adapter end-to-end. Copy it into a report or PR description and check each item.

---

## Harness: `<name>`

**Wiring mechanism(s):** `[ ] hooks  [ ] native extension  [ ] MCP server  [ ] AGENTS.md marker`
(most hosts combine two - e.g. hooks + extension, or shell hooks + MCP)

---

## 1. Capability detection (`src/cli/install-<name>.ts`)

- [ ] Detection probes only the filesystem (host home dir / binary), e.g. `existsSync(~/.<name>/...)`
- [ ] Detection has NO side effects (no writes, no spawn)
- [ ] Returns false cleanly when the host is absent
- [ ] Added to the `hivemind install` auto-detect loop

## 2. Build output (`harnesses/<name>/`)

- [ ] esbuild emits the host bundle into `harnesses/<name>/`
- [ ] Shape mirrors the existing adapters (plugin/manifest + bundle entries + skills as the host requires)
- [ ] Bundle paths resolve from the host's own root variable, never hardcoded absolute

## 3. Wiring

### If hooks:
- [ ] Each event forks `node "<bundle>/<entry>.js"`
- [ ] Capture events run `async: true`; recall events stay under their timeout
- [ ] Per-event timeouts set sensibly (recall ~10s, capture 10-30s, pre-tool up to 60s)
- [ ] Every hook fails open (no crash blocks the host)
- [ ] Event set consistent with the other hooks-based hosts

### If native extension:
- [ ] Extension registers the contracted tools
- [ ] (pi) raw `.ts` shipped - NOT pre-compiled/bundled
- [ ] (OpenClaw) `openclaw.plugin.json` declares `contracts.tools` + `contracts.commands`

### If MCP:
- [ ] `src/mcp/server.ts` registered under `mcp_servers.<name>` via `install-mcp-shared.ts`
- [ ] Server exposes the contracted tools

### If AGENTS.md marker:
- [ ] Marker block wrapped in begin/end markers (idempotent replace)

## 4. Tool / command contract (`guides/03-tool-contract.md`)

- [ ] `hivemind_search`/`hivemind_read`/`hivemind_index` exposed with identical name, args, return shape
- [ ] (OpenClaw) `hivemind_goal_add`/`hivemind_kpi_add` declared
- [ ] No host-only tool variants
- [ ] Any new tool landed in ALL adapters in the same change

## 5. Lifecycle / data flow

- [ ] Capture writes traces to the Deep Lake `sessions` table
- [ ] Recall injected at session start and on prompt
- [ ] Behavior matches the other hosts (a trace written here is recallable elsewhere)

## 6. Idempotency

- [ ] Re-running install converges (upsert config keys, replace marker blocks, filter-then-readd hooks)
- [ ] No duplicate entries on second run

## 7. Distribution (if applicable)

- [ ] (Claude Code) `plugin.json` + `hooks.json` valid; version bumped
- [ ] (OpenClaw) `scripts/audit-openclaw-bundle.mjs` clean - no bare `spawn`/`execFileSync`; subprocess via `createRequire`

---

## Findings

| # | Severity | Description | Guide ref |
|---|---|---|---|
|   |          |             |           |
