# PRD-005a: Skillify Path Bridge

> **Status:** Backlog
> **Priority:** P1
> **Effort:** L (1-3d)
> **Schema changes:** None
> **Parent:** [`prd-005-cursor-skillify-bridge-index`](./prd-005-cursor-skillify-bridge-index.md)

---

## Overview

This sub-feature is the keystone of PRD-005: it makes team skills actually reach the Cursor agent. Hivemind pulls every teammate's mined skills from the org `skills` table and writes a canonical `SKILL.md` per skill under `~/.claude/skills/<name>--<author>/` (global) or `<project>/.claude/skills/<name>--<author>/` (project), then fans each one out as a symlink into the skill directories of every other installed agent, Codex, Hermes, and pi (`src/skillify/pull.ts:579-585`, `src/skillify/agent-roots.ts:48-67`). Cursor is the one agent it deliberately skips, on an assumption the agent-roots module states in a comment: "Cursor has no native skill discovery (only hooks/rules), so it is not a candidate" (`src/skillify/agent-roots.ts:27-28`).

That assumption is now false. Cursor's active agent discovers skills in `.cursor/skills/` (per project) and `~/.cursor/skills-cursor/` (globally). Because Hivemind never writes to or links into those paths, a Cursor developer's agent silently lacks every team skill, even though the pull succeeded, the manifest recorded it, and the status bar is green. This sub-feature reverses the exclusion: it syncs pulled skills into Cursor's active directories so the Cursor agent discovers them immediately, reusing the exact fan-out, manifest, and auto-pull machinery that already serves the other agents rather than inventing a parallel writer.

The value is the difference between a shared brain that is configured and a shared brain that works. After this sub-feature, a skill a teammate mines is usable by a Cursor developer's agent on their next session, automatically, with no awareness that two different skill directories ever existed.

---

## Why this matters: the path gap we are closing

The pull write path ends by fanning the canonical skill out to every detected non-Claude agent root:

```216:251:src/skillify/pull.ts
export function fanOutSymlinks(
  canonicalDir: string,
  dirName: string,
  agentRoots: string[],
): string[] {
  const out: string[] = [];
  for (const root of agentRoots) {
    const link = join(root, dirName);
    let existing;
    try { existing = lstatSync(link); } catch { existing = null; }
    if (existing) {
      if (!existing.isSymbolicLink()) {
        // Real file/directory at the target — never clobber. Skip silently;
        // the user can resolve the conflict by removing it and re-running pull.
        continue;
      }
```

The set of roots it fans out to is computed by `detectAgentSkillsRoots`, which resolves Codex, Hermes, and pi, and explicitly omits Cursor:

```48:67:src/skillify/agent-roots.ts
function resolveDetected(home: string): string[] {
  const out: string[] = [];
  const codexInstalled = existsSync(join(home, ".codex"));
  const piInstalled = existsSync(join(home, ".pi", "agent"));
  const hermesInstalled = existsSync(join(home, ".hermes"));

  // agentskills.io shared root — codex creates it, pi co-consumes it.
  if (codexInstalled || piInstalled) {
    out.push(join(home, ".agents", "skills"));
  }
  // Hermes-specific root, agentskills.io-compatible layout.
  if (hermesInstalled) {
    out.push(join(home, ".hermes", "skills"));
  }
  // Pi's primary root (pi reads from this AND ~/.agents/skills/).
  if (piInstalled) {
    out.push(join(home, ".pi", "agent", "skills"));
  }
  return out;
}
```

So the canonical bytes exist under `.claude/skills/`, the symlinks exist under `.agents/`, `.hermes/`, and `.pi/`, and nothing exists under `.cursor/`. The Cursor agent, which only ever looks at `.cursor/skills/` and `~/.cursor/skills-cursor/`, finds nothing. This sub-feature adds Cursor as a sync destination so the same canonical skill the agent VFS, Codex, Hermes, and pi all read is also reachable by Cursor's loader.

---

## Goals

