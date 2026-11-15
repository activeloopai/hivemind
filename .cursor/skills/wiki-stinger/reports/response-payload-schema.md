# Response Payload Schema (Reference)

The canonical JSON shape every wiki-worker-bee invocation returns to the graph driver. Mirrors [`guides/10-response-payload.md`](../guides/10-response-payload.md) - refer there for field semantics and driver-side reconciliation behavior. This file is the schema-only reference for tooling and validation.

## Schema (Zod-style, in TypeScript)

```ts
import { z } from "zod";

const NotificationFlag = z.object({
  severity: z.enum(["info", "warning", "error"]),
  title: z.string(),
  page: z.string(),
  report: z.string().optional(),
});

const Contradiction = z.object({
  old: z.string(),
  new: z.string(),
  reason: z.string(),
  commit: z.string(),
});

const EntityDetected = z.object({
  name: z.string(),
  type: z.enum([
    "function", "class", "module", "service", "mcp-tool",
    "env-var", "config-key", "data-model", "exported-symbol",
    "deeplake-table", "queue", "scheduled-hook", "feature-flag",
  ]),
  file: z.string(),
  line: z.number().int().positive(),
});

const Gap = z.object({
  entity: z.string(),
  referenced_in: z.string(),
  reason: z.string(),
});

const LintFinding = z.object({
  severity: z.enum(["error", "warning", "info"]),
  category: z.enum([
    "frontmatter", "unresolved-in-chunk", "pairing", "stub-stale",
    "page-too-long", "low-citation-density", "non-standard-callout",
    "adr-integrity",
  ]),
  page: z.string(),
  details: z.record(z.unknown()),
});

const ResponsePayload = z.object({
  pages_created: z.array(z.string()),
  pages_updated: z.array(z.string()),
  decisions_filed: z.array(z.string()),
  contradictions_flagged: z.array(Contradiction),
  meta_reports_written: z.array(z.string()),
  notification_flags: z.array(NotificationFlag),
  entities_detected: z.array(EntityDetected),
  gaps: z.array(Gap),
  lint_findings: z.array(LintFinding),
  partial_scan: z.boolean(),

  // Optional: present only on validation/phase failure
  error: z.object({
    code: z.enum(["validation_failed", "phase_failed", "partial_write"]),
    message: z.string(),
    phase: z.number().int().optional(),
    details: z.record(z.unknown()).optional(),
  }).optional(),
}).strict();
```

## JSON Schema (for non-TS tooling)

If the driver needs to validate without Zod, use `zodToJsonSchema(ResponsePayload)` to emit a JSON Schema document equivalent to the above. Keep both in sync.

## Sample successful response

```json
{
  "pages_created": ["entities/extract-typescript.md", "concepts/per-file-extraction-flow.md"],
  "pages_updated": ["entities/extract-declarations.md"],
  "decisions_filed": ["library/knowledge/private/architecture/ADR-pending-fe9d8c7-tree-sitter-extraction.md"],
  "contradictions_flagged": [
    {"old": "entities/extract-declarations.md", "new": "entities/extract-declarations.md", "reason": "return type changed", "commit": "fe9d8c7"}
  ],
  "meta_reports_written": ["meta/2026-04-29-contradiction-report.md"],
  "notification_flags": [
    {"severity": "warning", "title": "Contract change in extractDeclarations", "page": "entities/extract-declarations.md", "report": "meta/2026-04-29-contradiction-report.md"}
  ],
  "entities_detected": [
    {"name": "extractTypeScript", "type": "function", "file": "src/graph/extract/typescript.ts", "line": 97}
  ],
  "gaps": [],
  "lint_findings": [],
  "partial_scan": false
}
```

## Sample error response

```json
{
  "error": {
    "code": "validation_failed",
    "message": "git_context missing entry for chunk[1].path = src/graph/types.ts",
    "phase": 0,
    "details": {"missing_paths": ["src/graph/types.ts"]}
  },
  "pages_created": [],
  "pages_updated": [],
  "decisions_filed": [],
  "contradictions_flagged": [],
  "meta_reports_written": [],
  "notification_flags": [],
  "entities_detected": [],
  "gaps": [],
  "lint_findings": [],
  "partial_scan": false
}
```

The driver MUST NOT proceed with reconciliation if `error` is present - even the empty arrays in the rest of the payload are sentinel values, not data.

## Field invariants (driver-side enforcement)

The driver SHOULD assert these in addition to schema validation:

1. If `contradictions_flagged.length > 0` then `meta_reports_written.length > 0` AND `notification_flags.length > 0` - incomplete contradiction handling per [`references/contradiction-protocol.md`](../references/contradiction-protocol.md).
2. If `decisions_filed.length > 0` then `pages_created` includes every entry in `decisions_filed` (an ADR is a created page).
3. If `partial_scan === true` then the invocation came from a direct `@`-mention; the driver queues a reconciliation pass.
4. Every path in `pages_created` and `pages_updated` is repo-relative under `library/knowledge/` (the codebase-graph knowledge area, or `library/knowledge/private/architecture/` for ADRs) - never absolute, never outside the knowledge root.
5. `entities_detected` includes ALL entities the agent observed, not just the ones it wrote pages for. Used by the driver to update the hash manifest's `pages_created`/`pages_updated` per source file map.

## Source

Schema is the canonical contract between wiki-worker-bee and Hivemind's graph driver (`src/graph/`). Field semantics in [`guides/10-response-payload.md`](../guides/10-response-payload.md). Validation patterns from `research/2026-04-29-frontmatter-validation.md` (Zod safeParse).
