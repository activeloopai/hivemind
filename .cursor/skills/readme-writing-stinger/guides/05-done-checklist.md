# Done Checklist: README Validation

Run this checklist at the end of every `readme-writing-worker-bee` session before declaring the README complete. Every item must pass before the file is emitted or committed.

---

## The 12-point checklist

| # | Check | Pass criteria | Fail action |
|---|---|---|---|
| 1 | **Title is present** | `# project-name` is the first line of the file (or after YAML frontmatter) | Add it |
| 2 | **One-liner tagline is present** | One sentence below the title describing the value proposition; no jargon | Write it |
| 3 | **Badge count is 3-5** | 3 minimum (CI + version + license); 5 maximum; no vanity badges | Add/remove badges per `guides/02-badges.md` |
| 4 | **All badges are live** | Each badge URL returns a 200 with current data; branch is pinned | Fix stale badges |
| 5 | **Quickstart exists and is copy-paste runnable** | 5 commands or fewer; no assumed env vars; expected output shown | Rewrite the quickstart |
| 6 | **Install section is complete** | Prerequisites listed; package manager command shown; works on fresh machine | Add missing prerequisites |
| 7 | **At least one usage example with code block** | Fenced code block with language hint; runnable on its own | Add code block |
| 8 | **Section order matches the canonical order** | Follows `guides/01-structure-checklist.md` order (or has a documented reason to deviate) | Reorder sections |
| 9 | **No section exceeds 30 lines without a code example** | Scan every prose section; if it exceeds 30 lines and has no code block, flag for extraction | Extract to linked doc or add code example |
| 10 | **README is under 1,500 words** | Word count check; if 1,500-2,000, warn; if >2,000, flag for `library-worker-bee` handoff | Trim or extract |
| 11 | **Contributing section or link is present** | Inline or link to `CONTRIBUTING.md` | Add it |
| 12 | **License line is present** | "Licensed under the `<LICENSE>` License." (one line; not the full license text) | Add it |

---

## Emitting the checklist

At the end of every session, emit the checklist as a table with Status and Notes columns:

```markdown
| # | Check | Status | Notes |
|---|---|---|---|
| 1 | Title | ✅ pass | |
| 2 | One-liner | ✅ pass | |
| 3 | Badge count | ⚠️ warn | 7 badges, need to cut 2 |
| 4 | Badges live | ❌ fail | CI badge points to deleted branch |
| 5 | Quickstart | ✅ pass | |
| 6 | Install | ✅ pass | |
| 7 | Usage example | ✅ pass | |
| 8 | Section order | ✅ pass | |
| 9 | No 30-line prose | ⚠️ warn | "Architecture" section is 45 lines |
| 10 | Under 1,500 words | ✅ pass | 1,140 words |
| 11 | Contributing | ✅ pass | |
| 12 | License | ✅ pass | |
```

Any `⚠️ warn` or `❌ fail` item must be resolved before the session ends, or explicitly acknowledged by the user as a known gap.

---

## Fast-path for "good enough"

If the user says "it's good enough for now," document the remaining gaps as a `<!-- TODO: -->` comment in the README immediately above the failing section, so the next author knows what to fix:

```markdown
<!-- TODO: readme-writing-worker-bee: badge for CI is pointing to deleted branch; update to main -->
```

This is acceptable for drafts. It is NOT acceptable before a public OSS release.
