---
type: meta
report_type: contradiction
date: 2026-04-29
created: 2026-04-29
updated: 2026-04-29
contradiction_count: 0
tags:
  - meta
  - contradiction-report
---

# Contradiction Report - 2026-04-29

[Append each contradiction below as wiki-worker-bee detects it during the day. One file per day. Increment `contradiction_count` in frontmatter on each append.]

---

## {HH:MM} - {commit_sha} - {entity-name}

- **Old page:** [[entities/old-version]]
- **New page:** [[entities/new-version]]
- **Reason:** [one-line summary of what changed - signature / return type / side effect / dependency / MCP tool schema / semantic shift]
- **Commit:** `{sha}` - "{message}" - {author}
- **Severity:** warning | info
- **Resolution suggestion:** [[questions/...]] or "no action needed - informational only"

---

**Severity rubric:**

- **warning** - contract change with potential downstream impact (signature, return type, side effects, dependencies, MCP tool name/schema)
- **info** - semantic shift detected but contract preserved (worth surfacing but not alarming)

**File lifecycle:**

- One file per day, named `meta/<YYYY-MM-DD>-contradiction-report.md`.
- wiki-worker-bee creates from this template on the day's first contradiction; appends thereafter.
- The graph driver may surface a "today's contradictions" notification by reading the most recent dated file in `meta/` (via `src/notifications/`).
