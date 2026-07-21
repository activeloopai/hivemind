# PRD-005c: Interactive Skill Promoter

> **Status:** Backlog
> **Priority:** P2
> **Effort:** L (1-3d)
> **Schema changes:** None
> **Parent:** [`prd-005-cursor-skillify-bridge-index`](./prd-005-cursor-skillify-bridge-index.md)

---

## Overview

This sub-feature shows a developer the skills they have mined locally and lets them share a chosen one with the team in a single click. Hivemind mines reusable skills from real sessions, but a newly mined skill defaults to `me` scope and the `project` install location (`src/skillify/scope-config.ts:44`), so it lives only on the machine that mined it and in the repo it was mined from. Sharing it with the team is a multi-step CLI affair: the only signal the skill even exists is a count-only SessionStart banner ("N local skills ... Run `hivemind login` to start sharing," `src/skillify/local-mined-banner.ts:32-40`), and acting on it means knowing the combination of `hivemind skillify promote <name>`, `scope team`, and `install global` (`src/cli/skillify-spec.ts:53-56`).

This sub-feature renders the developer's locally mined skills as a list in the PRD-003 dashboard Webview, drawn from the same skillify state the CLI reports (`src/commands/skillify.ts:45-96`), and exposes promotion as a button. Promotion is honest about being a two-step reality: `hivemind skillify promote` moves a skill from the project location to the global location on the local filesystem so it is visible across all the developer's projects and agents (`src/commands/skillify.ts:122-137`), and reaching teammates additionally requires the skill to be shared at `team` scope on the org `skills` table so it lands in everyone's auto-pull (`src/skillify/scope-promotion.ts:34-41`, `src/skillify/skill-org-publish.ts:108-142`). The promoter drives both and tells the developer plainly what each step does.

The value is that good local skills stop dying on the machine that mined them. The path from "I mined something useful" to "my team has it" becomes visible and one click long, and (closing the loop with PRD-005a) once shared, the skill flows back into the promoter's own Cursor agent on the next pull.

---

## Why this matters: skills that never leave the laptop

A mined skill defaults to the narrowest, most local scope:

```44:44:src/skillify/scope-config.ts
const DEFAULT: ScopeConfig = { scope: "me", team: [], install: "project" };
```

The only nudge a developer gets that they even have shareable skills is a static, count-only banner with no names and no action beyond "log in":

```32:40:src/skillify/local-mined-banner.ts
export function renderLocalMinedNote(input: LocalMinedBannerInput): string {
  const { totalCount } = input;
  if (totalCount <= 0) return "";
  const plural = totalCount === 1 ? "" : "s";
  return (
    `\n\n${totalCount} local skill${plural} from past 'hivemind skillify mine-local' run(s) live in ~/.claude/skills/. ` +
    `Run 'hivemind login' to start sharing new mining results with your team.`
  );
}
```

And `promote` itself only moves a skill project-to-global on disk; it refuses to overwrite and does not, by itself, publish to the org table:

```122:137:src/commands/skillify.ts
function promoteSkill(name: string, cwd: string): void {
  if (!name) { console.error("Usage: hivemind skillify promote <skill-name>"); process.exit(1); }
  const projectPath = join(cwd, ".claude", "skills", name);
  const globalPath = join(homedir(), ".claude", "skills", name);
  if (!existsSync(join(projectPath, "SKILL.md"))) {
    console.error(`Skill '${name}' not found at ${projectPath}/SKILL.md`);
    process.exit(1);
  }
  if (existsSync(join(globalPath, "SKILL.md"))) {
    console.error(`Skill '${name}' already exists at ${globalPath}/SKILL.md — refusing to overwrite. Remove it first or rename the project skill.`);
    process.exit(1);
  }
  mkdirSync(dirname(globalPath), { recursive: true });
  renameSync(projectPath, globalPath);
  console.log(`Promoted '${name}' from ${projectPath} → ${globalPath}.`);
}
```

So today a developer would have to know that mining wrote at `me`/`project` scope, that the banner's count maps to specific skills, that `promote` only moves on disk, and that reaching the team additionally needs `team` scope on the org table. This sub-feature collapses all of that into a visible list and an honest one-click action.

---

## Goals

- Render the developer's locally mined skills as a list in the PRD-003 dashboard Webview, drawn from the same skillify per-project state the CLI reports (`skillsGenerated[]` and the scope/install config, `src/commands/skillify.ts:45-96`, `src/skillify/scope-config.ts:46-68`).
- Distinguish, per skill, whether it is still local-only (`me` scope and/or project install) or already shared with the team, so the developer knows which skills the team can already pull and which are stuck.
- Promote a chosen skill with one click, driving the existing machinery: move project-to-global on the filesystem via the `promote` path (`src/commands/skillify.ts:122-137`) and share it at `team` scope on the org table so teammates pull it on their next auto-pull (`src/skillify/scope-promotion.ts:34-41`, `src/skillify/skill-org-publish.ts:108-142`).
- Be honest about the two steps: the pane communicates that promotion makes the skill visible across the developer's own projects/agents and shares it with the team, and reflects the resulting state rather than implying a single atomic operation.
- Close the loop with PRD-005a: once a skill is shared, it flows through auto-pull back into the developer's own Cursor agent (and every teammate's), so the promoter's reach is consistent with the rest of the bridge.
- Reuse `promote`'s refusal posture: a name collision at the global location is surfaced, never resolved by overwrite (`src/commands/skillify.ts:130-133`).

