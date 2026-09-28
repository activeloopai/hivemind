# README-Driven Development (RDD)

> Source: `research/external/2026-05-20-readme-driven-development.md`
>
> Note: The primary source for RDD is Tom Preston-Werner's `noffle/art-of-readme` manifesto (https://github.com/noffle/art-of-readme), which was not scraped in this shallow research pass. The findings below derive from secondary sources. Fetch the primary source directly when authoring high-fidelity RDD guidance.

---

## What is RDD?

README-driven development is the practice of writing the README before writing implementation code. The README functions as a design document, an API spec, and a success criterion all in one.

Quantitative evidence from 2026 team metrics (from `research/external/2026-05-20-readme-driven-development.md`):
- 22% fewer rewrites when README is authored before code
- 3x faster onboarding for new contributors
- 34% reduction in "exploratory coding" time (building features that are then removed)

---

## The five RDD principles

### Principle 1, Write the README first

Before writing any implementation code, write the README as if the project already exists and works perfectly.

This forces the author to:
- Name the tool clearly
- Articulate the problem it solves in one sentence
- Design the public API (install, usage, options) before it is locked in by implementation decisions
- Identify what is in scope (it exists in the README) vs out of scope (it doesn't)

### Principle 2, Use present tense; no future tense

Write "The tool does X" not "The tool will do X" or "Coming soon: X."

If you cannot write it in present tense, you have not decided to build it. RDD makes this explicit rather than letting scope creep hide in vague future-tense aspirations.

### Principle 3, Plan for two review rounds before coding begins

Share the README with one or two stakeholders or teammates before writing any code. The goal is to surface:
- Naming confusion (is the one-liner accurate?)
- Scope questions ("does this do Y or just Z?")
- API design feedback ("I wish the install step didn't require root")

Two passes costs 30 minutes. Discovering a naming confusion after 3 weeks of coding costs significantly more.

### Principle 4, The README is the acceptance criteria

The test suite validates what the README claims. If the README says "install with `npm install foo`", there must be a test that validates that install path works. If the README shows a usage example, there must be a test that validates the output matches.

This creates a self-documenting feedback loop: when tests fail, the README is the first place to check whether the claim is still accurate.

### Principle 5, Update the README before the code

When behavior changes, update the README first, then update the implementation, then update the tests. In that order. This preserves the README as the single source of truth and prevents the "README says one thing, code does another" desync that is the most common failure mode in documentation.

---

## When to apply RDD

| Situation | Apply RDD? |
|---|---|
| Starting a new library or CLI from scratch | Yes |
| Adding a major new feature to an existing project | Yes (update README first) |
| Internal tool that only you will use | Optional (still useful for future-self documentation) |
| Auditing an existing README | No (RDD is for greenfield; use the checklist in `guides/05-done-checklist.md`) |
| Bug fix or patch | No |

---

## RDD quickstart prompt

When the user says "start a new project" or "write the README first":

1. Ask: "What problem does this solve in one sentence?"
2. Ask: "Who is the user, another developer, an end user, or a teammate?"
3. Ask: "What is the install command?"
4. Ask: "What is the most basic usage example?"
5. Fill `templates/oss-library-readme.md` (or `internal-tool-readme.md`) with the answers.
6. Leave sections that need design decisions as `TODO:` placeholders and call them out explicitly.
7. Tell the user: "Here is the README. Review it before writing any code. The `TODO:` items are design decisions that need answers before implementation begins."

---

*See `examples/before-after-oss.md` for a README written in RDD style from a fresh prompt.*
