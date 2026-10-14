# Reports

This folder accumulates past documentation audit summaries produced by `mcp-tool-docs-worker-bee`.

## Report shape

Each report is a dated markdown file named: `YYYY-MM-DD-{surface}-docs-audit.md`

A report contains:

1. **Surface:** what was audited (MCP tools, TS public API, CLI, or in-repo docs) and the source files of record.
2. **Audit table:** pass/warn/fail for each of the 10 done-checklist items.
3. **Drift findings:** numbered list of doc-to-code mismatches, each with severity (critical / high / medium / low) and a fix recommendation.
4. **Actions taken:** what docs were changed during the session.
5. **Open items:** drift not fixed in this session, with owner and target date.

## Example report file naming

```
reports/2026-06-16-mcp-tools-docs-audit.md
reports/2026-06-16-cli-reference-initial.md
```

Reports are optional. Emit one when the user asks for an audit summary or when multiple dri