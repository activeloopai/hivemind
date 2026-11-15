# 12 - Strict Types & zod

`strict: true` is on. The discipline is: keep types honest internally with strict TS, and validate everything that crosses an external boundary with zod.

## Strict TS

`strict` bundles `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`, and the rest. The rules that bite in this repo:

- **No `any` at a boundary.** A function parameter or return typed `any` defeats strict mode for everything downstream. Use `unknown` and narrow, or a zod schema for external data. `any` crossing a signature is a **must-fix**.
- **`unknown` in `catch`.** A caught error is `unknown`; narrow with `err instanceof Error` before touching `.message` (`guides/09`).
- **Null-safety is enforced.** `strictNullChecks` means `T | undefined` from an optional must be handled, not assumed away with `!` unless you can prove non-null at that point. A casual `!` on user/IO data is a **should-refactor**.
- **Prefer `unknown` over `any` for genuinely dynamic data**, then narrow with a zod `.parse()` or a type guard.

## zod at every external boundary

External = anything you did not produce in this process: MCP tool input, parsed JSON, environment variables, file contents, third-party API responses (Anthropic, Deep Lake row shapes you do not trust). Validate at entry:

```ts
import { z } from "zod";

const ConfigSchema = z.object({
  apiUrl: z.string().url(),
  workspaceId: z.string().min(1),
  orgId: z.string().min(1),
});

const config = ConfigSchema.parse(JSON.parse(raw)); // throws on bad input, types flow out
```

`z.infer<typeof ConfigSchema>` gives you the static type for free - one schema, one source of truth for both runtime validation and the TS type. A boundary that takes raw `JSON.parse(...)` and trusts it is a **must-fix**.

## The zod major split (the critical detail)

- **The app uses `zod ^4`** (`"zod": "^4.3.6"` in `dependencies`). Import `from "zod"`.
- **The MCP server uses `zod/v3`** (`import * as z from "zod/v3"`) because the MCP SDK's `inputSchema` inference is written against zod v3.

These are two different majors living in one install. The rule: in `src/mcp/server.ts` (and any module feeding the MCP SDK an `inputSchema`), import `zod/v3`; everywhere else, import `zod`. Mixing them in a module that builds an `inputSchema` silently breaks the SDK's type inference - a **must-fix** and the single most common zod footgun here.

## Type guards vs assertions

Prefer a guard (`function isRow(x: unknown): x is Row`) or a zod `.safeParse()` over a cast (`x as Row`). A cast tells the compiler to stop checking; a guard actually checks. A cast on external data is a **should-refactor** (a **must-fix** if it is laundering an `any`).

## Audit script

`scripts/audit-untyped-boundaries.mjs` flags `: any`, `as any`, and exported functions whose parameters take a bare `unknown` / parsed JSON without a zod `.parse` / `.safeParse` nearby. See `scripts/README.md`.

## Common findings

- `any` crossing a function signature - **must-fix**.
- A boundary trusting `JSON.parse(...)` with no zod validation - **must-fix**.
- `from "zod"` (v4) inside the MCP `inputSchema` path instead of `zod/v3` - **must-fix**.
- `as Row` on external data instead of a guard / `safeParse` - **should-refactor**.
- A casual `!` non-null assertion on IO data - **should-refactor**.

## Sources

- `tsconfig.json` (`strict: true`), `package.json` (`zod ^4`), `src/mcp/server.ts` (`zod/v3`).
- `research/2026-06-16-zod-v4-vs-v3-mcp.md`.
