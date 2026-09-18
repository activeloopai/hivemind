# Research Summary: technical-writing-craft-stinger

**Compiled by:** scripture-historian
**Date:** 2026-05-20
**Depth tier:** normal
**Time window:** May 2025 to May 2026 (12 months; 2026-prioritized)
**Total files written:** 12 (1 plan, 1 summary, 1 index, 1 internal, 10 external)

---

## Files written

| Subfolder | File count |
|---|---|
| research/ (root) | 3 (research-plan.md, research-summary.md, index.md) |
| research/internal/ | 1 |
| research/external/ | 10 |

---

## Five most influential sources

### 1. Diátaxis canonical site (diataxis.fr) - files 01 and 02
**Why it matters:** This is the organizing canon for the entire Stinger. The Bee's first action (classify Diataxis mode) depends on the four-mode definitions from these pages. The tutorial/how-to distinction, the explanation/reference distinction, and the characteristic language patterns for each mode are all drawn directly from the canonical site. Files 01 and 02 together cover the overview, tutorials, how-to guides, and explanation. Stinger-forge should also fetch `https://diataxis.fr/reference/` to complete the four-mode picture (reference was not fetched in this run - flagged below).

### 2. Google Developer Documentation Style Guide (developers.google.com/style) - file 03
**Why it matters:** The second-person rule, active-voice rule, "conditions before instructions" rule, sentence-case headings, and code-sample formatting rules all come from here. Google's style guide is the most widely adopted public developer documentation style guide and serves as the default standard when no house style is provided. Multiple criteria in the Bee's scorecard (voice/tone, code examples) can be grounded in specific Google style guide citations.

### 3. Code Example Discipline - aggregated from Google, GitHub, Microsoft - file 06
**Why it matters:** The `templates/code-example-checklist.md` template is the most concrete, immediately actionable deliverable of the Stinger. This file provides the source material for every item on that checklist: runnable, correct, preceded by an introductory sentence, omissions marked with language comments (not ellipsis), non-obvious lines annotated, named parameters for clarity, language-tagged code fences, tested against current library versions.

### 4. Every Page is Page One (Mark Baker) - file 10
**Why it matters:** This is the theoretical foundation for `guides/04-reader-lens.md`. The EPPO principle (readers arrive cold via search, every page must be self-contained) provides the "why" behind the Bee's reader-lens check. In 2026, with AI chatbots pulling individual paragraphs out of context, EPPO is more relevant than when Baker wrote it. The seven EPPO principles map directly to review heuristics.

### 5. Stripe Developer Documentation Approach - file 07
**Why it matters:** Stripe represents the gold-standard developer documentation in the industry. The "time to first success" principle, the Quickstart structure (zero theory, install/run/see-result), and the "working code on every page" philosophy provide concrete models the Bee can use as aspirational examples. The Markdoc architecture also demonstrates that discipline at authoring boundaries (structured authoring format) is a docs-as-code concern, not just a platform concern.

---

## Five open questions for stinger-forge

1. **Diataxis reference page not fetched.** The research run fetched tutorials, how-to guides, and explanation from diataxis.fr but not the reference page (`https://diataxis.fr/reference/`). Stinger-forge should fetch this before writing `guides/00-diataxis.md` to complete the four-mode picture. The reference mode is characterized by information-orientation, completeness, and accuracy - it describes the machinery as-is and is consulted rather than read cover-to-cover.

2. **No canonical Stripe style guide URL exists publicly.** Command Brief open question Q2 is resolved: Stripe does not publish a traditional style guide document. Stripe's principles must be inferred from the Markdoc blog post (stripe.dev/blog/markdoc) and third-party analyses. Stinger-forge should document this in `guides/03-voice-and-tone.md` and reference the inferred principles with appropriate attribution rather than a direct URL citation.

3. **No Diataxis-specific Vale ruleset found.** Command Brief open question Q1 is resolved: no dedicated Vale ruleset for Diataxis classification exists as of May 2026. Diataxis mode classification is a semantic judgment beyond pattern-matching linters. Stinger-forge should note in `guides/06-docs-as-code-review.md` that Vale handles lower-level style rules (passive voice, capitalization, defined terms) while the Bee handles structural/mode classification.

4. **Reference vs. explanation distinction for API docs.** Command Brief open question Q3 is partially resolved by the diataxis.fr explanation page (explanation is understanding-oriented, discursive, can admit opinion; reference is information-oriented, complete, neutral, describes the machinery). Stinger-forge should include a worked example in `guides/00-diataxis.md` showing an API concept documented first as reference (parameter list, types, defaults) and then as explanation (why this parameter exists, design trade-offs, when to use each value). The `https://diataxis.fr/reference-explanation/` page may provide a canonical worked example - fetch it.

5. **Ghostwriting mode voice-matching methodology not sourced.** The research did not surface a specific source for the voice-matching discipline in `guides/05-ghostwriting.md`. The Command Brief describes it as "voice matching, style guide adherence, the self-review loop before delivery." Stinger-forge should synthesize this guide from first principles (or from the supplied style guide when one is provided by the user) rather than citing an external authority. The Google style guide and Stripe approach provide stylistic anchors for the default Legion voice.

---

## Sources to re-fetch for deeper context

| Source | URL | Reason |
|---|---|---|
| Diataxis reference mode | https://diataxis.fr/reference/ | Needed to complete four-mode picture for guides/00-diataxis.md |
| Diataxis reference vs explanation | https://diataxis.fr/reference-explanation/ | Answers Command Brief Q3 about API docs |
| Diataxis quality | https://diataxis.fr/quality/ | May provide review criteria that align with the Bee's scorecard |
| Diataxis application | https://diataxis.fr/application/ | Practical application guidance for the Bee's classification step |
| Google style: voice | https://developers.google.com/style/tone | Detailed tone guidance for guides/03-voice-and-tone.md |
| Google style: active voice | https://developers.google.com/style/voice | Authoritative definition for active/passive voice rule |
| Grafana writers toolkit | https://grafana.com/docs/writers-toolkit/ | Mature docs-as-code example with Vale in production |
