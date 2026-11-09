# 2026-06-16 - jscpd + husky/lint-staged gate (no ESLint/Prettier)

Authored 2026-06-16 from `package.json` and the jscpd config. Repo is the source of truth.

## Sources

- https://github.com/kucherenko/jscpd
- `package.json` (`dup` = `jscpd src`, `ci`, `lint-staged`, `prepare` = `husky && npm run build`).

## Summary

The entire quality gate is three tools:

- **`tsc --noEmit`** (`npm run typecheck`) - strict type-check.
- **`jscpd src`** (`npm run dup`) - duplication detection, threshold 7, minLines 10, minTokens 60, scoped to `src`. A copy-pasted block over the token threshold fails the run; the fix is to extract a shared helper, not to inline-ignore.
- **husky -> lint-staged** - the pre-commit hook runs `tsc --noEmit --skipLibCheck` on staged `*.ts` (and nothing on `*.md`). This is the local mirror of the CI typecheck stage.

`npm run ci` chains them: `typecheck && dup && test`.

There is **no ESLint and no Prettier**. This is deliberate (CodeRabbit profile is `chill`; the team leans on tsc + jscpd + review). Consequences for review:

- Style (naming, import grouping, spacing) is never a must-fix - the gate is types and duplication.
- Proposing to add a linter/formatter is an ADR-level decision, not a drive-by; it would also flood the diff/CI with pre-existing-line noise.

## Relevance

- `guides/13-jscpd-and-quality-gate.md`, `templates/package-scripts.json`, `templates/husky-pre-commit`, `templates/lint-staged.config`, and the severity rubric in `guides/00`.
