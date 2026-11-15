# valibot - preserved alternative

> Demoted in favor of **zod** (see `guides/12-strict-types-and-zod.md`). The app is on `zod ^4`; the MCP server imports `zod/v3`.

## Why zod is canonical

- **Already pervasive.** zod is a hard dependency (`"zod": "^4.3.6"`) and the validation idiom across the app. Switching validators would fork the boundary story for no payoff.
- **The MCP SDK couples to zod.** `@modelcontextprotocol/sdk` infers tool `inputSchema` from zod (v3) objects (`guides/05`). valibot does not slot into that inference; you would have to translate every tool schema. This single fact settles it.
- **`z.infer` -> static type.** One schema is both the runtime validator and the TS type. The repo leans on this at every boundary (`templates/schema.ts`).

## The v4 / v3 split (the detail that matters)

Hivemind runs **two zod majors in one install**:

- **App code** imports `from "zod"` (v4).
- **The MCP server** imports `import * as z from "zod/v3"` because the SDK's `inputSchema` inference is written against v3.

This is intentional, not drift. The rule: in the MCP `inputSchema` path use `zod/v3`; everywhere else use `zod`. Mixing them in one `inputSchema` module silently breaks inference - the most common zod footgun here (`guides/12`).

## What valibot is good at (and why it doesn't tip here)

- **Smaller bundle via tree-shaking** - valibot's modular API ships less. For a Node CLI/server (not a browser bundle shipped to users over the wire), bundle size is not the binding constraint.
- **Function-style API** - a matter of taste; zod's chainable API is what the repo already speaks.

## If you find valibot in a repo

It is a reasonable bundle-size-sensitive choice for the browser. For Hivemind - Node-side, MCP-SDK-coupled, zod-everywhere - zod is the only pick that keeps tool inference working.

## API sketch

| zod | valibot |
|---|---|
| `z.object({...})` | `v.object({...})` |
| `z.string().min(1)` | `v.pipe(v.string(), v.minLength(1))` |
| `schema.parse(x)` | `v.parse(schema, x)` |
| `z.infer<typeof S>` | `v.InferOutput<typeof S>` |

## Sources

- `package.json` (`zod ^4`), `src/mcp/server.ts` (`zod/v3`), `@modelcontextprotocol/sdk ^1.29`.
- `research/2026-06-16-zod-v4-vs-v3-mcp.md`.
