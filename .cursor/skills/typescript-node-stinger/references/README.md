# references/ - Demoted alternatives

> **These are alternatives we DON'T use; preserved for context only.**

The active recommendations live in `guides/`. The notes in this folder document the alternatives we **considered and did not pick**. They exist for two reasons:

1. **Substitution-pressure context** - when a contributor pitches a substitution (Jest, Babel, tsup, valibot, pnpm), the references explain why Hivemind already chose otherwise.
2. **Recognition** - these tools show up everywhere in the broader TS/Node ecosystem. When you see them in another repo, these notes tell you what you're looking at and what the Hivemind equivalent is.

The canonical stack lives in `guides/01-stack-enforcement.md`:

| Slot | Pick | This folder's alternative |
|---|---|---|
| Type-strip / transpile | tsc (+ esbuild for bundling) | `tsc-vs-babel.md` |
| Test runner | Vitest | `vitest-vs-jest.md` |
| Bundler | raw esbuild config | `esbuild-vs-tsup.md` |
| Validation | zod (^4 app / v3 MCP) | `zod-vs-valibot.md` |
| Package manager | npm | `npm-vs-pnpm.md` |

## Files in this folder

| File | What it documents |
|---|---|
| `tsc-vs-babel.md` | Babel as an alternative transpiler; why tsc + esbuild instead |
| `vitest-vs-jest.md` | Jest as an alternative test runner; why Vitest in an ESM repo |
| `esbuild-vs-tsup.md` | tsup as an esbuild wrapper; why Hivemind hand-writes the config |
| `zod-vs-valibot.md` | valibot as an alternative validator; why zod, and the v4/v3 split |
| `npm-vs-pnpm.md` | pnpm/yarn as alternative package managers; why this repo is npm |

## Substitution policy reminder

A push to substitute requires (per `guides/01-stack-enforcement.md`):

1. **An ADR** at `library/architecture/ADR-<n>-<topic>.md` with Context / Decision / Consequences / Alternatives Considered.
2. **Eval evidence** - the substitute beats the canonical pick on a metric the repo cares about (build time, bundle size, test speed, install reliability across harnesses).
3. **A migration plan** - especially for anything touching the per-harness bundles or the Deep Lake client.
4. **Re-demotion** - the previous canonical choice moves into this folder.

Without all four, the substitution is a finding.

**Active recommendations live in `guides/`. References are demoted context.**
