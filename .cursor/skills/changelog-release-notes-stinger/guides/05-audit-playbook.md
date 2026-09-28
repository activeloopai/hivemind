# Guide 05: Audit Playbook

> Use when asked to review the existing CHANGELOG for quality, cadence, or accuracy.

*Derived from: `research/external/changelog-copy-craft.md`, `research/external/keep-a-changelog.md`, `research/external/semver.md`*

---

## What to audit

A CHANGELOG audit covers five dimensions, each scored 1-5:

| Dimension | What it measures |
|---|---|
| **Cadence** | Does every shipped version have an entry, close to release? |
| **User-centric language** | Is the writing for installers/harness users or for the next engineer? |
| **Semver accuracy** | Do the version bumps match the actual contract changes? |
| **Distribution coverage** | Does each release reach the right channels (GitHub Release, README, Slack)? |
| **Honest scope** | Does the team note what is NOT shipping when users expect it? |

Total possible: 25. Threshold for "healthy": 18+.

---

## Scoring rubric

### Cadence (1-5)

Cross-check CHANGELOG headings against shipped versions (git tags / npm versions).

- **5:** Every shipped version has a dated entry; `[Unreleased]` is current.
- **4:** Almost all versions covered; one or two patch versions missing an entry.
- **3:** Entries lag releases; several versions undocumented.
- **2:** Sparse - many shipped versions with no entry.
- **1:** CHANGELOG is stale or absent; versions ship undocumented.

### User-centric language (1-5)

Read the most recent 5 entries. Apply the before/after test from `guides/03-copy-craft.md`.

- **5:** All bullets pass. No raw commit messages, issue numbers, or dependency names the user does not call.
- **4:** Minor slips (1-2 implementation bullets per entry).
- **3:** Roughly half user-facing, half implementation.
- **2:** Mostly implementation language.
- **1:** Raw git log or pure issue dump.

### Semver accuracy (1-5)

For the most recent releases, compare the bump to the actual change using `guides/02-semver-decisions.md`. Pay attention to the wide contract surface: CLI, library API, harness contracts, MCP tool surface, Deep Lake schema.

- **5:** Every bump matches the change. Breaking changes went through Deprecated -> Removed with migration notes.
- **4:** Bumps correct; one breaking change missing a deprecation step.
- **3:** Mostly correct, but at least one minor shipped as a patch (or vice versa).
- **2:** A contract change (harness/MCP/schema) shipped as a patch with no migration note.
- **1:** Bumps are arbitrary; breaking changes ship silently under patch.

### Distribution coverage (1-5)

Check: does each release get a GitHub Release? README note when usage changes? Slack post for harness/MCP/schema breaks?

- **5:** GitHub Release for every version; README + Slack for significant/breaking releases.
- **4:** GitHub Releases present; README updated for major changes; Slack inconsistent.
- **3:** GitHub Releases present; no README/Slack follow-through on breaks.
- **2:** GitHub Releases missing or empty bodies.
- **1:** No GitHub Releases; CHANGELOG is a file nobody is pointed to.

### Honest scope (1-5)

- **5:** Regular honest-scope notes when heavily-requested capabilities are absent or a break is coming.
- **4:** Present when needed; occasional.
- **3:** Never used, but few publicly-discussed pending features exist.
- **2:** Announced/expected capabilities missing from multiple releases with no note.
- **1:** Users filing issues asking "where is X?" that one honest-scope note would have prevented.

---

## Audit workflow

1. Open `CHANGELOG.md` and the git tag / npm version history.
2. Read the most recent 10 entries (or all if fewer).
3. Cross-check headings against shipped versions and the actual diffs for semver accuracy.
4. Score each dimension; quote specific bullets for the language and semver findings.
5. Prioritize: lowest score gets fixed first. A semver score of 1-2 outranks everything - a wrong bump breaks installs.

---

## Common findings and fixes

| Finding | Likely fix |
|---|---|
| Raw commit messages in bullets | Rewrite using `guides/03-copy-craft.md`. |
| CHANGELOG heading does not match shipped tag | Reconcile against `package.json` / sync-versions; see `guides/04-release-mechanics.md`. |
| Contract change shipped as a patch | Re-document the semver decision; add a deprecation/migration note retroactively; tighten the pre-release check. |
| No GitHub Release body or empty | Cut the release body f