# Principles: README as Landing Page

> Source: `research/external/2026-05-20-readme-structure-best-practices.md`, `research/external/2026-05-20-awesome-readme-gallery.md`

---

## The 30-second visitor window

A visitor lands on your repository. They have 30 seconds. In that window they decide: "Is this worth my time?" If the answer is not immediately yes, they bounce and you never get them back.

This is the foundational constraint that drives every decision in this stinger:
- Section order (most important content first)
- Length limits (readers skim, not read)
- Badge count (signal, not noise)
- Quickstart placement (hero section, not buried in page 3)

The README is not documentation. Documentation explains how things work. The README converts a skeptical visitor into a motivated user.

---

## The five rules

### Rule 1, Every section earns its place

Before adding any section, ask: "Does this convert a visitor or retain a contributor?" If neither, cut it.

A table of contents with 12 items does not convert visitors. A quickstart block that runs in one copy-paste does.

### Rule 2, The quickstart is the hero section

The single highest-leverage line in any README is the install command. Everything that appears before it is setup. Everything that appears after it is expansion.

The quickstart must be:
- Copy-paste runnable on a fresh machine (no assumed env vars, no assumed local state)
- 5 commands or fewer
- The first thing a reader can act on

See `guides/01-structure-checklist.md` for placement.

### Rule 3, Write for your audience register

Two registers. Two READMEs.

**OSS register:** The reader is a skeptical developer evaluating alternatives. They have 10 tabs open. Your README competes with its neighbors. Lead with value. Make the install command visible without scrolling.

**Internal register:** The reader is a trusting teammate. They know the problem exists. They need context, not sales. Lead with "what this solves and why it lives here." Tell them who maintains it.

Never mix registers. A README written for both audiences serves neither.

See `guides/03-oss-vs-internal.md` for the full split.

### Rule 4, Prose is the last resort

Use headers, code fences, and bulleted lists before writing a paragraph. When a section exceeds 30 lines without a code example, it belongs in a separate docs file.

Effective length: 300-1,500 words.
Extraction threshold: 2,000 words, flag for docs-site extraction route to `library-worker-bee`.

### Rule 5, Status badges are signals, not decorations

3-5 badges in the header signals a maintained, production-quality project. 9 badges with four "made with ❤️" signals an unmaintained hobby project trying to look professional.

Approved badge types: CI/CD status, coverage, version, downloads, license. Vanity badges: cut them all.

See `guides/02-badges.md`.

---

## When README-driven development applies

If the user is starting a new project with no existing code, apply the RDD lens from `guides/04-rdd.md`. Write the README first. The README becomes the API spec that the implementation validates against.

Key RDD rule: write in present tense as if the product already exists. No "will support", no "coming soon". If you wouldn't write it in the README today, you don't need to build it today.

---

## Handoff triggers

These conditions require escalating outside this stinger:

| Condition | Action |
|---|---|
| README exceeds 2,000 words | Flag extraction; hand off to `library-worker-bee` |
| User wants a full docs site | Hand off to `library-worker-bee` |
| CI badge pipeline needs setup | Hand off to `ci-release-worker-bee` |
| TypeScript/Node package publishing flow needs documenting | Hand off to `typescript-node-worker-bee` |

---

*Cite this file in audit reports as `guides/00-principles.md`. All other guides derive from this foundational constraint.*
