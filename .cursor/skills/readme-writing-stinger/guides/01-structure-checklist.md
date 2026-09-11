# Structure Checklist: Canonical Section Order

> Source: `research/external/2026-05-20-readme-structure-best-practices.md`

The 2026 consensus section order for a README, with pass/fail criteria for each section. Run this checklist in Step 2 (audit) and Step 7 (final validation) of the stinger procedure.

---

## Canonical order (OSS library)

| # | Section | Required | Pass criteria | Fail signals |
|---|---|---|---|---|
| 1 | **Title + one-liner tagline** | Yes | H1 title matches the package name; one-line tagline below or in subtitle; no preamble before the title | Multiple H1s; no tagline; tagline is longer than one sentence |
| 2 | **Badges** | Optional (strong recommend) | 3-5 badges; all dynamic/live; CI status first | 0 or >5 badges; broken/stale badges; vanity badges present |
| 3 | **Hero image or demo GIF** | Optional (OSS only) | Demonstrates the product in action; under 5MB; alt text present | Static logo only; missing alt text; placeholder image |
| 4 | **One-liner pitch** | Yes | One sentence, no jargon, describes the value proposition | Missing; paragraph of prose; describes implementation not value |
| 5 | **Quickstart** | Yes | 5 commands or fewer; copy-paste runnable on fresh machine; includes expected output | >5 commands; assumes env vars; missing expected output |
| 6 | **Features** | Recommended | 5-8 bullet points; specific, verifiable; each is a user-facing capability | Missing; generic bullets ("fast", "easy"); >10 items |
| 7 | **Install** | Yes | Complete; specifies prerequisites; works on fresh machine | Assumes prior state; missing prerequisites; instructions are wrong |
| 8 | **Usage / examples** | Yes | At least one code block per main use case; syntax-highlighted | Prose description only; no runnable code blocks |
| 9 | **Configuration** | If applicable | Lists all env vars/config keys with types and defaults | Missing when the project has config; no defaults shown |
| 10 | **API reference (or link)** | If applicable | Brief inline examples or link to full docs | Absent for library with public API; points to dead link |
| 11 | **Contributing** | Recommended | Link to `CONTRIBUTING.md` or inline instructions | Missing; stale process (wrong branch names) |
| 12 | **License** | Yes | One line: "Licensed under the `<LICENSE>` License." | Absent; inline license text (belongs in `LICENSE` file) |

Table of contents (ToC): include only if the README has 5+ H2 sections. Automated ToC tools (like `markdown-toc`) are preferred over hand-maintained ones.

---

## Canonical order (internal tool)

Internal tool READMEs have a different priority order because the audience has existing context and needs operational help, not sales.

| # | Section | Notes |
|---|---|---|
| 1 | **Title** | No tagline needed; just the canonical tool name |
| 2 | **What problem this solves** | 2-3 sentences; "why does this exist here"; not a sales pitch |
| 3 | **Who maintains this** | Name or team + Slack channel; where to escalate issues |
| 4 | **Where it runs** | Environments (dev / staging / prod), cluster/service name |
| 5 | **Setup / install** | Steps for a teammate, including any credential or secret setup |
| 6 | **Usage / examples** | The 2-3 most common command patterns |
| 7 | **Architecture notes** | Optional; useful for unusual design decisions |
| 8 | **Changelog / version** | Optional; if the tool has releases |
| 9 | **Contributing** | Who can contribute; PR process |

No hero image. No badges (unless the internal CI dashboard is linked). Length: 200-600 words.

---

## Length thresholds

| Threshold | Action |
|---|---|
| Under 300 words | May be too thin; check that Install and Usage sections exist |
| 300-1,500 words | Optimal range for most projects |
| 1,500-2,000 words | Monitor; consider whether any section can be moved to a linked file |
| Over 2,000 words | Flag for extraction; recommend `library-worker-bee` for docs-site setup |

---

## Audit table template

Emit this table during Step 2 (audit) before proposing changes:

```markdown
| Section      | Status  | Notes |
|---|---|---|
| Title        | ✅ pass |       |
| Badges       | ⚠️ warn |       |
| One-liner    | ❌ fail |       |
| Quickstart   | ✅ pass |       |
| Features     | ✅ pass |       |
| Install      | ⚠️ warn |       |
| Usage        | ❌ fail |       |
| Contributing | ✅ pass |       |
| License      | ✅ pass |       |
```

---

*See `examples/before-after-oss.md` for a worked application of this checklist.*