## Non-Goals

- **Mining skills.** The local miner (`src/commands/mine-local.ts`) and the skillify worker (`src/skillify/skillify-worker.ts`) are upstream and unchanged. This sub-feature surfaces and promotes what mining produced; it does not mine.
- **Editing skill content.** Changing a SKILL.md body before promotion is out of scope; the promoter promotes the skill as mined.
- **Designing the scope or publish model.** Scope stays `me | team`, install stays `project | global` (`src/skillify/scope-config.ts:23-35`), and republishing to the org table follows the existing cross-author/scope-promotion rules (`src/skillify/scope-promotion.ts`, `src/skillify/skill-org-publish.ts`). This sub-feature drives that machinery; it does not redesign it.
- **Unpromoting / unsharing.** Reversing a promotion (removing a skill from the org table or moving it back to project) is out of scope; promotion is treated as forward-only here.
- **Authoring the Webview shell.** The shell, theming, and refresh lifecycle are PRD-003a's; this pane lives inside that shell.

---

## The local-skills list and the promote action

The pane lists locally mined skills and offers a single promote action per skill. Each piece maps to existing state or an existing command path.

| UI element | Reads / writes | Existing artifact | Notes |
|---|---|---|---|
| Local skills list | Reads | Skillify per-project state (`skillsGenerated[]`), scope/install config | The same data `hivemind skillify` status prints (`src/commands/skillify.ts:74-95`); replaces the count-only banner (`src/skillify/local-mined-banner.ts:32-40`) with named, actionable rows. |
| Shared-or-local badge | Reads | `scope` (`me` vs `team`) and `install` (`project` vs `global`) | Tells the developer which skills the team can already pull and which are stuck local-only (`src/skillify/scope-config.ts:26-35`). |
| Promote (step 1) | Writes | `promoteSkill` (project to global on disk) | Makes the skill visible across all the developer's projects and agents; refuses to overwrite an existing global skill of the same name (`src/commands/skillify.ts:122-137`). |
| Promote (step 2) | Writes | Scope promotion to `team` + republish to the org `skills` table | Lands the skill on the org table at `team` scope so teammates pull it next session (`src/skillify/scope-promotion.ts:34-41`, `src/skillify/skill-org-publish.ts:108-142`). |
| Result reflection | Reads | Refreshed skillify state | The row updates to "shared with team," and (via PRD-005a) the skill is now in the developer's own Cursor agent on next pull. |

The honesty discipline: the pane never presents step 1 alone as "shared with the team." A skill promoted only project-to-global is visible to the developer's other projects and agents but is not yet on the org table; the pane labels that state accurately and offers the team-share step.

---

## The promotion flow

```mermaid
flowchart TD
  open["Developer opens Skill Promoter pane"] --> list["List locally mined skills<br/>(skillify state)"]
  list --> badge{"Skill state?"}
  badge -->|"me / project (local-only)"| stuck["Badge: 'on this machine only'"]
  badge -->|"team / global (shared)"| shared["Badge: 'team can pull this'"]
  stuck --> click["Developer clicks Promote"]
  click --> step1["Step 1: project -> global on disk<br/>(promoteSkill)"]
  step1 --> collide{"Global name collision?"}
  collide -->|"Yes"| refuse["Surface refusal, do not overwrite"]
  collide -->|"No"| step2["Step 2: scope -> team, republish to org table"]
  step2 --> pull["Teammates + this dev auto-pull it next session<br/>(PRD-005a syncs it into Cursor)"]
  pull --> reflect["Pane reflects: 'shared with team'"]
```

---

## Honest two-step communication

Because `promote` and team-sharing are genuinely two operations on two different stores (local filesystem versus the org `skills` table), the pane must not paper over the seam:

1. **Name the effect of each step.** Step 1 is described as "make available across your projects and agents"; step 2 as "share with your team so they can pull it." A developer who only wants local-global promotion can stop after step 1; a developer who wants the team to have it does both.
2. **Reflect the true post-state.** After a one-click promote the pane shows the skill's actual resulting state (shared with team, or global-only if step 2 was skipped or failed), never an optimistic "done" that overstates reach.
3. **Surface refusals, not silence.** A global name collision is reported with the same guidance the command gives ("already exists ... remove it first or rename the project skill," `src/commands/skillify.ts:131`); a failed org-table publish leaves the local promotion intact and reports that team-sharing did not complete.
4. **Close the loop visibly.** Once shared, the pane notes that the skill will reach the developer's own Cursor agent (and teammates') via auto-pull and the PRD-005a path bridge, so the developer sees the full circle rather than wondering whether sharing "took."

---

## Presentation requirements

