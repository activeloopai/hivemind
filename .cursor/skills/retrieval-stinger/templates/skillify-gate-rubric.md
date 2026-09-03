# Template: Skillify Gate Rubric (KEEP / MERGE / SKIP)

The rubric the Haiku gate uses to decide whether a session candidate becomes a skill.
Drop this into the gate prompt. One verdict per candidate.

> **Source of truth:** `src/skillify/gate-runner.ts`, `gate-parser.ts`, `skill-writer.ts`, `examples/04-skillify-gate-walkthrough.md`.

---

## The gate prompt shape

```
SYSTEM:
You are the skillify gate. Given a candidate (a stripped prompt + assistant response) and the
list of existing skills, decide whether it should become a reusable skill.

Return ONLY valid JSON:
{
  "verdict": "KEEP" | "MERGE" | "SKIP",
  "target":  "<existing-skill-name>" | null,   // required when MERGE, else null
  "reason":  "<one to two sentences>"
}

USER:
Existing skills:
{existing_skills_list}

Candidate:
{prompt_and_response}

Decide now. Return only JSON.
```

---

## Verdict rubric

| Verdict | Bar |
|---|---|
| KEEP | Novel AND reusable AND generalizes beyond this one task. No existing skill covers it. |
| MERGE | Overlaps an existing skill but adds a wrinkle (new failure mode, new lever, new rationale). Set `target`. |
| SKIP | One-off, trivial, no transferable judgment, or already fully covered by an existing skill. |

---

## Calibration anchors

- **KEEP 1.0:** "diagnosed the embeddings daemon socket-path failure on a moved home dir and fixed it."
  Reusable troubleshooting pattern, nothing covers it.
- **MERGE:** "raised the embed timeout for cold model load" when an `embeddings-daemon-tuning`
  skill already exists -> fold in, `target: "embeddings-daemon-tuning"`.
- **SKIP:** "listed files in the repo root." Trivial, nothing to codify.

---

## Anti-patterns

| Anti-pattern | Why bad |
|---|---|
| KEEP for a one-off command | floods recall with noise |
| SKIP for a genuinely reusable fix | starves recall, loses the lesson |
| MERGE without `target` | parser drops the verdict (`gate-parser.ts` requires it) |
| Gate run without the existing-skills list | MERGE can never fire -> near-duplicate skills pile up |
| Multi-verdict output | parser expects exactly one verdict per candidate |

---

## Tuning the bar

- Too many SKIPs -> bar too strict, or candidates stripped to nothing (all tool noise). Check the strip step.
- Junk skills written -> bar too loose; tighten the KEEP definition.
- Duplicates piling up -> the gate isn't seeing existing skills; fix the `existing-skills.ts` feed.

Calibrate against a labeled set the same way you'd calibrate any judge. A loose gate is the
fastest way to poison recall quality.
