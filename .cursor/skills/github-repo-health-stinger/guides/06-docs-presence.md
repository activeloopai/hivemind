# 06 - Docs Presence Audit

*Research basis: `research/external/04-issue-pr-templates-docs.md`*

## Community health files checklist

| File | Location | Required? | Notes |
|---|---|---|---|
| `README.md` | Root | Required | Overview, quickstart, badges |
| `LICENSE` | Root | Required for OSS | Legal clarity |
| `CONTRIBUTING.md` | Root or `.github/` | Strongly recommended | How to contribute |
| `SECURITY.md` | Root or `.github/` | Strongly recommended | Responsible disclosure process |
| `CODE_OF_CONDUCT.md` | Root or `.github/` | Recommended | Community standards |
| `SUPPORT.md` | Root or `.github/` | Optional | Where to get help |
| `CHANGELOG.md` | Root | Optional | Release history |

## README quality signals (not just presence)

Check that the README has:
- Project name and one-line description
- Installation/quickstart instructions
- Usage examples (code blocks)
- Link to contributing guide
- License badge or statement
- CI status badge (links to the workflow)

Do not audit README *content quality* (that is `readme-writing-worker-bee`'s job). This guide audits presence and completeness at a structural level.

## Monorepo sub-package README audit

For monorepos: check that each package directory with a `package.json` or `pyproject.toml` has its own `README.md`. Flag directories without one.

This check is opt-in for large monorepos (> 20 packages) to avoid noise.

## Scoring rubric

See `research/external/04-issue-pr-templates-docs.md` for full rubric. Summary:

| Files present | Score |
|---|---|
| README + CONTRIBUTING + SECURITY + LICENSE + CODE_OF_CONDUCT | 10 |
| README + CONTRIBUTING + LICENSE + SECURITY | 8 |
| README + CONTRIBUTING + LICENSE | 6 |
| README + LICENSE | 4 |
| README only | 2 |
| No README | 0 |

## Report section template

```markdown
### Docs Presence (Score: X/10)

| File | Present | Notes |
|---|---|---|
| README.md | ✅ | Has quickstart, badges |
| LICENSE | ✅ | MIT |
| CONTRIBUTING.md | ✅ | |
| SECURITY.md | ❌ | Missing - responsible disclosure policy needed |
| CODE_OF_CONDUCT.md | ❌ | Missing |
| SUPPORT.md | N/A | |

**Findings:**
- RECOMMEND: Add `SECURITY.md` documenting how to report security vulnerabilities (effort: 20 minutes; GitHub provides a template at github.com/nicowillis/security).
- RECOMMEND: Add `CODE_OF_CONDUCT.md` - use Contributor Covenant (contributor-covenant.org) as the starting point.
```

## Handoff

README structural improvement (quickstart, badges, voice, conversion) → `readme-writing-worker-bee`.
