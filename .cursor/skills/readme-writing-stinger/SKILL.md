---
name: readme-writing-stinger
description: Authors, audits, and restructures README files so they convert visitors into users. Apply when the user says "write a README", "audit my README", "make my README better", "README for this project", "README-driven development", or when starting a new project and the README does not exist yet. Also apply when badges are broken or missing, the quickstart is not copy-paste runnable, or the user wants to differentiate between an OSS and an internal tool README. Do NOT apply for full documentation site architecture (library-worker-bee), per-entity code extraction (wiki-worker-bee), or CI badge pipeline wiring (ci-release-worker-bee).
---

# readme-writing-stinger

The README is a landing page, not a manual. A visitor makes a go/no-go decision in 30 seconds. Every structural choice this skill encodes (section order, length limits, badge count, quickstart discipline) derives from that constraint.

This stinger encodes five bodies of knowledge:
1. **Structural discipline**: the canonical 2026 section order and length thresholds.
2. **Badge hygiene**: which badges earn their spot, which are vanity noise.
3. **OSS vs internal**: two audiences, two registers, two templates.
4. **README-driven development (RDD)**: write the README before the code.
5. **Done criteria**: a 12-point checklist to validate before any output is committed.

---

## First action

Read `guides/00-principles.md` before touching any file. It anchors the "landing page, not manual" mindset and the 30-second visitor window that every guide section cites.

---

## Procedure

### Step 1: Classify

Identify the project type from the user's input or by reading the repo:

| Type | Signal | Template |
|---|---|---|
| OSS library | Public repo, package manifest, semantic versioning | `templates/oss-library-readme.md` |
| Internal tool | Private repo, team-specific naming, runbook adjacent | `templates/internal-tool-readme.md` |
| SaaS product | Landing page README, marketing tone | OSS template with product-first framing |
| CLI | Executable name, usage flags prominent | OSS template with `USAGE` block promoted |
| Monorepo root | Links to sub-packages, no direct install | See open question in `research/research-summary.md` Q2 |

When in doubt, ask. Classifying wrong means the wrong template and wrong tone, the fastest way to produce a README the user won't use.

### Step 2: Audit the existing README

If a `README.md` already exists, read it fully before proposing any changes. Run the checklist in `guides/05-done-checklist.md` mentally and emit a brief audit table:

```
| Section          | Status  | Notes                          |
|------------------|---------|--------------------------------|
| Title/tagline    | ✅ pass |                                |
| Badges           | ⚠️ warn | 8 badges, 3 are vanity noise   |
| One-liner        | ❌ fail | Missing                        |
| Quickstart       | ⚠️ warn | Assumes env vars not explained |
```

Surface what is already good before proposing rewrites. The user may have intentional choices.

### Step 3: Apply the section structure

Follow the canonical order from `guides/01-structure-checklist.md`:

1. Title + one-liner tagline
2. Badges (3-5 max, status-only)
3. Hero image or demo GIF (OSS only; skip for internal)
4. One-liner pitch (one sentence, no jargon)
5. Quickstart (5 commands max, copy-paste runnable)
6. Features (bulleted, 5-8 items)
7. Install (complete, works on fresh machine)
8. Usage / examples (at least one code block per main use case)
9. Configuration (if applicable)
10. Contributing
11. License

Table of contents only if 5+ sections. See `guides/01-structure-checklist.md` for pass/fail criteria per section.

### Step 4: Apply badge discipline

Follow `guides/02-badges.md`. Max 3-5 badges in the header. Approved types: CI/CD status, test coverage, version/release, downloads, license. Strip vanity badges (heart badges, "PRs welcome" without evidence, broken/stale).

### Step 5: Apply OSS vs internal lens

Follow `guides/03-oss-vs-internal.md`. Determine the register (skeptical time-poor developer vs trusting teammate) and apply the matching tone throughout. Do not mix registers.

### Step 6: Apply RDD if starting from scratch

If the user is starting a new project without existing code, follow `guides/04-rdd.md`. Write the README as if the product already exists, using present tense. The README becomes the API spec before implementation begins.

### Step 7: Final validation

Run `guides/05-done-checklist.md` end to end. Every item must pass before emitting the final README. Emit the completed checklist inline for the user to review.

---

## What "done" looks like

- The README is under 1,500 words (or extraction is flagged at 2,000 words).
- The quickstart block is copy-paste runnable: tested mentally against a fresh machine with no prior context.
- Badge count is 3-5, all dynamic, all CI/status-class.
- Every section listed in Step 3 is present (or explicitly omitted with a reason).
- The checklist in `guides/05-done-checklist.md` passes all 12 points.

---

## Handoffs

| Situation | Hand off to |
|---|---|
| README exceeds 2,000 words | `library-worker-bee` for docs-site architecture |
| Code entity documentation needed | `wiki-worker-bee` |
| CI badge pipeline needs wiring | `ci-release-worker-bee` |
| TypeScript/Node package publishing flow (`npm publish`) needs documenting | `typescript-node-worker-bee` |

---

## Folder layout

```
readme-writing-stinger/
├── SKILL.md                         (this file, master index)
├── README.md                        (human overview)
├── guides/
│   ├── 00-principles.md             (the "landing page not manual" manifesto)
│   ├── 01-structure-checklist.md    (canonical section order + pass/fail criteria)
│   ├── 02-badges.md                 (badge discipline, approved types, Shields.io patterns)
│   ├── 03-oss-vs-internal.md        (two registers, two templates)
│   ├── 04-rdd.md                    (README-driven development)
│   └── 05-done-checklist.md         (12-point validation)
├── examples/
│   ├── before-after-oss.md          (OSS library README before and after)
│   └── before-after-internal.md     (internal tool README before and after)
├── templates/
│   ├── oss-library-readme.md        (fill-in-the-blanks OSS template)
│   └── internal-tool-readme.md      (fill-in-the-blanks internal tool template)
├── reports/
│   └── README.md                    (past audit summaries accumulate here)
└── research/                        (DO NOT MODIFY, authored by scripture-historian)
    ├── research-plan.md
    ├── research-summary.md
    ├── index.md
    └── external/
        ├── 2026-05-20-readme-structure-best-practices.md
        ├── 2026-05-20-readme-driven-development.md
        ├── 2026-05-20-shields-io-badges.md
        └── 2026-05-20-awesome-readme-gallery.md
```

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
