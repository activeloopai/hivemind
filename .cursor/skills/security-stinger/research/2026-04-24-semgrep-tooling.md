# Deterministic Scanning Tools - semgrep, eslint-plugin-security, npm audit

**Sources:**
- https://semgrep.dev/p/javascript
- https://semgrep.dev/p/typescript
- https://semgrep.dev/p/eslint-plugin-security
- https://semgrep.dev/docs/languages/javascript
- https://semgrep.dev/blog/2025/a-technical-deep-dive-into-semgreps-javascript-vulnerability-detection/
- https://docs.npmjs.com/cli/v10/commands/npm-audit

**Retrieved:** 2026-04-24
**Query used:** "semgrep ruleset Next.js TypeScript eslint-plugin-security"

## Summary

Three tools, each deterministic, each cheap to run as Phase 1 automation before the Bee spends judgment-cycles:

1. **`npm audit`** - built-in, zero setup. Surfaces known CVEs in the dependency tree with severity. Fast. JSON output. Run `npm audit --json --audit-level=high` for the CI-friendly variant.
2. **`semgrep --config p/javascript --config p/typescript --config p/eslint-plugin-security`** - pattern-based static analysis, catches SQLi, command injection, path traversal, hardcoded secrets, and ~200 other patterns with low false-positive rate on this stack.
3. **`eslint-plugin-security`** - ESLint plugin, already likely in the project. Finds `fs.readFile` with user input, `eval`, `child_process.exec` with dynamic strings, etc.

## Recommended invocation

```bash
# one-shot - pipe outputs into a gitignored local scratch dir like .scan-output/
npm audit --json --audit-level=high > .scan-output/npm-audit.json
npx semgrep --config p/javascript --config p/typescript --config p/eslint-plugin-security \
  --json --output .scan-output/semgrep.json \
  --exclude node_modules --exclude .next --exclude dist
npx eslint . --ext .ts,.tsx,.js,.jsx --plugin security --format json -o .scan-output/eslint.json
```

## What the tools DON'T catch (Bee judgment required)

- IDOR - they can't know which fields are "resource owner".
- Business-logic price/quantity manipulation.
- PII-in-logging (they find `console.log` but not whether the argument is PII).
- Multi-tenant missing scope.
- PCI DSS architectural violations (Stripe Elements vs. raw card) - tools see data-flow, not regulatory intent.
- Server-components-leaking-to-client - requires understanding the Next.js data-serialization model.

## Relevance to this stinger

- `scripts/scan.sh` runs the three tools above and drops JSON reports into a local gitignored scratch dir (e.g. `.scan-output/`) - the Bee reads them, dedupes, and promotes findings into its own report.
- The Bee's value is concentrated in the "DON'T catch" list - `guides/00-principles.md` says so explicitly so Bee time is spent on judgment, not on re-running grep.
