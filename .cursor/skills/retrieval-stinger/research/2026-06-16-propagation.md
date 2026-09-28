# Propagation - pull / auto-pull at SessionStart

**Source:** `src/skillify/pull.ts`, `auto-pull.ts`, `autopull-worker.ts`, `scope-config.ts`, `scope-promotion.ts`, `skill-org-publish.ts`.
**Retrieved:** 2026-06-16
**Status:** INFORMATIONAL. Context for how codified skills spread.

---

## TL;DR

Skills written by the gate propagate to other agents via a pull at SessionStart
(`auto-pull.ts`). Scope (`me` | `team`) controls reach: `me` stays local, `team` is eligible
for org publish and propagation to teammates.

---

## Key facts

- `auto-pull.ts` / `autopull-worker.ts` run a pull at SessionStart, fetching `team`-scoped skills
  the agent doesn't have yet.
- Scope is set at write time (`scope-config.ts`). `scope-promotion.ts` can promote a `me` skill to
  `team` after it proves out.
- `skill-org-publish.ts` handles pushing `team` skills to the org-wide store.
- Provenance rows in the `skills` Deep Lake table are the unit of propagation - pull reads them.

---

## How it ties to recall

- Propagation is what makes Hivemind a SHARED memory: a skill codified by one agent becomes
  recallable by another after the next pull. Recall on agent B can surface a skill agent A wrote.

---

## Implications for the guides

- The loop is Capture -> Codify -> Search (recall) -> Propagate. The guide should present
  propagation as the step that closes the loop across agents, not a side feature.
- SessionStart cadence means a skill codified mid-session by a parallel agent isn't visible to peers
  until their next session start.

---

## Caveats

- Conflict resolution on concurrent edits to the same `team` skill is last-write, not merge
  (`gaps.md` item 8). Fine at current scale.
- `me`-scoped skills never propagate; if a useful local skill should spread, it must be promoted.
