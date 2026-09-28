# Example 04 - Skillify Gate Decision Walkthrough (KEEP / MERGE / SKIP)

The Codify step turns recent sessions into skills. A Haiku gate decides, per candidate,
whether it becomes a new skill (KEEP), folds into an existing one (MERGE), or gets dropped
(SKIP). This walkthrough traces one worker pass end to end.

> **Reference:** `src/skillify/skillify-worker.ts`, `gate-runner.ts`, `gate-parser.ts`, `skill-writer.ts`, `skills-table.ts`. Rubric: `templates/skillify-gate-rubric.md`.

---

## Invocation

The worker runs at SessionStart (and on demand). It pulls the last ~10 sessions from the
`sessions` table and strips each to prompt + assistant text - tool noise dropped.

---

## Step 1 - Build candidates

For each recent session the worker forms a candidate: a compact prompt+response pair plus
the set of already-known skills (so the gate can judge MERGE vs KEEP). Existing skills come
from `existing-skills.ts` / the `skills` Deep Lake table.

---

## Step 2 - Run the Haiku gate

`gate-runner.ts` sends each candidate to Haiku with the rubric. `gate-parser.ts` parses the
verdict. One of three:

| Verdict | Meaning | Action |
|---|---|---|
| KEEP | Novel, reusable, generalizes beyond this one task | new SKILL.md via `skill-writer.ts` |
| MERGE | Overlaps an existing skill; adds a wrinkle worth folding in | edit the matched skill |
| SKIP | One-off, trivial, or already fully covered | drop, no write |

---

## Step 3 - Worked verdicts

**Candidate A - "fixed daemon socket path on macOS by pointing at ~/.deeplake/embeddings.sock"**

```
KEEP
reason: reusable troubleshooting pattern for the embeddings daemon; no existing skill
        covers the socket-path failure mode; generalizes to any host with a moved home dir.
```
-> `skill-writer.ts` writes a new SKILL.md and a provenance row in the `skills` table.

**Candidate B - "raised HIVEMIND_SEMANTIC_EMBED_TIMEOUT_MS to 800 because cold model load timed out"**

```
MERGE -> "embeddings-daemon-tuning"
reason: an existing daemon-tuning skill already documents the timeout lever; this adds the
        cold-start rationale. Fold in as a note, don't spawn a near-duplicate.
```
-> edit the matched skill instead of creating a new one.

**Candidate C - "ran ls in the repo root"**

```
SKIP
reason: trivial, no reusable judgment, nothing to codify.
```
-> dropped.

---

## Step 4 - Provenance

Every KEEP/MERGE writes a row to the `skills` Deep Lake table: source session id, verdict,
scope. That row is what propagation (`pull.ts` / `auto-pull.ts`) reads at the next SessionStart
to spread the skill to other agents.

---

## Step 5 - Scope

Each written skill is tagged `me` or `team` (`scope-config.ts`). `me` stays local; `team`
becomes eligible for org publish (`skill-org-publish.ts`) and propagation to teammates.

---

## How to read a gate misfire

| Symptom | Likely cause |
|---|---|
| Everything SKIP'd | gate prompt too strict, or sessions stripped to nothing (all tool noise) |
| Near-duplicate skills piling up | gate not seeing existing skills -> MERGE never fires; check `existing-skills.ts` feed |
| Junk skills written | gate too loose; tighten the KEEP bar in `templates/skillify-gate-rubric.md` |

The gate is the quality bar for the whole Codify loop. A loose gate floods recall with noise;
a strict gate starves it. Calibrate against a labeled set the same way you'd calibrate any judge.
