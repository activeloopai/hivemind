# Jest - preserved alternative

> Demoted in favor of **Vitest** (see `guides/10-vitest-discipline.md`). Hivemind runs `vitest run` + `@vitest/coverage-v8`.

## Why Vitest is canonical

- **ESM-native.** Hivemind is a strict ESM package (`"type": "module"`, Node16 resolution). Vitest runs ESM and TypeScript out of the box. Jest's ESM support still leans on experimental VM modules and `babel-jest` / `ts-jest` transforms - friction this repo does not want.
- **No transform config.** Vitest reuses the project's tsconfig and esbuild-style transforms; there is no `jest.config` + `ts-jest` + `babel.config` stack to maintain.
- **`vitest run` is the CI shape.** `npm test` = `vitest run` (non-watch), chained in `npm run ci` after typecheck and dup. Coverage is `@vitest/coverage-v8` (`guides/10`).
- **Familiar API.** `describe` / `it` / `expect` / `vi.fn` / `vi.spyOn` mirror Jest, so the migration cost is near zero and the mocking patterns in `tests/` read like Jest.

## What Jest is good at (and why it doesn't tip here)

- **Huge plugin ecosystem and snapshot tooling** - Vitest covers snapshots and the common matchers; the repo's tests are unit tests of pure functions and mocked clients, not snapshot-heavy UI.
- **Established in CJS codebases** - exactly the case Hivemind is not.

## API map

| Jest | Vitest |
|---|---|
| `jest.fn()` | `vi.fn()` |
| `jest.spyOn(o, "m")` | `vi.spyOn(o, "m")` |
| `jest.mock("mod")` | `vi.mock("mod")` |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| `jest --coverage` | `vitest run --coverage` (provider `v8`) |
| `jest --watch` | `vitest` (watch) - but CI uses `vitest run` |

The imports differ: Vitest needs `import { describe, it, expect, vi } from "vitest"`, whereas Jest injects globals. That explicit import is the only real porting step.

## If you find Jest in a repo

It is fine for CJS. For an ESM/TS repo like Hivemind, Vitest removes the transform layer. Port by swapping `jest.` -> `vi.`, adding the `vitest` import, and pointing CI at `vitest run`.

## Sources

- `package.json` (`test`, `ci`, `vitest`, `@vitest/coverage-v8`), `tests/` patterns.
- `research/2026-06-16-vitest-esm-discipline.md`.
