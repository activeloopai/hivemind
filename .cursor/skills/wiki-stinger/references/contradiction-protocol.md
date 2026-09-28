# Contradiction Protocol

When Phase 2 (cross-reference) detects that a candidate entity's contract differs from its prior page (signature changed, return type changed, side effect added/removed, dependency added/removed, or a clear semantic shift), Phase 6 applies the **active four-artifact protocol**.

All four artifacts every time. Incomplete handling is a bug.

---

## The four artifacts

### Artifact 1 - `[!stale]` callout on the prior entity page

Append to the prior entity page (do NOT remove the prior content; the contradiction is part of the audit trail).

```markdown
> [!stale]
> Behavior changed in commit `abc123` (2026-04-15) - see [[entities/extract-declarations-v2]].
> Reason: return type changed from `void` to `FileExtraction`.
```

### Artifact 2 - `[!contradiction]` callout on the new entity page

Top of the body, before any other content.

```markdown
> [!contradiction]
> Supersedes [[entities/extract-declarations]] (commit `abc123`, 2026-04-15).
> Prior contract: returns `void` (mutates an out-param). New contract: returns `FileExtraction`.
```

### Artifact 3 - entry in `meta/<YYYY-MM-DD>-contradiction-report.md`

If the file doesn't exist for today, create it from [`templates/contradiction-report.md`](../templates/contradiction-report.md). Append the new contradiction at the bottom.

```markdown
## 14:32 - abc123 - extract-declarations

- **Old page:** [[entities/extract-declarations]]
- **New page:** [[entities/extract-declarations-v2]]
- **Reason:** return type changed from `void` to `FileExtraction`
- **Commit:** `abc123` - "graph: extractor returns FileExtraction instead of mutating" - alice@example.com
- **Severity:** warning
- **Resolution suggestion:** [[questions/should-callers-of-extract-declarations-handle-the-return]]
```

### Artifact 4 - `notification_flag` in the structured response payload

```json
{
  "notification_flags": [
    {
      "severity": "warning",
      "title": "Contract change detected in extractDeclarations",
      "page": "entities/extract-declarations.md",
      "report": "meta/2026-04-29-contradiction-report.md"
    }
  ]
}
```

The graph driver reads `notification_flags` and surfaces them via Hivemind's notifications path (`src/notifications/`) as Cursor notifications.

---

## What counts as a contradiction

- Signature change (parameter list, return type, generic constraints - tree-sitter's one-line `signature` makes this a direct diff)
- Side-effect change (function went from pure to side-effecting or vice versa)
- Dependency change (new `depends_on` that the prior page didn't have, or removal of a depended-on entity - compare the `imports`/`calls` edge sets)
- Semantic shift visible in the new commit's diff or message ("rewrite", "refactor behavior", "change", "fix wrong return")
- Status downgrade (entity that was `mature` now lacks coverage that the prior page documented)
- An MCP tool name / input schema change (the contract every harness adapter depends on)

## What does NOT count

- Cosmetic changes (formatting, comments, JSDoc improvements without behavior change)
- Pure refactors that preserve the contract (rename internal var, extract helper)
- Documentation-only updates

When in doubt, file a `questions/` page asking a human to confirm whether the change is a contradiction.

---

## Severity rubric

- **warning** - contract change with potential downstream impact (signature, return type, side effects, dependencies, MCP tool name/schema)
- **info** - semantic shift detected but contract preserved (worth surfacing but not alarming)

## Daily journal, not rolling

One `meta/<YYYY-MM-DD>-contradiction-report.md` file per day. Today's date in the filename. Easier to grep, easier to archive, easier to surface "today's contradictions" in the sidebar.

---

## Why active over passive

Passive (callouts only) leaves contradictions invisible until someone reads the affected pages. Active surfaces them at the moment of detection - the developer gets a Cursor notification, the meta report is greppable, and the audit trail is complete. This is the single most valuable behavior wiki-worker-bee provides over a static doc tree.

## Source

The active four-artifact protocol is the wiki-worker-bee Phase 6 contract. Detection leans on tree-sitter's deterministic node signatures and the graph's `snapshot_sha256` drift signal (a changed snapshot hash for the same commit means the extracted contract moved).