- Sync every pulled skill into Cursor's active skill directories: a global pull (`install === "global"`) reaches `~/.cursor/skills-cursor/`, and a project pull (`install === "project"`) reaches `<project>/.cursor/skills/`, so Cursor's agent discovers the same canonical skill the other agents already see.
- Reuse the existing fan-out machinery (`fanOutSymlinks`, the `lstat`-checked refusal posture, the manifest `symlinks[]` record) so Cursor sync is reversible by `unpull`, idempotent across runs, and never clobbers a real file at a target path (`src/skillify/pull.ts:216-251`, `src/skillify/manifest.ts:215-251`).
- Ride the existing SessionStart auto-pull (`src/skillify/auto-pull.ts:75-145`) so Cursor sync happens automatically on every session, bounded by the same timeout budget and with all failures swallowed; never introduce a new hot-path step that can block or break a Cursor session.
- Backfill Cursor links for skills already pulled before Cursor was installed or before this bridge shipped, using the same `backfillSymlinks` pass that already serves the late-installed-agent case (`src/skillify/pull.ts:282-307`).
- Produce a structured per-skill sync result the status bar (PRD-002c) and dashboard can read, so any skill that could not reach Cursor is surfaced rather than swallowed.
- Honor the global opt-out (`HIVEMIND_AUTOPULL_DISABLED=1`) and the project/global scoping that keeps a project pull from leaking into user-global agent directories (`src/skillify/pull.ts:581-585`).

## Non-Goals

- **Changing how skills are pulled or written.** The query, the version-decision, and the canonical `SKILL.md` write are unchanged (`src/skillify/pull.ts:456-578`). This sub-feature only adds Cursor to the set of destinations the existing fan-out serves.
- **Reworking the Codex / Hermes / pi fan-out.** Those roots are correct as-is (`src/skillify/agent-roots.ts:48-67`). Cursor is added alongside them; their behavior does not change.
- **Authoring or rendering the status indicator.** Presentation belongs to PRD-002c. This sub-feature produces a structured sync result; the status bar displays it.
- **Resolving sync conflicts by force.** When a real file or directory blocks a Cursor target, this sub-feature reports it; it never overwrites user content, matching the fan-out's existing refusal posture (`src/skillify/pull.ts:226-231`).
- **Project-root discovery inside the Webview.** Determining which folder a project-scoped Cursor sync should target inside a Cursor Webview is an open question routed to the parent index; this sub-feature defines the behavior given a known root.

---

## How Cursor joins the fan-out

The cleanest implementation extends the existing root detection so Cursor flows through `fanOutSymlinks`, the manifest, and `backfillSymlinks` automatically, exactly as the other agents do. Two roots are added, gated by install scope.

| Pull scope | Cursor destination | Why |
|---|---|---|
| `install === "global"` | `~/.cursor/skills-cursor/<name>--<author>/` | Cursor's global skill root; visible across all projects, matching how global pulls reach `~/.agents/skills/` today. |
| `install === "project"` | `<project>/.cursor/skills/<name>--<author>/` | Cursor's per-project skill root; lives with the repo, matching the project-scoping that keeps project pulls out of user-global agent dirs (`src/skillify/pull.ts:581-585`). |

Detection mirrors the marker-based approach `detectAgentSkillsRoots` already uses for the other agents: a Cursor install is recognized by a marker directory (for example `~/.cursor`), and the global Cursor root is added to the fan-out set whenever Cursor is detected. The project root is derived from the same `cwd` the project pull already uses (`src/skillify/pull.ts:190-194`). As with the other agents, `fanOutSymlinks` calls `mkdirSync(dirname(link), { recursive: true })` before each link, so a not-yet-created `skills-cursor/` directory is created on first sync (`src/skillify/pull.ts:242-244`).

The reuse boundary matters: by routing Cursor through the same `fanOutSymlinks` call and recording the resulting paths in the manifest's `symlinks[]` (`src/skillify/manifest.ts:43-54`), Cursor links are automatically reversed by `unpull` (`src/skillify/manifest.ts:215-222`), pruned when a canonical dir is removed (`src/skillify/manifest.ts:235-251`), and backfilled for already-pulled skills (`src/skillify/pull.ts:282-307`). No parallel bookkeeping is introduced.

---

## The sync segment owned here

