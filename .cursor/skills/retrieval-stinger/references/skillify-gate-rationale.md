# Skillify Gate Rationale - why KEEP / MERGE / SKIP

Reference for the codify quality bar. Mechanism is in `guides/07-skillify-codify.md`; this note is the why.

## The gate

`src/skillify/gate-runner.ts` runs a Haiku-class model over each candidate session (stripped to prompt + assistant text). `gate-parser.ts` parses one of three verdicts:

```
verdict: "KEEP" | "SKIP" | "MERGE"
```

Anything else parses to `null` and is treated conservatively - do not mine.

| Verdict | Meaning |
|---|---|
| `KEEP` | reusable, novel - write a new skill |
| `MERGE` | overlaps an existing skill - fold in, do not duplicate |
| `SKIP` | one-off, trivial, or noise - drop it |

## Why a gate exists at all

Without a gate, every session that looked vaguely useful would become a skill. The catalog would fill with near-duplicates, one-offs, and noise, and recall over skills would degrade into the same noisy-recall problem as over-broad semantic search. The gate is the filter that keeps the catalog worth pulling from.

## Why a cheap model runs it

The gate runs on every candidate session, per agent, constantly. It answers one classification, not "author a skill". A fast, cheap model (Haiku via `claude -p ... --model haiku`, or `anthropic/claude-haiku-4-5` / `HIVEMIND_HERMES_MODEL` on the Hermes path) is the right tool for a high-volume binary-ish filter. The actual skill prose is authored separately by `skill-writer.ts`. Running a heavyweight model on the gate is a cost mistake.

## How to keep it honest

- The gate prompt must keep eliciting exactly KEEP/MERGE/SKIP. Drift is a should-refactor.
- An unparseable verdict must default to SKIP, never KEEP. Default-mine is a must-fix.
- MERGE must actually merge, or near-duplicates accumulate.
- Every KEEP/MERGE writes a provenance row (`skills-table.ts`); a skill with no row is untraceable.

## The temptation to resist

When the catalog feels thin, the wrong move is loosening the gate to mine more. A loose gate trades a thin catalog for a noisy one, and a noisy catalog is worse - teammates stop trusting pulled skills. The gate is the credibility of the whole Codify -> Propagate half of the loop.
