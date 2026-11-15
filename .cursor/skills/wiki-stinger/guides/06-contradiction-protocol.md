# Guide 06 - Contradiction Protocol

When Phase 2 (cross-reference) detects that a candidate entity's contract differs from its prior page, Phase 6 applies the **active four-artifact protocol**.

## When to apply

Apply when ANY of the following changed between the prior entity page and the new candidate:

- Signature (parameter list, return type, generic constraints - tree-sitter's one-line `signature` makes this a direct diff)
- Side effects (function went from pure to side-effecting or vice versa)
- Dependencies (new `depends_on` not in the prior page, or a removed edge target - compare the `imports`/`calls` edge sets)
- Semantic shift visible in the new commit's diff or message ("rewrite", "refactor behavior", "change", "fix wrong return")
- Status downgrade (entity that was `mature` now lacks coverage that the prior page documented)
- An MCP tool name / input schema change (the contract every harness adapter depends on)

Do NOT apply for:

- Cosmetic changes (formatting, comments, JSDoc improvements without behavior change)
- Pure refactors that preserve the contract (rename internal var, extract helper)
- Documentation-only updates

When in doubt, file a `questions/` page asking a human to confirm.

The four-artifact pattern mirrors how the codebase graph itself surfaces drift: `snapshot_sha256` changes when the extracted graph changes, so a contract shift never goes unnoticed.

## How to apply

The four-artifact procedure with full examples lives in [`references/contradiction-protocol.md`](../references/contradiction-protocol.md). Read it before any Phase 6 work.

Summary:

1. `[!stale]` callout appended to the prior entity page (do NOT remove the prior content)
2. `[!contradiction]` callout at the top of the new entity page
3. Entry in the knowledge area's `meta/<YYYY-MM-DD>-contradiction-report.md` (one file per day; create from [`templates/contradiction-report.md`](../templates/contradiction-report.md) if absent)
4. `notification_flag` in the structured response payload

ALL FOUR. Every time. Incomplete handling is a bug.

## Why active

Passive (callouts only) leaves contradictions invisible until someone reads the affected pages. Active surfaces them at the moment of detection - the developer gets a Cursor notification via Hivem