```mermaid
sequenceDiagram
  participant Hook as SessionStart auto-pull
  participant Pull as "runPull (src/skillify/pull.ts)"
  participant Roots as "detectAgentSkillsRoots (+ Cursor)"
  participant FS as "~/.claude/skills (canonical)"
  participant Cur as "~/.cursor/skills-cursor + .cursor/skills"
  participant Man as "pulled.json manifest"

  Hook->>Pull: pull --all-users --to global (bounded, swallow-all)
  Pull->>FS: write canonical SKILL.md (write/skip by version)
  Pull->>Roots: resolve destinations (Codex, Hermes, pi, Cursor)
  Pull->>Cur: fanOutSymlinks (lstat-checked, never clobber)
  alt Cursor target free or already correct
    Cur-->>Pull: link path
    Pull->>Man: record symlinks[] (incl. Cursor)
  else Real file blocks the Cursor target
    Cur-->>Pull: refused (not in returned list)
    Pull->>Man: record without that path; result flags unsynced skill
  end
  Pull-->>Hook: PullSummary + per-skill sync result
```

The whole segment inherits the auto-pull contract: bounded by `DEFAULT_TIMEOUT_MS` (`src/skillify/auto-pull.ts:35,118-138`), idempotent because the symlink path is `lstat`-checked and `sameSorted`-skipped (`src/skillify/pull.ts:235-237,291`), and failure-swallowing because the whole loop is wrapped (`src/skillify/auto-pull.ts:141-144`).

---

## Honest reporting of unsynced skills

The fan-out's refusal posture is correct (never clobber user data), but today a refusal is silent: a skipped Cursor link just does not appear in the returned path list (`src/skillify/pull.ts:226-231,246-248`). For Cursor, silence reproduces the very problem PRD-005 exists to kill, the developer would again have a green status and a skill-less agent. So this sub-feature makes Cursor sync failures legible.

1. **Per-skill sync state.** The pull result carries, for each skill, whether its Cursor destination was reached, skipped (a real file blocks the path), or errored (permission, read-only filesystem, Windows non-developer-mode symlink restriction the fan-out already tolerates, `src/skillify/pull.ts:244-248`).
2. **Status-bar signal.** When one or more skills cannot reach Cursor, PRD-002c shows a non-green skill-sync state ("N team skills not reaching Cursor"), consistent with the index's honesty-over-optimism rule. A fully-synced state contributes to green.
3. **Actionable detail.** The dashboard can list the specific skills that did not sync and the reason (for a blocking file, name the conflicting path so the developer can remove it and re-sync), mirroring the fan-out comment's own guidance that the user resolves the conflict by removing the entry and re-running pull (`src/skillify/pull.ts:228-230`).
4. **Never a false green.** The status bar and dashboard never report Cursor skills as available when the sync was refused or errored.

---

## Presentation and behavior requirements

- **Invisible when it works.** The happy path requires no developer action and no UI: skills appear in Cursor's directories on session start. The bridge surfaces itself only when a skill cannot reach Cursor.
- **Idempotent and quiet on the hot path.** Re-running a sync when links already point correctly is a no-op with zero writes (`src/skillify/pull.ts:235-237`); the bridge adds no per-session log noise on success.
- **Reversible.** `unpull` removes Cursor links through the same manifest-driven unlink pass as the other agents (`src/skillify/manifest.ts:215-222`); no Cursor-specific teardown path is introduced.
- **Scope-respecting.** A project pull never leaks skills into the global Cursor root, and a global pull never writes into a project's `.cursor/skills/`, matching the existing project/global discipline (`src/skillify/pull.ts:581-585`).
- **No secret leakage.** The sync touches only skill content on local disk; no token or API key appears in the manifest, the sync result, or any log (defers to PRD-002b).

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a global pull and a detected Cursor install, when the bridge runs, then each pulled skill is linked into `~/.cursor/skills-cursor/<name>--<author>/` so Cursor's agent can discover it. |
| AC-2 | Given a project pull, when the bridge runs, then each pulled skill is linked into `<project>/.cursor/skills/<name>--<author>/`, and a project pull never writes into the global Cursor root. |
| AC-3 | Given the bridge rides the SessionStart auto-pull, when a session starts, then Cursor sync happens automatically within the existing timeout budget and any failure is swallowed so the session never blocks or breaks. |
| AC-4 | Given a skill was pulled before Cursor was installed, when a later pull's backfill runs, then the missing Cursor link is created without requiring the source row's version to bump. |
| AC-5 | Given a real (non-symlink) file or directory occupies a Cursor target path, when the bridge runs, then it does not overwrite it, and the affected skill is reported as not reaching Cursor with the conflicting path named. |
| AC-6 | Given a Cursor link already points at the correct canonical directory, when the bridge runs again, then no write occurs (idempotent, fingerprint-preserving). |
| AC-7 | Given one or more skills cannot reach Cursor, when the health/sync state is computed, then the PRD-002c status bar reflects a non-green skill-sync state rather than a false green. |
| AC-8 | Given `unpull` is run, when it removes a pulled skill, then its Cursor link is removed through the same manifest-driven unlink pass as the Codex/Hermes/pi links. |
| AC-9 | Given `HIVEMIND_AUTOPULL_DISABLED=1`, when a session starts, then neither the pull nor the Cursor sync runs. |
| AC-10 | Given the manifest, sync result, or any log is inspected, when its contents are examined, then no token or API key value appears. |

