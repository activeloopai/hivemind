---
name: adr-writing-stinger
description: Architecture Decision Records specialist covering Nygard format (Context / Decision / Consequences), MADR extended template, Y-statement framing, supersession and deprecation lifecycle, Log4brains and adr-tools CLI integration, and the "decisions, not docs" philosophy. Use when authoring a new ADR, superseding an existing decision, auditing the ADR log, setting up Log4brains, or onboarding a team to ADR practice. Do NOT use for general knowledge-base authoring (library-worker-bee), code entity extraction (wiki-worker-bee), or security review of the decisions themselves (security-worker-bee).
license: MIT
---

# ADR Writing Stinger

Architecture Decision Records (ADRs) are the smallest useful unit of institutional memory. This Stinger encodes everything needed to author, govern, and maintain an ADR corpus: the Nygard canonical format, the MADR and Y-statement variants, the supersession lifecycle, lightweight tooling (Log4brains, adr-tools), and the "decisions, not docs" discipline that keeps ADR logs scannable and trustworthy across years of codebase evolution.

---

## When to use this stinger

Activate when the user:

- Says "write an ADR", "record this decision", "document our architecture choice", "create an ADR for X"
- Wants to supersede an existing ADR ("we changed our minds about X", "supersede ADR-007")
- Needs to set up an ADR log from scratch ("we've never done ADRs before")
- Asks about tooling ("should we use Log4brains or adr-tools?", "how do I generate ADR HTML?")
- Wants to use ADRs for onboarding ("how do new engineers read our ADR log?")
- Asks about format choices ("Nygard vs MADR vs Y-statements?")

Do NOT activate for:
- General documentation site architecture → `library-worker-bee`
- Per-entity code extraction into a wiki → `wiki-worker-bee`
- Security review of an architectural decision → `security-worker-bee` (hand off after authoring)

---

## Playbook

| Task | Guide |
|---|---|
| Choose the right ADR format | `guides/00-principles.md` |
| Write a Nygard-style ADR | `guides/01-nygard-format.md` |
| Write a MADR-style ADR | `guides/02-madr-format.md` |
| Write a Y-statement ADR | `guides/03-y-statements.md` |
| Supersede or deprecate an ADR | `guides/04-supersession-workflow.md` |
| Set up adr-tools or Log4brains | `guides/05-tooling-integration.md` |
| Use the ADR log for onboarding | `guides/06-adr-as-onboarding-tool.md` |

For a worked end-to-end example, see `examples/nygard-from-pr.md`.

For blank templates, see `templates/nygard.md`, `templates/madr.md`, and `templates/y-statement.md`.

---

## Core principles

### 1. Decisions, not docs

An ADR captures a **closed, consequential decision**, one that is hard or expensive to reverse and that future engineers will want to understand. It is NOT:

- A design proposal (use an RFC or PRD instead)
- A meeting summary (use a shared doc)
- A description of how something works (use the wiki)
- A changelog entry (use CHANGELOG.md)

The test: "If I delete this ADR, does the team lose understanding of *why* the codebase is the way it is?" If yes, write it. If no, do not.

### 2. Four required questions (Nygard canonical)

Every ADR must answer:

1. **What is the architectural context?** (forces at play, constraints, the problem)
2. **What decision did we make?** (the concrete, stated choice, no weasel words)
3. **What are the consequences?** (positive, negative, neutral, the trade-offs accepted)
4. **What alternatives were considered and rejected?** (and why)

### 3. Sequential numbering is permanent

ADR numbers are forever. They appear in commit messages (`ADR-0012`), code comments, PR descriptions, and onboarding docs. Never reuse, never renumber, never skip. A "deleted" ADR becomes `Status: Deprecated` with an explanation.

### 4. Supersession is bidirectional

When ADR-0025 supersedes ADR-0012:
- ADR-0025 must say `Supersedes: ADR-0012` in its header
- ADR-0012 must say `Status: Superseded by ADR-0025`

Both links must be present. One-directional supersession breaks the audit trail.

### 5. Status lifecycle

```
Proposed → Accepted → Superseded (by ADR-NNNN)
                    → Deprecated  (rationale required)
         → Rejected  (rationale required)
```

A `Proposed` ADR is in-flight. Never reference a `Proposed` ADR from code or other ADRs until it reaches `Accepted`. Never write `Proposed` ADRs for decisions already made.

---

## Format comparison matrix

| Criterion | Nygard | MADR | Y-statement |
|---|---|---|---|
| Length | 1 to 2 pages | 2 to 4 pages | 1 to 5 sentences |
| Sections | Context, Decision, Consequences | Title, Status, Context, Decision, Consequences, Pros, Cons, Alternatives | Single sentence with embedded structure |
| Best for | Most team decisions | Decisions needing explicit trade-off tables | Quick records, ADR log summaries |
| Tooling | adr-tools (native) | MADR template repo | Any markdown |
| Recommended default | Yes | When alternatives are complex | As supplement to Nygard/MADR |

Recommendation: use Nygard as the default. Switch to MADR when the team needs explicit pros/cons tables (common in multi-stakeholder decisions). Use Y-statements as a one-liner summary inside Nygard/MADR, not as a standalone format.

---

## Tooling at a glance

### adr-tools (npryce/adr-tools)

The original CLI. Creates Nygard-format ADRs, handles supersession linking, generates a table of contents.

```bash
adr init docs/decisions                       # initialize ADR log
adr new "Append-only version-bump for embeddings"   # creates docs/decisions/0001-append-only-version-bump.md
adr new -s 1 "In-place UPDATE for embeddings"       # creates 0002, supersedes 0001
adr generate toc                              # regenerates table of contents
```

### Log4brains (thomvaill/log4brains)

Static-site generator for ADR logs. Renders a searchable HTML knowledge base from a markdown ADR corpus. Now at v1.1.0 (December 2024). Supports mono-repo and multi-package layouts.

```bash
npx log4brains init              # interactive setup, generates .log4brains.yml
npx log4brains preview           # live preview at localhost:4004
npx log4brains build             # output to .log4brains/out/
npx log4brains adr new "..."     # create ADR and open editor
```

For tooling setup details, see `guides/05-tooling-integration.md`.

---

## References to research

The research folder was populated by `scripture-historian` at normal depth (15 files, 12 external source notes). Key sources:

- Nygard original (2011, canonical): `research/external/01-nygard-original.md`
- Practitioner guides 2025-2026: `research/external/02-specsource-2026.md`, `research/external/03-docsio-2026.md`, `research/external/04-archyl-2026.md`
- Format comparison (arXiv 2026 empirical study): `research/external/07-arxiv-2026-adr-comparison.md`
- Log4brains v1.1.0: `research/external/09-log4brains-github.md`
- Google Cloud enterprise patterns: `research/external/11-google-cloud-adrs.md`
- Full index: `research/index.md`
- Executive summary: `research/research-summary.md`

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*