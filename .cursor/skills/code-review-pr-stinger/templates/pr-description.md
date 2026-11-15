# PR Description Template

Fill in the six elements below. Remove any element that genuinely does not apply (e.g., "What did NOT change" for a purely additive PR with no exclusions). Do NOT leave placeholder text in the submitted description.

---

## Motivation

> Why does this PR exist? What problem does it solve, or what feature does it deliver?

<!-- One to three sentences. Start with the problem, not the solution. -->

[Describe the user impact or technical driver here.]

---

## Context

> What should the reviewer know before reading the diff?

<!-- Links to relevant issues, ADRs, prior PRs, design docs, or external specs. -->

- Closes: #[issue number]
- Related: #[prior PR or issue, if applicable]
- ADR / design doc: [link if applicable]

---

## What changed

> Human-readable summary of the diff. One bullet per logical change.

<!-- Be specific enough that a reviewer can predict what they will see in each file. -->

- [File or module]: [what changed and why]
- [File or module]: [what changed and why]

---

## What did NOT change

> Explicit scope boundary. Names things a reviewer might look for that are intentionally excluded.

<!-- This section prevents reviewers from filing blockers for things that are out of scope. -->

- [Name something that was intentionally NOT changed and why]
- [If nothing was intentionally excluded, write "Full scope - no intentional exclusions."]

---

## Testing proof

> How was this validated? Attach screenshots, CI links, or describe manual test steps.

<!-- Reviewers should not have to ask "did you test this?" -->

- [ ] Unit tests added / updated (run `[test command]`)
- [ ] Integration tests pass (CI link: [URL])
- [ ] Manual test steps: [describe if applicable]
- [ ] Screenshot: [attach if UI change]

---

## Reviewer hints

> Where should the reviewer focus? What files are boilerplate? Any specific concerns to probe?

<!-- Help the reviewer allocate their attention. -->

- **Key files to review:** [list 1-3 files where the important logic lives]
- **Files that are mechanical / boilerplate:** [list files the reviewer can skim]
- **Specific concerns I want feedback on:** [any design decision you are uncertain about]

---

*Template from `code-review-pr-stinger`. Full guide at `guides/01-pr-description.md`.*