---

## Open questions

- [ ] Symlink versus copy into Cursor's directories: does Cursor's skill loader follow symlinked skill directories reliably across platforms, or should the Cursor destination be a file copy (losing the single-source-of-truth symlink guarantee but avoiding the Windows non-developer-mode symlink restriction the fan-out tolerates, `src/skillify/pull.ts:244-248`)?
- [ ] Is the global root `~/.cursor/skills-cursor/` and the project root `<project>/.cursor/skills/` correct for the target Cursor version, and what marker directory most reliably detects a Cursor install for `detectAgentSkillsRoots` (`src/skillify/agent-roots.ts:48-67`)?
- [ ] Should Cursor be added directly to `detectAgentSkillsRoots` (so it flows through `fanOutSymlinks`, the manifest, and `backfillSymlinks` with no other code change) or kept as a dedicated bridge step, given the module's explicit comment documenting the deliberate Cursor exclusion that must now be reversed (`src/skillify/agent-roots.ts:27-28`)?
- [ ] For project-scoped Cursor sync inside a Webview, should the target be the workspace folder Cursor currently has open rather than `process.cwd()`, and how is that folder resolved from the extension host?
- [ ] Should a Cursor reload be prompted after the first sync for the agent to pick up newly linked skills, or does Cursor's loader scan the directory per session without a reload (mirroring the reload-awareness requirement in PRD-002a, `prd-002a-health-check.md`)?

---

## Related

- [`prd-005-cursor-skillify-bridge-index`](./prd-005-cursor-skillify-bridge-index.md): parent module.
- [`prd-005c-skill-promoter`](./prd-005c-skill-promoter.md): once a skill is promoted to the team, this bridge is what makes it reach the promoter's own Cursor agent on the next pull.
- [`../prd-002-cursor-extension-core/prd-002a-health-check.md`](../prd-002-cursor-extension-core/prd-002a-health-check.md): the health check whose four dimensions the skill-sync state extends, and whose hook-wiring reload pattern this bridge mirrors.
- [`../prd-002-cursor-extension-core/prd-002c-status-bar.md`](../prd-002-cursor-extension-core/prd-002c-status-bar.md): consumes this sub-feature's structured sync result.
- [`../prd-003-cursor-extension-dashboard/prd-003b-settings-manager.md`](../prd-003-cursor-extension-dashboard/prd-003b-settings-manager.md): the settings surface where a manual "sync skills to Cursor" action and a sync toggle live, following its canonical-config and re-health pattern.
- Source grounding: `src/skillify/pull.ts:190-307,456-641` (pull, fan-out, backfill, project/global scoping), `src/skillify/agent-roots.ts:27-84` (the deliberate Cursor exclusion this reverses and the marker-detection pattern to extend), `src/skillify/auto-pull.ts:35,75-145` (the SessionStart auto-pull this rides, its timeout and swallow-all contract), `src/skillify/manifest.ts:26-251` (`PulledEntry.symlinks`, `recordPull`, `unlinkSymlinks`, `pruneOrphanedEntries`), `src/cli/skillify-spec.ts:45-49` (the `pull --to project|global` surface this honors).
