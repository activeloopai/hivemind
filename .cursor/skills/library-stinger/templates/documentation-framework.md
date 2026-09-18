# Documentation Framework

> Category: Standards | Version: 1.0 | Date: (fill in on init) | Status: Canonical

The single source of truth for how documentation is written in this repository. Every document - feature PRDs, issue PRDs, QA reports, architecture docs, API references, guides - must conform to the standards defined here. If a document type is not covered, add a new section to this file rather than inventing a local convention.

---

## 1. Document Types

| Type | Purpose | Location | Primary audience |
|---|---|---|---|
| **Issue IRD** | Implementation plan for a specific GitHub issue | `library/requirements/issues/issue-<###>-<title>/ird-issue-<###>-<title>.md` | Implementation engineer |
| **Feature PRD** | Planned feature spec (forward or retroactive) | `library/requirements/features/feature-<###>-<title>/prd-feature-<###>-<title>.md` (or `prd-feature-<###>-<title>-ck-<clickupId>.md` if from ClickUp) | Implementation engineer |
| **QA Report (tied)** | Audit of an implementation against its plan | The plan's own `reports/<date>-qa-report.md` subfolder | Team lead, author of the feature |
| **QA Report (standalone)** | Audit not tied to a single plan | `library/qa/<domain>/<date>-qa-report.md` | Team lead, audit reviewer |
| **Architecture Doc** | System design, data flows, component relationships | `library/knowledge-base/architecture/` | Senior engineers, architects |
| **API Reference** | Endpoint-by-endpoint documentation with schemas | `library/knowledge-base/api/` | Frontend devs, API consumers |
| **How-to Guide** | Runbooks for setup, testing, deploying, adding features | `library/knowledge-base/how-to-guides/` | New engineers, DevOps |
| **Integration Doc** | Third-party service configuration and error handling | `library/knowledge-base/integrations/` | DevOps, engineers wiring services |
| **UX/UI Standard** | Visual design language - tokens, components, patterns | `library/knowledge-base/design/` | Designers, frontend devs |
| **Feature Doc** | Completed feature reference (post-ship) | `library/knowledge-base/features/` | Any engineer joining the project |
| **Spec** | Feature-level handoff spec for a UI flow | `library/knowledge-base/specs/` | Frontend engineers |
| **Product Brief** | Product vision, scope, roadmap | `library/knowledge-base/product/` | Team, stakeholders |
| **Standards Doc** | Rules for writing documentation itself | `library/knowledge-base/standards/` | All contributors |
| **Release Notes** | What changed in each release | `library/knowledge-base/releases/` | All team members |

---

## 2. Universal Document Header

Every markdown file under `library/knowledge-base/` starts with:

```markdown
# <Document Title>

> Category: <Type> | Version: <X.Y> | Date: <Month YYYY> | Status: <Active | Draft | Archived>

<One-sentence description of what this document covers and who should read it.>

**Related:**
- [Link to related doc]
- [Link to source code: `src/path/to/file.ts`]
```

- **Version** - starts at `1.0`; patch bumps (`1.0` → `1.1`) for additions, minor bumps (`1.x` → `2.0`) for reorganizations.
- **Date** - current month/year on the last meaningful edit.
- **Status** values:
  - `Active` - current, should be kept up to date
  - `Draft` - work in progress, not authoritative
  - `Archived` - historical, no longer maintained
  - `Canonical` - (for standards docs only) highest authority; overrides ad-hoc conventions

Requirements-type docs (issue IRDs, feature PRDs, QA reports) use a different header format documented in their respective guides.

---

## 3. Filename Conventions

| Document type | Folder + filename pattern | Example |
|---|---|---|
| Issue IRD | `issue-<###>-<title>/ird-issue-<###>-<title>.md` (with sibling `reports/`) | `issue-046-stale-cached-responses/ird-issue-046-stale-cached-responses.md` |
| Feature PRD | `feature-<###>-<title>/prd-feature-<###>-<title>.md` (with sibling `reports/`) | `feature-007-user-profile-export/prd-feature-007-user-profile-export.md` |
| Feature PRD (from ClickUp) | `feature-<###>-<title>/prd-feature-<###>-<title>-ck-<clickupId>.md` | `feature-007-user-profile-export/prd-feature-007-user-profile-export-ck-86c8wq2k1.md` |
| QA report (tied to plan) | `<plan-folder>/reports/<date>-qa-report.md` | `feature-007-user-profile-export/reports/2026-04-26-qa-report.md` |
| QA report (standalone) | `library/qa/<domain>/<date>-qa-report.md` | `library/qa/auth/2026-04-26-qa-report.md` |
| Knowledge-base | `<domain>/<kebab-slug>.md` (no numeric prefix) | `architecture/authentication-flow.md` |

