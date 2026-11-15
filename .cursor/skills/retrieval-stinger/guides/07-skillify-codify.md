# 07 - Skillify / Codify

The codify half of the loop: turning captured sessions into reusable skills. It lives in `src/skillify/*` (~40 files). The pipeline is candidate selection -> Haiku gate -> skill write -> provenance row.

---

## The pipeline

1. **Pull candidates.** The worker pulls the last ~10 in-scope sessions (scope `me` / `team`, resolved by `scope-config.ts`).
2. **Strip to signal.** Each session is reduced to prompt + assistant text, dropping tool noise and wrapper fields.
3. **Gate with Haiku.** `gate-runner.ts` runs the gate model and `gate-parser.ts` parses the verdict: `KEEP` | `MERGE` | `SKIP`.
4. **Write the skill.** On KEEP/MERGE, `skill-writer.ts` writes a `SKILL.md`.
5. **Record provenance.** `skills-table.ts` inserts one row per skill version into the Deep Lake `skills` table.
6. **Propagate.** `pull.ts` / `auto-pull.ts` fan teammate-mined skills out at SessionStart (`08-propagation.md`).

---

## The Haiku gate - the quality bar

`gate-runner.ts` invokes the host agent CLI in gate mode, e.g.:

```
claude -p <prompt> --no-session-persistence --model haiku --permission-mode bypassPermissions
```

(Hermes path uses `-m anthropic/claude-haiku-4-5` or `HIVEMIND_HERMES_MODEL`.) `gate-parser.ts` reads the verdict:

```
verdict: "KEEP" | "SKIP" | "MERGE"
```

and rejects anything that is not one of the three (`if (v.verdict !== "KEEP" && v.verdict !== "SKIP" && v.verdict !== "MERGE") return null`).

| Verdict | Meaning | Action |
|---|---|---|
| `KEEP` | a genuinely reusable, novel skill | write a new skill + provenance row |
| `MERGE` | overlaps an existing skill | fold into the existing skill rather than spawn a near-duplicate |
| `SKIP` | one-off, trivial, or noise | do not mine |
| (unparseable) | gate failed to return a clean verdict | treat conservatively - do not mine |

The gate is what keeps the catalog clean. Lowering it to mine more is how the catalog rots. An unparseable verdict defaulting to KEEP would be a must-fix.

---

## Why a cheap model gates

Haiku (a fast, cheap model) runs the gate because it runs on every candidate session, per agent, often. The gate is a high-volume filter, not a deep author - it answers one classification (KEEP/MERGE/SKIP), not "write me a skill". The actual skill prose is written separately by `skill-writer.ts`. Running a heavyweight model on the gate is a cost should-refactor.

---

## Provenance is mandatory

`skills-table.ts` inserts into the Deep Lake `skills` table one row per skill version, carrying author, scope, and version metadata (with a `[author]` fallback when a field is absent). A skill that lands as a `SKILL.md` on disk without a matching `skills` row is untraceable - a teammate pulling it cannot tell where it came from or whether to trust it. That is a must-fix.

---

## Related skillify machinery

The `src/skillify/*` folder also holds: `skill-proposer.ts` / `skill-publisher.ts` / `skill-org-publish.ts` (authoring + publish), `manifest.ts` / `local-manifest.ts` (catalog index), `triggers.ts` / `skillopt-*` (skill-optimization loop), `success-judge.ts` (did the mined skill help), and `scope-promotion.ts` (promote a `me` skill to `team`). retrieval-worker-bee owns the gate, the writer's provenance contract, and propagation; deeper authoring-prompt tuning is in scope when it affects what gets mined and whether it is traceable.

---

## What to check on a skillify-audit

1. **Verdict discipline** - does the gate prompt still elicit exactly KEEP/MERGE/SKIP? Drift is a should-refactor.
2. **Conservative default** - does an unparseable verdict mine, or skip? It must skip.
3. **MERGE actually merges** - or does it spawn a near-duplicate skill?
4. **Provenance row written** - every KEEP/MERGE produces a `skills` row.
5. **Candidate stripping** - is tool noise dropped so the gate sees prompt + assistant text, not raw blobs?
6. **A bad skill got mined** - trace it back: was the verdict KEEP on a one-off? Tighten the gate prompt and re-run; do not hand-delete and move on.
