# Principles: Decisions, Not Docs

## The core commitment

An ADR (Architecture Decision Record) records a **closed, consequential decision** that shaped the codebase in a way future engineers need to understand. It is not a design doc, a meeting summary, a how-it-works explanation, or a changelog entry.

**The "decisions, not docs" test:** Would deleting this ADR leave future engineers unable to answer "why is this codebase the way it is?" If yes, write it. If no, don't. Noise in the ADR log is worse than silence; it makes the useful records harder to find.

---

## When to write an ADR

Write one when the decision is:

1. **Consequential**, affects system architecture, technology stack, data model, or security posture.
2. **Non-obvious**, a reasonable engineer reviewing the code would not immediately understand why this choice was made.
3. **Closed**, the decision has been made. In-flight proposals belong in RFCs or PRDs.
4. **Hard to reverse**, dataset schema shape, MCP tool contract, embeddings runtime choice, build toolchain, inter-bee protocol. Low-reversibility = high ADR value.

Examples that warrant ADRs:
- "We chose append-only version bumps over in-place UPDATE for embedding rows"
- "We adopted trunk-based development"
- "We fall back to BM25 when embeddings are disabled"
- "We gate tool calls with a string-based pre-tool-use check before dispatch"

Examples that do NOT warrant ADRs:
- "We added a jscpd threshold" (too small)
- "We are considering a second embeddings provider" (not closed)
- "Here's how the embeddings daemon works" (this is a wiki article, not an ADR)

---

## Format comparison

| Format | Length | Best for | Default? |
|---|---|---|---|
| **Nygard** | 1-2 pages | Most team decisions | Yes |
| **MADR** | 2-4 pages | Complex multi-stakeholder decisions with explicit trade-off tables | When alternatives are dense |
| **Y-statement** | 1-5 sentences | Quick summary line inside a Nygard/MADR, or ADR log overviews | Supplement only |

**Default recommendation:** Nygard. It is the most widely adopted format, natively supported by adr-tools, and scales from "we fall back to BM25" to "we adopted a hexagonal architecture". Switch to MADR when the Alternatives Considered section needs structured pros/cons tables for multiple stakeholders.

Y-statements are best used as the opening sentence of a Nygard/MADR, not as a standalone format.

---

## The five non-negotiables

1. **Never reuse or skip ADR numbers.** Numbers are permanent foreign keys in commit messages, code comments, and PR descriptions.
2. **Always close the loop on supersession.** Both the superseding and superseded ADRs must link to each other.
3. **Write the decision in the active voice, past tense.** "We decided to fall back to BM25" not "BM25 should be used." The decision is closed.
4. **Include Alternatives Considered.** Why alternatives were rejected is often more valuable than the decision itself. Future engineers will rediscover the same alternatives.
5. **Do not record open proposals as ADRs.** Use `Status: Proposed` sparingly and only for decisions that are actively being ratified.

---

## Escalation triggers

- If the decision touches auth, secrets, PII, or security posture → surface to `security-worker-bee` for a review of the decision itself after recording.
- If the ADR describes a feature that needs a PRD → hand off to `library-worker-bee` for PRD authorship.
- If the ADR log needs integration into a documentation site → hand off to `library-worker-bee` or the DevOps team.
