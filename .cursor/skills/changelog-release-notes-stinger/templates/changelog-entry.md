# Template: CHANGELOG Entry

> One release-notes entry for @deeplake/hivemind. Fill in every placeholder; delete sections that don't apply. Do not leave `[PLACEHOLDER]` text in the published entry. Apply `guides/03-copy-craft.md` and confirm the bump with `guides/02-semver-decisions.md`.

---

```markdown
## [[VERSION]] - [YYYY-MM-DD]

[One sentence: the most important user-visible change in this release, framed as impact.]

### Added
- **[New CLI command / flag, library export, MCP tool, or capability]:** [who can now do what. Impact-first. 1-2 sentences.]

### Improved
- **[What works better]:** [how. Quantify if possible: "up to 5x faster on repos over 10k files".]

### Changed
- **[Behavior that changed]:** [what changed and what the user must do, if anything. If not backward compatible, this is a breaking change - label the bump MAJOR and add migration steps.]

### Deprecated
- **[Feature still working but slated for removal]:** [the replacement and the removal version/date.]

### Removed
- **[What is gone]:** [what replaces it. Migration steps if a contract surface - CLI / library / harness / MCP / Deep Lake schema.]

### Fixed
- **[Symptom the user hit]:** [described as the observable behavior, now resolved. Not the root cause.]

### Security
- **[Affected component]:** [Fixed a security vulnerability in [component]. Severity if known. No exploit detail before users can upgrade.]
```

---

**Coming next** *(delete if no publicly-discussed capability is pending)*

We started work on [feature] but it is not ready for the quality bar we want. [Expected in [rough window] / No ETA yet.]

---

## Release checklist

- [ ] Version bump decided per `guides/02-semver-decisions.md` (patch / minor / major). Contract surfaces checked: CLI, library 