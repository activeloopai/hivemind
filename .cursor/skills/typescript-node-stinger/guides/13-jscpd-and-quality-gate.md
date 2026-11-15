# 13 - jscpd & the Quality Gate

The whole quality gate is three things: `tsc`, `jscpd`, and a husky pre-commit hook. There is no ESLint and no Prettier. Do not add them.

## `npm run ci` is the gate

```
ci = typecheck && dup && test
   = tsc --noEmit && jscpd src && vitest run
```

That is the entire CI quality bar. Each stage must pass:

- **`typecheck`** = `tsc --noEmit` - strict types, no emit (`guides/12`).
- **`dup`** = `jscpd src` - duplication under threshold (below).
- **`test`** = `vitest run` - the suite (`guides/10`).

## jscpd: threshold 7

`jscpd` scans `src` with **threshold 7** (the percentage of duplicated tokens that fails the run), **minLines 10**, **minTokens 60**. A copy-pasted block of >=10 lines / >=60 tokens that pushes total duplication over 7% fails `npm run dup`.

The fix is never to inline-ignore the duplication - it is to extract the shared helper:

```ts
// Two tool handlers each building the same "narrow error -> errorResult" tail.
// Extract:
function toToolError(err: unknown, fallback: string): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  if (isMissingTableError(msg)) return errorResult(`${fallback} ${FRESH_ORG_HINT}`);
  return errorResult(`${fallback}: ${msg}`);
}
```

Duplication near the threshold is a **should-refactor**; duplication that fails the gate is a **must-fix** (the build is red).

## husky + lint-staged

`prepare` installs husky. The pre-commit hook runs lint-staged, which runs:

```json
"lint-staged": {
  "*.ts": ["bash -c 'tsc --noEmit --skipLibCheck'"],
  "*.md": []
}
```

So staged `.ts` files get a fast type-check (`--skipLibCheck` keeps it quick) before the commit lands. `.md` files have no hook. This is the local mirror of the CI `typecheck` stage - it catches type errors before they reach CI.

## There is no linter or formatter

This is deliberate. The repo runs `chill` on CodeRabbit and leans on `tsc` + `jscpd` + review for quality. Concretely:

- **Do not add ESLint.** No config exists; adding one introduces a fourth gate nobody agreed to and will flag thousands of pre-existing lines.
- **Do not add Prettier.** Formatting is by hand / editor; a Prettier pass would reformat the whole tree in one noisy diff.
- **Style is not a finding.** Naming, import grouping, and spacing are never must-fix here - the gate is types and duplication, not style (`guides/00` severity rubric).

If someone proposes adding a linter/formatter, that is an ADR-level decision (`guides/01` substitution policy), not a drive-by.

## Common findings

- Copy-paste over the jscpd threshold - **must-fix** (gate is red); extract the helper.
- A `jscpd:ignore` comment papering over duplication that should be extracted - **should-refactor**.
- A PR adding ESLint / Prettier without an ADR - **should-refactor** (push back; it is not the gate).
- Treating a style nit as must-fix - a credibility error, not a real finding.

## Sources

- `package.json` (`ci`, `dup`, `lint-staged`, `prepare`).
- jscpd config (threshold 7, minLines 10, minTokens 60).
- `research/2026-06-16-jscpd-husky-gate.md`.
