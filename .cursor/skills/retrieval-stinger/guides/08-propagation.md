# 08 - Propagation

The Propagate stage of the loop: mined skills fan out to teammates so the whole team inherits what any one agent learned. It lives in `src/skillify/pull.ts` and `src/skillify/auto-pull.ts`.

---

## The mechanism

`auto-pull.ts` wires a pull of skills from the org's `skills` Deep Lake table into every agent's SessionStart hook. From the file header: without auto-pull, every user would have to remember to run `hivemind skillify pull --all-users --to global` themselves; auto-pull makes freshly-mined skills available without anyone thinking about it.

- **`pull.ts`** - the pull primitive: read the `skills` table, select in-scope skills, write them locally.
- **`auto-pull.ts`** - runs `runPull` on every SessionStart. No throttling; the file writes inside `runPull` are the work.

So the moment a teammate's session mines a KEEP/MERGE skill (`07-skillify-codify.md`) and writes its provenance row, the next SessionStart for anyone in scope pulls it down.

---

## Scope governs the fan-out

Propagation MUST respect the resolved scope (`scope-config.ts`, `11-scope-and-privacy.md`):

- **`me`** - the skill stays with its author. It must NOT be fanned to teammates. Doing so is a privacy finding (security-worker-bee).
- **`team`** - the skill fans to the listed team members.
- (`org` is legacy, coerced to `team` on read.)

The pull reads the author/scope metadata on each `skills` row to decide what a given user is allowed to receive. A pull that ignores scope and fans everything is a must-fix.

---

## Idempotency

Auto-pull runs on every SessionStart with no throttle, so `runPull` must be idempotent:

- Pulling the same skill version twice should be a no-op, not a duplicate on disk.
- A new version should replace the old, not stack alongside it.
- Re-fanning the same version repeatedly (because the pull does not track what is already local) is wasted I/O and a should-refactor.

The `manifest.ts` / `local-manifest.ts` catalog is how a pull knows what it already has.

---

## Install target

`scope-config.ts` carries an `install` field (default `"project"`). Pulled skills land in the configured install location (project vs global). A pull that writes to the wrong target makes mined skills invisible to the agent that needs them.

---

## What to check on a propagation-fix

1. **Did SessionStart actually run the pull?** Confirm `auto-pull` is wired into the hook for the agent in question.
2. **Scope respected?** A `me` skill reaching a teammate is the headline failure.
3. **Idempotent?** Re-running a session should not duplicate or re-fan unchanged skills.
4. **Right install target?** Project vs global mismatch.
5. **Provenance present upstream?** A skill with no `skills` row cannot be pulled correctly - the failure may actually be a missing provenance row at codify time (`07-skillify-codify.md`).
6. **Version bump honored?** A newer version should supersede, not coexist.