**Numbering rules:**
- `<###>` is **3-digit zero-padded** (`006`, `046`, `093`, `100`). 4+ digit natural width.
- Issue numbers follow the GitHub issue number.
- Feature numbers are repo-local sequential; take `max + 1` from existing folders (open + `completed/`).
- Titles are lowercase kebab-case, ≤60 chars.
- The optional ClickUp suffix `-ck-<clickupId>` goes on the **main file only**, never on the folder name.

---

## 4. Folder Location Rules

| Folder | Meaning |
|---|---|
| `library/requirements/features/feature-<###>-<title>/` | Feature work in progress. |
| `library/requirements/features/completed/feature-<###>-<title>/` | Feature has shipped. Move the entire folder (PRD + `reports/`). |
| `library/requirements/issues/issue-<###>-<title>/` | Issue work in progress (GitHub issue OPEN). |
| `library/requirements/issues/completed/issue-<###>-<title>/` | Issue has been resolved (GitHub issue CLOSED). Move the entire folder (IRD + `reports/`). Symmetric to features. |
| `<plan-folder>/reports/` | QA reports tied to that specific feature/issue. Travel with the folder when it moves. |
| `library/qa/<domain>/` | Standalone QA reports - broad audits not tied to a single plan. |

Move folders when status changes. Never edit lifecycle state in frontmatter alone.

---

## 5. Writing Rules (all doc types)

1. **Ground every claim in code.** Quote source with file path + line range; never paraphrase signatures.
2. **One topic per document.** Split if a doc exceeds ~500 lines.
3. **Progressive disclosure.** Open with "why this exists" and "who should read it"; deep details below.
4. **Link out, don't duplicate.** If another doc covers a subtopic, link to it.
5. **Diagrams use mermaid.** Prefer `flowchart TD` or `sequenceDiagram`. No explicit colors.
6. **No time-sensitive language.** Avoid "currently", "recently", "as of". Use explicit dates.
7. **No personal opinions.** Docs describe decisions and rationale, not preferences.

---

## 6. Cross-Linking Conventions

- Use relative paths: `[title](../relative/path.md)`.
- Link to code with file paths (and line numbers where useful): `` `src/routes/users.ts:42-80` ``.
- PRDs and IRDs link to their related issues, features, and QA reports in a **Related** section at the end.
- Knowledge-base docs link to the PRDs that drove them (when applicable) and to source code.

---

## 7. Diagram Rules

- Mermaid preferred (renders everywhere GitHub does).
- Use `flowchart TD` (top-down) for process flows; `sequenceDiagram` for temporal flows; `erDiagram` for data models.
- Node IDs: no spaces (use `camelCase` or `under_scores`).
- No explicit colors (breaks dark mode).
- No `click` events.
- Quote labels containing parentheses, brackets, or colons.

---

## 8. Versioning + Dates

- **Versioning** is per-document, not repo-wide. Bump on meaningful content change.
- **Dates** use the current month/year (from the system clock), not arbitrary timestamps.
- Each document optionally ends with a **Changelog** section listing version bumps.

---

## 9. Ownership

- Requirements docs (issue IRDs, feature PRDs) are owned by the implementation author. QA reports are owned by `quality-worker-bee`.
- Knowledge-base docs are owned by the team collectively - anyone may edit with a PR.
- Standards docs (this file included) require team consensus before changing.

---

## 10. Bootstrap - After `initialize`

When `library-worker-bee initialize` seeds a repo:

1. Replace the placeholder "(fill in on init)" in the header above with the current month/year.
2. Replace any project-name placeholders in the seeded README files with your repo's actual name.
3. Edit any section of this framework that doesn't match your team's conventions - then commit.
4. Start using the agent: ingest issues, plan features, document architecture.

---

## Changelog

- v1.0 - Initial template seeded by `library-worker-bee`. Customize per repo.
