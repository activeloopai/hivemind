# Changelog Entry Template

Copy this into `CHANGELOG.md`. The top version must equal `package.json` (single-sourced across manifests by `scripts/sync-versions.mjs`). Fill every `{{placeholder}}`.

---

## [{{VERSION}}] - {{YYYY-MM-DD}}

### [BREAKING] {{surface}} - {{what changed}}

**Who is affected:** {{Which consumers break. Be specific: a tool's callers, importers of a TS symbol, users of a CLI flag.}}
**Migration:** {{Step-by-step fix. Include the new schema / signature / flag.}}
**Why:** {{One line.}}

---

### Added: {{surface}}

{{One sentence. New MCP tool, new optional schema field, new exported symbol, or new CLI command/flag. Always non-breaking.}}

---

### Changed: {{surface}} - {{what changed}}

{{Non-breaking behavior change. If it breaks a consumer, move it to [BREAKING] above.}}

---

### Deprecated: {{surface}} (use {{replacement}} instead)

{{Still works, will be removed. Mark the TS symbol `@deprecated`. Give a removal version/date.}}

---

### Fixed: {{surface}} - {{what was broken}}

{{Bug fix that restores documented behavior. No migration needed.}}

---

## Notes on this template

- The consumer-facing surfaces are: **MCP tools** (`src/mcp/server.ts`), the **TS public API** (exported symbols), and the **CLI** (`src/cli/index.ts`).
- Use **[BREAKING]** for: removing/renaming a tool or its fields, tightening a schema, changing an output shape consumers parse, removing/renaming an exported symbol or CLI command/flag, changing a flag's meaning.
- Use **Deprecated:** for surfaces that still work but will be removed; pair with `@deprecated` in the TS source.
- Use **Added:** for non-breaking additions.
- The version chain: bump `package.json`