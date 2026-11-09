---
title: Markdown frontmatter schema validation
date: 2026-04-29
sources:
  - https://github.com/HiDeoo/zod-matter
  - https://github.com/JulianCataldo/remark-lint-frontmatter-schema
  - https://zod.dev/api
---

# Markdown frontmatter schema validation

## Summary
wiki-worker-bee's frontmatter is the typed contract every page must satisfy. The validation stack is `gray-matter` (parse YAML out of markdown) + `zod` (validate the parsed object against a typed schema), combined idiomatically by `zod-matter`. This gives runtime validation, static type inference, and clean error reporting in one. For lint-mode pass/fail reports, Zod's `safeParse` returns `{ success: false, error: ZodError }` with a structured issue list - exactly what the lint mode needs to surface as wiki-worker-bee's `lint_findings`.

## Key facts
- `gray-matter` is the parser used by Astro, VitePress, Gatsby, Eleventy, Slidev - battle-tested but **provides no validation or type safety**. You get `data: { ... }` with `unknown` shape.
- `zod-matter` wraps `gray-matter` + Zod: `parse(input, schema, options?)` returns a typed `data` field. Throws `ZodError` on invalid input (or use `safeParse` equivalent).
- Zod schemas are composable: `z.object({ ... }).strict()` rejects unknown keys; `z.array(z.string())` for wikilink lists; `z.enum([...])` for status fields.
- Zod's `safeParse` returns `{ success, data | error }` - error has `.issues: Array<{ path, message, code }>` for surface-level reporting.
- For JSON Schema interop (e.g., editor integration with `remark-lint-frontmatter-schema`), Zod ships `zodToJsonSchema` companion, OR write JSON Schema directly and validate with `ajv`.
- `remark-lint-frontmatter-schema` (alternative) - validates frontmatter YAML against a JSON Schema during a remark/unified pipeline; supports global patterns and embedded schemas via `$schema` key. Heavier than zod-matter; useful only if you want VS Code integration via remark plugin chain.
- Common gotchas:
  - YAML interprets `2026-04-29` as a Date object, not a string. Use `z.union([z.string(), z.date()]).transform(d => d.toString())` or set gray-matter `engines: { yaml: { schema: 'json' } }` to force string parsing.
  - YAML interprets `null`, `true`, `false` as their typed values - fine for booleans but tricky for `superseded_by: null` vs missing field. Use `z.string().nullable().optional()`.
  - Wikilinks in YAML: `related: [[entities/foo]]` is invalid YAML. Use array-of-strings `related: ["[[entities/foo]]"]` or write the knowledge arealinks in the body, not the frontmatter (a quoted string per link).

## Recommended approach for wiki-worker-bee

Define one Zod schema per page type (`entity`, `concept`, `decision`, `comparison`, `question`, `meta`) in `references/frontmatter-schema.md` (rendered as code blocks) AND in code in the graph driver. The schema lives in the driver, not in the agent - wiki-worker-bee writes pages and the driver lints them. For wiki-worker-bee's purposes, the agent treats the schema as a contract: emit fields exactly per the table.

Universal entity-page schema:

```ts
const EntitySchema = z.object({
  type: z.literal('entity'),
  entity_type: z.enum([
    'function', 'class', 'module', 'service', 'mcp-tool',
    'env-var', 'config-key', 'data-model', 'exported-symbol',
    'deeplake-table', 'queue', 'scheduled-hook', 'feature-flag'
  ]),
  status: z.enum(['seed', 'developing', 'mature', 'evergreen', 'stub']),
  created: z.string(),  // ISO date as string; gray-matter will need engines override
  updated: z.string(),
  path: z.string(),     // repo-relative
  language: z.string(),
  depends_on: z.array(z.string()).default([]),
  used_by: z.array(z.string()).default([]),
  last_commit_hash: z.string(),
  tags: z.array(z.string()).default([]),
}).strict();
```

For lint mode, the driver runs `EntitySchema.safeParse(graymatterOut.data)` per page; on failure, `error.issues` becomes the lint finding's payload. wiki-worker-bee itself doesn't import Zod - the driver does. But wiki-worker-bee must follow the contract exactly when authoring; this research note tells the Bee WHAT shape to write.

For YAML date strings (avoid the Date-coercion gotcha): always quote dates: `created: "2026-04-29"`. Document this in the Bee guide.

For wikilinks in YAML arrays, use the **quoted-string-per-link** convention:
```yaml
depends_on: ["[[entities/foo]]", "[[entities/bar]]"]
```

## Sources
- [HiDeoo/zod-matter](https://github.com/HiDeoo/zod-matter) - date retrieved 2026-04-29 - wrapper combining gray-matter and Zod for typed frontmatter parsing.
- [JulianCataldo/remark-lint-frontmatter-schema](https://github.com/JulianCataldo/remark-lint-frontmatter-schema) - date retrieved 2026-04-29 - alternative remark-lint plugin using JSON Schema + AJV; heavier alternative.
- [Zod API reference](https://zod.dev/api) - date retrieved 2026-04-29 - schema definition primitives, strict objects, enums, refinements.

## Quotes worth preserving
> "gray-matter is a great package to parse front matter but provides no validation or type safety. This package exposes an API adding a `schema` parameter to validate front matter data using Zod." - zod-matter README

## Open questions / gaps
- Should `path` be enforced as POSIX (forward-slash) or platform-native? Recommend POSIX always - Windows graph driver normalizes before writing. Cross-platform repos break otherwise.
- For `depends_on` and `used_by` arrays, do we need the full wikilink with brackets, or just the bare entity name? Recommend full wikilink form `[[entities/foo]]` for grep-ability and Cursor preview rendering. Driver can strip on read.
- `last_commit_hash` validation - is full SHA required, or short SHA (7 chars) acceptable? Recommend full SHA in frontmatter, render short in body for human reading. Driver can use `z.string().regex(/^[0-9a-f]{40}$/)`.
