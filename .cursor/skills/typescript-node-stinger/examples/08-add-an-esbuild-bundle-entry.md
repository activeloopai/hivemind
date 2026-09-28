# Example 08 - Add an esbuild bundle entry

Goal: ship a new SessionEnd hook, `prune-stale`, in the Claude Code bundle, with the version `define` wired in. Shows the smallest end-to-end bundle change (`guides/04`).

## 1. Write the source under `src/`

`src/hooks/prune-stale.ts`:

```ts
import { DeeplakeApi } from "../deeplake-api.js";
import { sqlStr } from "../utils/sql.js";

// The version is single-sourced; esbuild `define` replaces this reference with
// the literal from package.json. Never hardcode a version string (guides/04).
const VERSION = process.env.HIVEMIND_VERSION ?? "0.0.0-dev";

export async function pruneStale(api: DeeplakeApi, table: string, before: string): Promise<void> {
  await api.query(
    `DELETE FROM "${table}" WHERE last_update_date < '${sqlStr(before)}'`,
  );
}

// Hook entry: read context, run, never throw out of a lifecycle hook.
export async function main(): Promise<void> {
  try {
    // ...resolve api + table from context...
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`prune-stale (v${VERSION}) skipped: ${msg}\n`);
  }
}
```

## 2. Add the entry in `esbuild.config.mjs`

Add it to the Claude Code hooks list:

```ts
const ccHooks = [
  { entry: "dist/src/hooks/session-start.js", out: "session-start" },
  { entry: "dist/src/hooks/capture.js", out: "capture" },
  // ...existing hooks...
  { entry: "dist/src/hooks/prune-stale.js", out: "prune-stale" },   // <-- new
];
```

The `entry` is the tsc output under `dist/` (so tsc must run first - `build` enforces `tsc && node esbuild.config.mjs`). The `define` block that inlines `HIVEMIND_VERSION` already exists in the config; the new entry inherits it.

## 3. Ship it (if it must reach npm)

The Claude Code bundle is already in `package.json#files` via `harnesses/claude-code/.claude-plugin` / `bundle`, so a new hook in that bundle ships automatically. If you added a new output dir, add it to `files` (`guides/14`).

## 4. Test + verify

```ts
// tests/claude-code/prune-stale.test.ts
import { describe, it, expect, vi } from "vitest";
import { pruneStale } from "../../src/hooks/prune-stale.js";

it("escapes the cutoff date in the DELETE", async () => {
  const api = { query: vi.fn(async () => []) } as any;
  await pruneStale(api, "memory_table", "2026-01-01");
  expect(api.query).toHaveBeenCalledWith(expect.stringContaining("'2026-01-01'"));
});
```

```bash
npm run build      # prebuild sync-versions -> tsc -> esbuild emits prune-stale.js into the bundle
npm test
```

## What this demonstrates

- **Version via `define`, never hardcoded** (`guides/04`).
- **Entry points come from `dist/`** - tsc before esbuild.
- **Guarded SQL + a hook that never throws** out of the lifecycle (`guides/09`, `guides/17`).
- **A test in the mirroring `tests/claude-code/`** (`guides/10`).

## See also

- `guides/04-esbuild-bundling.md`, `templates/esbuild-entry.mjs`.
- `esbuild.config.mjs` (the real entry lists + `define`).
