# Example: CHANGELOG Audit Report

> A filled-in audit of a hypothetical @deeplake/hivemind CHANGELOG.
> Guide references: `guides/05-audit-playbook.md`

---

## Audit: @deeplake/hivemind CHANGELOG

**Audited by:** changelog-release-notes-worker-bee
**Date:** 2026-06-16
**Path:** `CHANGELOG.md`
**Entries reviewed:** 10 most recent, cross-checked against git tags and npm versions
**Time span:** ~3 months (0.6.x to 0.7.96)

---

## Scores

| Dimension | Score | Notes |
|---|---|---|
| Cadence | 3/5 | Many auto-patch releases shipped with no CHANGELOG entry; only the notable ones are documented. |
| User-centric language | 3/5 | Roughly half the bullets read as commit messages ("bump tree-sitter", "refactor capture writer"). |
| Semver accuracy | 2/5 | A Deep Lake schema tweak shipped under a patch with no migration note. |
| Distribution coverage | 4/5 | GitHub Releases present and populated; no Slack heads-up for the schema change. |
| Honest scope | 3/5 | No notes, but few publicly-promised capabilities are outstanding. |

**Total: 15/25** - Below healthy threshold (18). Semver accuracy is the priority fix.

---

## Findings by dimension

### Cadence (3/5)

`release.yaml` auto-patches on most pushes, so dozens of `0.7.x` versions shipped. Only ~10 have CHANGELOG entries. That is acceptable for pure internal patches, but at least three of the undocumented patches contained user-visible fixes.

**Recommendation:** Land a bullet under `[Unreleased]` for every user-facing PR as it merges, so auto-patch releases inherit an entry instead of shipping blank.

### User-centric language (3/5)

Sample bullets from recent entries:

- "Fix recall ranking off-by-one" - partial. Rewrite: "Recall no longer drops the most relevant memory when more than 50 match."
- "Bump tree-sitter to 0.21" - implementation, invisible. Omit unless it fixed a parse bug users hit.
- "Add `skillify --dry-run`" - user-centric. Good.
- "Refactor capture writer module" - internal. Omit.

**Recommendation:** Apply the verb table and before/after test from `guides/03-copy-craft.md`; drop internal-only bullets.

### Semver accuracy (2/5)

Version `0.7.40` added an optional Deep Lake tensor and was shipped as a patch. That happened to be backward compatible (old clients ignore the field), so MINOR would have been correct, not patch. More seriously, `0.7.61` changed a tensor dtype - a real schema break - and also shipped as a patch with no migration note. That is the kind of silent break `guides/02-semver-decisions.md` exists to prevent.

**Recommendation:** Add a pre-release check: any diff touching the Deep Lake schema, MCP tool surface, or harness contracts must be classified before the version is set. Retroactively document the `0.7.61` schema change with a migration note.

### Distribution coverage (4/5)

GitHub Releases exist for tagged versions with CHANGELOG-derived bodies. Gap: the `0.7.61` schema break got no Slack post, so harness users had no heads-up.

**Recommendation:** Make a Slack community post mandatory for any harness/MCP/schema break (`guides/04-release-mechanics.md`).

### Honest scope (3/5)

No honest-scope notes, but no major capability has been publicly promised and withheld, so the absence is not yet a problem.

**Recommendation:** No action now. Add a note the moment a roadmap capability slips a release.

---

## Priority action plan

1. **Immediate:** Retroactively document the `0.7.61` schema change with a migration note; post it to Slack.
2. **This release:** Add the pre-release semver-classification check for schema / MCP / harness diffs.
3. **Ongoing:** Land an `[Unreleased]` bullet per user-facing PR; strip internal-only bullets.
4. **Process:** Treat a CHANGELOG entry as a done criterion for any user-facing change.
