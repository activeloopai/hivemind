# Reports

This folder collects dependency audit reports produced by `dependency-audit-worker-bee` for the `@deeplake/hivemind` package over time.

Each audit run produces a dated markdown report at:
```
reports/YYYY-MM-DD-hivemind-dependency-audit.md
```

Use `templates/dependency-triage-report.md` as the starting structure. Each report contains:
1. **Summary counts** - critical/high/moderate/low from `npm audit`, and which gated CI
2. **Findings** - for each critical/high: direct vs transitive, reachability in `src/`, resolution, ignore policy if applicable
3. **Native-dependency surface check** - tree-sitter `postinstall` health, `overrides` alignment, pending native releases held by `minimumReleaseAge` + socket.dev
4. **Lockfile + publish-guard status** - `npm ci`, `package-lock.json` drift, `pack:check`, `audit:openclaw`, CodeQL, provenance
5. **Open items** requiring human review before the next release
6. **Action items** with owners and due dates

## Seeding this folder

This folder is empty initially. The first report is created when `dependency-audit-worker-bee` completes its first audit run against the package.
