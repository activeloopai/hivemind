# Guide 02: Rule File Authoring

How to write and maintain `.cursor/rules/*.mdc` files in this repo.

## Anatomy of a rule file

```mdc
---
description: <One sentence. Used by the agent to decide relevance when globs are unset.>
globs: **/*.ts, **/*.tsx
alwaysApply: false
---

# Rule Title

Your rule content here. Markdown. Be specific. Use concrete examples.
```

All three frontmatter fields are optional, but their presence or absence picks the activation mode (see `guides/01-principles.md`). Omit a field entirely rather than setting it to an empty string; empty strings behave differently from unset across Cursor versions.

## Frontmatter field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | Recommended | Used for intelligent activation. 1-2 sentences max. |
| `globs` | string or list | Optional | Comma-separated patterns or a YAML list. Standard glob syntax. |
| `alwaysApply` | boolean | Optional | Defaults to `false` if omitted. |

### Glob pattern syntax

| Pattern | Matches |
|---|---|
| `**/*.ts` | All TypeScript files anywhere |
| `src/**/*.ts` | TS files under `src/` |
| `**/*.{ts,tsx}` | TS and TSX files anywhere |
| `*.md` | Markdown files in project root only |
| `**/hooks/**` | Any file inside a `hooks/` folder |

Comma-separate on one line: `**/*.ts, **/*.tsx`. Or use a YAML list:

```yaml
globs:
  - "**/*.ts"
  - "src/cli/**"
```

## The four activation modes (pick one)

| Mode | `alwaysApply` | `globs` | `description` | Use for |
|---|---|---|---|---|
| Always Apply | `true` | any | any | Short, always-true directives only (budget-sensitive) |
| Apply to Specific Files | `false` | set | any | Language/path-specific conventions |
| Apply Intelligently | `false` | unset | set | Context-dependent concerns the agent can judge from `description` |
| Apply Manually | `false` | unset | unset | Reference material loaded via `@`-mention |

## This repo's live rules

Read these before adding a new one; match their shape.

- **`no-em-dashes.mdc`** (`alwaysApply: true`): bans em/en dashes in prose. The one rule worth the always-on budget here.
- **`plan-construction-protocol.mdc`**: how to construct a multi-step plan. Activates by `description`.
- **`respect-agent-work-boundaries.mdc`**: keeps Bees inside their assigned files/scope. Activates by `description`.

## How to create a rule file

Two equivalent methods in this repo:

1. **Direct file creation:** write `.cursor/rules/<descriptive-name>.mdc` with the Write tool. Cursor picks it up on the next agent invocation. This is how the Army's rules are maintained.
2. **Settings UI:** Cursor Settings > Rules > "+ Add Rule" (creates the same file).

Name files by concern: `no-em-dashes.mdc`, `respect-agent-work-boundaries.mdc`. Avoid `rules.mdc`, `misc.mdc`.

## Anti-patterns

| Anti-pattern | Why it is bad | Fix |
|---|---|---|
| `alwaysApply: true` on everything | Burns the shared context budget on every invocation | Scope with globs or switch to intelligent activation |
| Vague `description` like "coding standards" | The agent cannot decide when to apply it | Write: "Apply when constructing a multi-step implementation plan" |
| Copying file content inline | Goes stale when the file changes | Reference with `@filename` |
| Introducing a `.cursorrules` file | This repo standardized on `.mdc`; mixing formats creates silent precedence conflicts | Author `.cursor/rules/*.mdc` only |
| Em dashes anywhere | Violates `no-em-dashes.mdc` | Use hyphen, comma, colon, or period |

## Keeping rules current

Reference files via `@filename` rather than duplicating content, so the rule stays accurate when the file changes. Audit glob patterns after major refactors: a glob that matched the old layout silently stops matching after a rename.
