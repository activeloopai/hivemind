# MADR Format (Markdown Architectural Decision Records)

MADR extends the Nygard format with explicit Pros and Cons tables for each alternative, making it well-suited for decisions with multiple competing options where stakeholders need to compare trade-offs at a glance. It is maintained at [adr.github.io/madr](https://adr.github.io/madr/).

---

## When to use MADR over Nygard

Use MADR when:
- There are three or more serious alternatives and stakeholders need a structured comparison.
- The decision is multi-stakeholder (engineering + product + security) and explicit trade-off documentation aids alignment.
- The team already uses MADR as their project standard.

Use Nygard when:
- The decision is clear-cut with one or two alternatives.
- Speed matters (MADR takes longer to fill out completely).
- The team has not established a standard yet (Nygard is simpler to bootstrap).

---

## MADR template (short form)

```markdown
# NNNN. <Title>

Date: YYYY-MM-DD

## Status

<Proposed | Accepted | Superseded by MADR-NNNN | Deprecated | Rejected>

## Context and Problem Statement

<Describe the problem and the forces that make a decision necessary. What is the 
architectural challenge? Keep this factual and neutral, both proponents and opponents 
of any option should recognize this description as accurate.>

## Decision Drivers

- <Driver 1: e.g., "Low operational overhead for the team">
- <Driver 2: e.g., "Must support row-level security for multi-tenancy">
- <Driver 3: e.g., "Must integrate with our existing TypeScript ecosystem">

## Considered Options

- [Option A: <name>]
- [Option B: <name>]
- [Option C: <name>]

## Decision Outcome

Chosen option: **<Option X>**, because <one-sentence rationale summarizing how it best satisfies the decision drivers>.

### Consequences

- **Good:** <positive consequence>
- **Bad:** <negative consequence or trade-off accepted>
- **Neutral:** <neutral consequence>

## Pros and Cons of the Options

### Option A: <name>

<Brief description of the option.>

- Good, because <pro 1>
- Good, because <pro 2>
- Bad, because <con 1>
- Bad, because <con 2>

### Option B: <name>

<Brief description of the option.>

- Good, because <pro 1>
- Bad, because <con 1>

### Option C: <name>

<Brief description of the option.>

- Good, because <pro 1>
- Bad, because <con 1>
```

---

## Key differences from Nygard

| Section | Nygard | MADR |
|---|---|---|
| Context | Narrative paragraph | Structured "Context and Problem Statement" + "Decision Drivers" |
| Options | Listed in "Alternatives Considered" | Listed upfront in "Considered Options", then expanded with pros/cons tables |
| Decision | Single "Decision" section | "Decision Outcome" with rationale tied to drivers |
| Consequences | Narrative | Structured Good/Bad/Neutral |

---

## Filing conventions

Same as Nygard: `NNNN-<kebab-title>.md` in the project's ADR directory. MADR files can coexist with Nygard files in the same log, the format is per-file, not per-repository. However, mixing formats reduces readability; if the project starts with MADR, keep it consistent.

---

## Tooling note

The official MADR repository at [github.com/adr/madr](https://github.com/adr/madr) ships a starter pack of templates. Log4brains supports MADR out of the box; adr-tools uses Nygard but can be configured with a custom template (see `guides/05-tooling-integration.md`).
