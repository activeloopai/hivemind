# Skillify Gate - Haiku KEEP / MERGE / SKIP (Codify)

**Source:** `src/skillify/skillify-worker.ts`, `gate-runner.ts`, `gate-parser.ts`, `skill-writer.ts`, `skills-table.ts`, `existing-skills.ts`.
**Retrieved:** 2026-06-16
**Status:** LOAD-BEARING. The quality bar for what enters recall.

---

## TL;DR

The Codify step turns recent sessions into skills. A Haiku gate decides, per candidate, whether
it becomes a new skill (KEEP), folds into an existing one (MERGE), or is dropped (SKIP). KEEP/MERGE
write a SKILL.md plus a provenance row in the `skills` Deep Lake table.

---

## Key facts

- The worker pulls the last ~10 sessions, strips each to prompt + assistant text (tool noise dropped).
- `gate-runner.ts` sends each candidate (plus the existing-skills list) to Haiku; `gate-parser.ts`
  parses the verdict JSON.
- Verdicts: KEEP (novel + reusable + generalizes), MERGE (overlaps an existing skill, adds a wrinkle;
  requires a `target`), SKIP (one-off / trivial / already covered).
- KEEP/MERGE -> `skill-writer.ts` writes SKILL.md + a provenance row in `skills`. That row is what
  propagation reads later.
- Skills carry a scope (`me` | `team`) from `scope-config.ts`.

---

## Why a gate at all

- Recall quality is downstream of what gets codified. A loose gate floods `memory`/`skills` with
  noise that dilutes every future recall; a strict gate starves it. The gate IS the recall-quality
  control point for the Codify loop.

---

## Implications for the guides

- The gate must always see the existing-skills list, or MERGE can never fire and near-duplicates pile up.
- MERGE without a `target` is dropped by the parser - the rubric must require it.
- Gate calibration should be treated like judge calibration: label a set, measure agreement, tune.
  Currently informal (`gaps.md` item 5).

---

## Caveats

- The HAIKU gate is a small fast model; its verdicts are heuristic, not authoritative. Spot-check
  written skills periodically.
- The stripping step can over-strip a session to nothing (all tool calls), producing spurious SKIPs.