- **Named and actionable, not a count.** The pane replaces the static count-only banner (`src/skillify/local-mined-banner.ts:32-40`) with named skill rows the developer can act on.
- **Native-feeling.** Respects Cursor's theme and editor tokens; reads as a first-party surface, consistent with PRD-003a.
- **Truthful state badges.** Every row's local-only versus shared state is shown and is derived from real scope/install state, never assumed.
- **In-flight and error states.** A promote shows progress and reconciles against refreshed skillify state on completion; failures surface the underlying message and leave the skill in its prior state.
- **Not-logged-in honesty.** Sharing to the org table requires login; if the developer is not logged in, the pane offers the same path PRD-002b owns rather than failing silently, mirroring the banner's own "run `hivemind login`" intent (`src/skillify/local-mined-banner.ts:38-39`).
- **No secret leakage.** The pane payload and logs show skill names, scope, and install state only, never tokens or API keys (defers to PRD-002b).

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a developer who has mined skills locally, when the Skill Promoter pane opens, then their mined skills render as named rows drawn from the same skillify state the CLI reports, not a bare count. |
| AC-2 | Given a listed skill, when the pane renders it, then a badge shows whether it is local-only (`me` / project) or already shared with the team (`team` / global), derived from real scope/install state. |
| AC-3 | Given a local-only skill, when the developer clicks Promote, then the skill is moved project-to-global on disk via the existing `promote` path and shared at `team` scope on the org table so teammates pull it next session. |
| AC-4 | Given a global skill of the same name already exists, when the developer promotes, then the pane surfaces the refusal and does not overwrite, matching the command's posture. |
| AC-5 | Given a one-click promote, when it completes, then the pane reflects the skill's true resulting state (shared with team, or global-only if the team step was skipped or failed) and never overstates reach. |
| AC-6 | Given a skill has been shared with the team, when the next auto-pull runs, then it flows back into the developer's own Cursor agent via the PRD-005a path bridge, and the pane communicates that loop. |
| AC-7 | Given the developer is not logged in, when they attempt to share a skill with the team, then the pane offers the login path rather than failing silently. |
| AC-8 | Given no locally mined skills exist, when the pane renders, then it shows a coherent empty state with guidance, not a blank or broken pane. |
| AC-9 | Given the pane payload or logs are inspected, when their contents are examined, then no token or API key value appears. |

---

## Open questions

- [ ] Should one-click Promote always do both steps (project-to-global and team-share), or offer them as two explicit actions, given they touch different stores and a developer may want only local-global promotion (`src/commands/skillify.ts:122-137` versus `src/skillify/skill-org-publish.ts:108-142`)?
- [ ] What is the authoritative source for "is this skill already shared with the team", the local `scope` config (`src/skillify/scope-config.ts`), the presence of a matching row on the org `skills` table, or both, and how does the pane reconcile a disagreement?
- [ ] Should the list include skills mined into the project location of the currently-open Cursor workspace specifically, or all locally mined skills across projects, given the CLI status enumerates per-project state (`src/commands/skillify.ts:74-95`)?
- [ ] For team-sharing, should the promoter set the persistent `scope team` config (affecting all future mining) or share only the selected skill at team scope without changing the global default (`src/skillify/scope-config.ts:70-74`)?
- [ ] How should the pane handle a skill whose team-share republish needs the cross-author scope-promotion path (a skill a teammate also contributed to), so provenance is preserved per the existing rules (`src/skillify/scope-promotion.ts:22-41`, `src/skillify/skill-org-publish.ts:108-119`)?

---

## Related

- [`prd-005-cursor-skillify-bridge-index`](./prd-005-cursor-skillify-bridge-index.md): parent module.
- [`prd-005a-skillify-bridge`](./prd-005a-skillify-bridge.md): the path bridge that, once a skill is shared, syncs it into the promoter's own (and teammates') Cursor agent on the next pull.
- [`prd-005b-rules-manager`](./prd-005b-rules-manager.md): the sibling write surface in the same "Team" area of the dashboard.
- [`../prd-003-cursor-extension-dashboard/prd-003a-kpi-webview.md`](../prd-003-cursor-extension-dashboard/prd-003a-kpi-webview.md): the Webview shell this pane lives in, and the "skills created" KPI it complements.
- [`../prd-002-cursor-extension-core/prd-002b-auth-secrets.md`](../prd-002-cursor-extension-core/prd-002b-auth-secrets.md): owns the login state team-sharing depends on.
- Source grounding: `src/commands/skillify.ts:45-137` (status state the list reads, `promoteSkill` project-to-global move and its refusal posture), `src/skillify/scope-config.ts:23-74` (`me | team` scope, `project | global` install, defaults), `src/skillify/scope-promotion.ts:22-41` (the `me` to `team` promotion rule), `src/skillify/skill-org-publish.ts:108-142` (republish to the org table at `team` scope), `src/skillify/local-mined-banner.ts:32-40` (the count-only signal this pane replaces with named rows), `src/cli/skillify-spec.ts:53-56` (the `scope` / `install` / `promote` CLI surface this pane drives).
