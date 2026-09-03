# 10 - Vitest Discipline

Tests are Vitest ^4. `npm test` runs `vitest run` (not watch). Coverage is `@vitest/coverage-v8`. There are 229 `*.test.ts` under `tests/` and they mirror the harness layout.

## The layout mirrors harnesses

`tests/` mirrors the harness and subsystem structure:

```
tests/
  claude-code/    # hooks, auth, advisor, etc.
  codex/
  cursor/
  hermes/
  openclaw/
  pi/
  cli/
  scripts/
  shared/         # shared/graph and other cross-harness units
```

When you add a unit under `src/` that a given harness uses, its test lands in the matching `tests/<harness>/` (or `tests/shared/` if cross-harness). A new exported function with no test is a **should-refactor**; a new MCP tool or hook with no test is closer to a must-fix because those are the load-bearing surfaces.

## `vitest run`, not watch

CI invokes `vitest run` - a single non-interactive pass that exits with a status code. `npm run ci` chains it after `typecheck` and `dup` (`typecheck && dup && test`). Never wire CI to bare `vitest` (watch mode hangs the runner).

## Coverage

`@vitest/coverage-v8` produces coverage when requested (`vitest run --coverage`). Use it to find the load-bearing untested paths - the Deep Lake client's retry branches, the schema healing diff, the MCP error paths. Chase coverage on the code that fails silently, not on trivial getters.

## Test isolation

- **No order dependence.** Each test sets up and tears down its own state. A test that only passes after another ran is a **must-fix** - it will flake under `vitest run`'s scheduling.
- **No real network.** Deep Lake calls are mocked (`guides/11`). A test that hits `api.deeplake.ai` is a **must-fix** - it is slow, flaky, and pollutes a real org.
- **Temp dirs, not the repo.** Filesystem tests use an OS temp dir and clean up in `afterEach`.

## Structure

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { searchDeeplakeTables } from "../../src/mcp/server.js";

describe("searchDeeplakeTables", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns rows for a matching query", async () => {
    const api = makeFakeApi([{ path: "/summaries/a/1.md", content: "hit" }]);
    const rows = await searchDeeplakeTables(api, "mem", "sess", opts, { truncated: false });
    expect(rows).toHaveLength(1);
  });
});
```

Note the `.js` extension on the relative import even in a test - same ESM rule as `src/` (`guides/02`).

## Common findings

- A new exported function / MCP tool / hook with no `*.test.ts` - **should-refactor** to **must-fix** by surface.
- An order-dependent test - **must-fix**.
- A test hitting the real Deep Lake endpoint - **must-fix**.
- CI wired to `vitest` (watch) instead of `vitest run` - **must-fix**.
- A test import missing the `.js` extension - **should-refactor**.

## Sources

- `package.json` (`test`, `ci` scripts; `vitest`, `@vitest/coverage-v8` devDeps).
- `tests/` tree in the repo.
- `research/2026-06-16-vitest-esm-discipline.md`.
