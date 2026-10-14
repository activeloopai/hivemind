# 03 - Quality Gate

The checks that stand between a change and `main`. Local and CI run the same recipe.

## `npm run ci` is the gate

```
npm run ci = npm run typecheck && npm run dup && npm test
```

- **`typecheck`** = `tsc --noEmit` - full-tree type check, no emit.
- **`dup`** = `jscpd src` - duplication detection (see thresholds below).
- **`test`** = `vitest run` - the full Vitest ^4 suite.

A green local `npm run ci` should predict a green CI. If they diverge, that is itself a finding (see `guides/07-failure-modes.md`). When reviewing a change that touches the gate, verify the local recipe and the CI job still invoke the same commands.

## Vitest + coverage

- Runner: Vitest ^4, config in `vitest.config.ts`.
- Coverage: `@vitest/coverage-v8`. CI runs `vitest run --coverage` in the `test` job and posts a coverage summary to the job page plus a PR comment (via `davelosert/vitest-coverage-report-action`).
- A new test file needs no wiring beyond living where the config globs it. Do not invent a separate test runner.

## jscpd (duplication)

Config in `.jscpd.json`:

- `threshold: 7` - the duplication percentage that fails the run.
- `minLines: 10`, `minTokens: 60` - the minimum clone size that counts.
- `format: ["typescript"]`, scanned over `src`.
- Reporters: `console` + `markdown`; CI uploads the `jscpd-report` artifact.
- `ignore` list excludes `dist`, `bundle`, tests, fixtures, and a handful of per-harness hook files that are legitimately near-duplicate across harnesses (cursor/hermes/pi `wiki-worker`, `capture`, `session-start`, etc.).

**Duplication is a gate, not a vibe.** Copy-paste over threshold fails the build. If a PR adds a near-duplicate harness hook, the correct move is usually to add it to the `ignore` list *with justification* (it mirrors an existing harness intentionally) - not to silently raise `threshold`. Loosening `threshold` without justification is a **Should-refactor** finding.

## husky pre-commit + lint-staged

`.husky/pre-commit` runs `npx lint-staged`. `lint-staged` config in `package.json`:

```json
"lint-staged": {
  "*.ts": ["bash -c 'tsc --noEmit --skipLibCheck'"],
  "*.md": []
}
```

So the pre-commit gate is a fast `tsc --noEmit --skipLibCheck` over staged TS. `*.md` is intentionally a no-op.

## There is no ESLint and no Prettier

This is a hard fact about the repo. The quality gate is **tsc + jscpd + vitest + husky**, nothing else. Do not recommend adding an ESLint step, a Prettier check, or a "lint" script - they do not exist here and inventing one is a misread of the repo (**Must-fix** in a review of your own recommendation). If formatting consistency comes up, note that the project deliberately runs without a formatter rather than proposing one unprompted.

## `prepare` wires husky

`prepare` = `husky && npm run build`. On `npm install` in the repo, husky installs the git hooks (and the build runs). This is why a fresh clone gets the pre-commit hook automatically.

## Cross-reference

- `research/2026-06-16-vitest-coverage-v8-ci.md` - coverage-v8 + the PR-comment action.
- `research/2026-06-16-jscpd-duplication-gate.md` - jscpd thresholds and gating.
- `guides/04-workflows.md` - how `test` / `duplication` map to CI jobs.
