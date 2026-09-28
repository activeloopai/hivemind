# jscpd duplication gate

**Date:** 2026-06-16
**Feeds:** `guides/03-quality-gate.md`

## Claim

Copy-paste duplication is a hard CI gate in Hivemind, tuned to tolerate intentional cross-harness mirroring.

## Evidence (from the repo)

- `package.json`: `"dup": "jscpd src"`, and `"ci": "npm run typecheck && npm run dup && npm test"` - so duplication is part of the gate.
- `.jscpd.json`: `threshold: 7`, `minLines: 10`, `minTokens: 60`, `format: ["typescript"]`, reporters `console` + `markdown`, output `./jscpd-report`.
- `ignore` list excludes `dist`, `bundle`, tests, fixtures, plugin dirs, and specific per-harness hooks (cursor/hermes/pi `wiki-worker`, `capture`, `session-start`, `pre-tool-use`, etc.) that are intentionally near-identical across harnesses.
- `ci.yaml` `duplication` job runs jscpd and uploads the `jscpd-report` artifact.

## Why it matters

- `threshold` is the percentage of duplicated code that fails the run; `minLines`/`minTokens` set the smallest clone that counts. Tuning these (not disabling jscpd) is how you keep the gate meaningful.
- The right response to a *legitimately* duplicated new harness hook is to add it to the `ignore` list with justification - matching the existing precedent - not to raise `threshold` globally (which would blind the gate everywhere).

## Sources

- jscpd: https://github.com/kucherenko/jscpd
- Repo: `.jscpd.json`, `package.json`, `.github/workflows/ci.yaml`.
