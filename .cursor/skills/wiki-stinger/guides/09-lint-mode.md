# Guide 09 - Lint Mode (Per-Chunk; Driver Owns Global Pass)

Lint authority is split: **agent does per-chunk lint; the graph driver does global lint.** This guide covers the agent's per-chunk responsibilities only. The driver's global pass (orphan detection, dead-link sweep across the whole knowledge area, ADR-chain integrity across all decisions) lives in Hivemind's graph driver (`src/graph/`) - out of scope here.

## When invoked

`mode: lint` in the canonical invocation payload (per [`guides/01-canonical-invocation.md`](01-canonical-invocation.md)).

In lint mode, the agent does NOT execute Phases 1-6. Instead:

1. Receive the chunk + `prior_state`.
2. Run the per-chunk checks below.
3. Emit findings into `lint_findings:` in the response payload (per [`guides/10-response-payload.md`](10-response-payload.md)).
4. The driver aggregates per-chunk findings + runs its global pass + writes `meta/<YYYY-MM-DD>-lint-report.md`.

The agent does NOT write any pages in lint mode. No entity pages, no concept pages, no meta reports - pure audit, pure report.

## The per-chunk lint catalog (8 checks)

Scoped to per-chunk visibility - the agent only checks pages that overlap the chunk it was handed.

### 1. Frontmatter validation

For each page in `prior_state` that overlaps with this chunk:

- Required universal fields present? (`type`, `title`, `created`, `updated`, `tags`, `status`)
- Required type-specific fields present? (e.g., for `entity`: `entity_type`, `path`, `language`, `last_commit_hash`)
- `entity_type` is one of the 13 allowed values? (function, class, module, service, mcp-tool, env-var, config-key, data-model, exported-symbol, deeplake-table, queue, scheduled-hook, feature-flag)
- `status` is one of the 5 allowed values? (seed, developing, mature, evergreen, stub)
- `created` and `updated` are quoted YAML strings (NOT YAML Date objects)? (Per [`references/frontmatter-schema.md`](../references/frontmatter-schema.md) gotcha.)

Each violation: `{severity: "error", category: "frontmatter", page, field, expected, got}`.

### 2. In-chunk wikilink resolution

For each wikilink in pages within this chunk's `prior_state`:

- Strip alias and anchor (`[[Foo|alt]]` -> `Foo`; `[[Foo#Heading]]` -> `Foo`).
- Look up the link target in `prior_state` + the pages this invocation just authored.
- If not found IN this chunk's visible scope -> it MIGHT still resolve globally; emit as a `warning` (not error), category `unresolved-in-chunk`.

The driver runs the global resolution pass with the full knowledge-area index - see `research/2026-04-29-wikilink-resolution.md` for the algorithm. The agent only flags what it can't resolve locally.

### 3. Pairing integrity

For each entity in `prior_state` overlapping this chunk, check that declared pairs are mutual (per the pairing reference in [`guides/04-entity-extraction-by-type.md`](04-entity-extraction-by-type.md)):

- `mcp-tool.handler:` -> the referenced `function` exists AND lists this mcp-tool in `used_by:`.
- `service.mcp_tools:` -> each referenced mcp-tool exists AND has `server:` / `service:` pointing back.
- `queue.triggers:` -> the referenced handler exists AND has `used_by:` including this queue.
- `scheduled-hook.triggers:` -> same.
- `feature-flag.gates:` -> the referenced queue/scheduled-hook exists.
- `deeplake-table.data_model:` -> the referenced data-model exists.
- `decision.supersedes:` / `decision.superseded_by:` symmetry.
- `class.extends:` / `class.implements:` -> the referenced class/interface exists.

Each broken pair: `{severity: "warning", category: "pairing", page, declared_pair, missing_side}`.

### 4. Stub-page health

For each entity in `prior_state` with `status: stub`:

- `source_extension` field present and non-empty?
- `last_commit_hash` matches the most recent commit on the source file (per `git_context`)?

If `last_commit_hash` is older: `{severity: "info", category: "stub-stale", page, current_sha, page_sha}`. The driver decides whether to queue a refresh.

### 5. Atomic-page-rule violations

For each page authored or in `prior_state` overlapping this chunk:

- Page line count ≤ 300?
- If exceeded: `{severity: "warning", category: "page-too-long", page, line_count}` and recommend split per [`guides/05-atomic-page-rule.md`](05-atomic-page-rule.md).

### 6. Citation density

For each entity page in `prior_state` overlapping this chunk:

- Body contains at least one `path:line` citation per major claim section (Overview, Behavior)?
- Heuristic: count `\bsrc/[^\s]+:\d+\b` patterns in the body. If fewer than 2 in a page over 50 lines: `{severity: "info", category: "low-citation-density", page, citation_count}`.

### 7. Callout vocabulary

For each callout in `prior_state` pages overlapping this chunk:

- Is it from the allowed vocabulary (`[!contradiction]`, `[!stale]`, `[!gap]`, `[!key-insight]`)?
- Custom callouts: `{severity: "warning", category: "non-standard-callout", page, callout, allowed: [...]}`.

### 8. ADR-specific checks (for `library/knowledge/private/architecture/ADR-*.md` pages in chunk)

- Status is one of `proposed | accepted | rejected | deprecated | superseded`?
- If status is `superseded`: `superseded_by:` is non-empty AND points to an existing ADR?
- If `supersedes:` is non-empty: every referenced ADR exists AND has `superseded_by:` pointing back to this one?
- `adr_number` is either a 4-digit string OR `<pending>` (driver hasn't allocated yet)?

Each violation: `{severity: "error" | "warning", category: "adr-integrity", ...}`.

## Findings shape

Each finding in `lint_findings:` is:

```json
{
  "severity": "error | warning | info",
  "category": "frontmatter | unresolved-in-chunk | pairing | stub-stale | page-too-long | low-citation-density | non-standard-callout | adr-integrity",
  "page": "entities/extract-typescript.md",
  "details": { "...category-specific..." }
}
```

The driver aggregates per-chunk findings into `meta/<YYYY-MM-DD>-lint-report.md` with the full report shape:

```markdown
## Summary
- Pages scanned: N
- Issues found: N (N critical, N warnings, N suggestions)

## Critical (must fix)
[errors from frontmatter, adr-integrity]

## Warnings (should fix)
[orphans, broken pairs, page-too-long, callout-vocabulary]

## Suggestions (worth considering)
[low-citation-density, stub-stale, low-confidence-resolution]
```

## What the driver does (NOT the agent)

- **Orphan detection** - scan the whole knowledge area for pages with zero incoming wikilinks. Requires global file index.
- **Global dead-link sweep** - resolve every wikilink across the knowledge area. Per-chunk lint flags `unresolved-in-chunk`; driver upgrades to `dead-link` only if globally unresolvable.
- **ADR chain integrity across the full graph** - per-chunk only sees the overlapping chunk; global pass walks the whole `library/knowledge/private/architecture/` folder.
- **Cross-page contradiction check** - if two entity pages claim conflicting facts about the same source file, the driver detects it via the hash manifest (and the graph's `snapshot_sha256`). Agent doesn't have visibility.

## Do NOT auto-fix

Lint mode reports findings. The agent (and the driver) NEVER auto-fix. The user reviews `meta/<YYYY-MM-DD>-lint-report.md` and decides what to fix. Auto-fixes mask the underlying authoring habits that cause drift.

## Source

- Per-chunk catalog: scoped per the split lint authority (agent per-chunk, graph driver global).
- Frontmatter validation: `research/2026-04-29-frontmatter-validation.md` (Zod safeParse pattern; YAML date gotcha).
- Wikilink resolution: `research/2026-04-29