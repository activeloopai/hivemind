---
name: hivemind-goals
description: Create, track and update team goals + KPIs via the Deeplake virtual filesystem at memory/goal/ and memory/kpi/. Use whenever the user mentions a goal, objective, KPI, target, milestone, or asks to track progress on something measurable. ALSO use when the user says "task", "todo", "work item", "remind me to", "fix X", or any actionable work item — the goal system replaced the legacy `hivemind tasks` CLI and now covers both objectives and tasks.
allowed-tools: Bash
---

# Hivemind Goals

Track goals and KPIs as Markdown files inside the Deeplake virtual filesystem. Each file is one row in a dedicated team-shared table — the path encodes the structural metadata, the file body holds the human-readable description.

## When to use this skill

Activate when the user expresses any of:
- "I want to track X / aim for X / track my progress on Y"
- "add a goal", "add a KPI", "what are my goals?"
- "mark this as done", "close that goal"
- "shipping X by Friday", "5 PRs this week", any measurable target
- "create a task", "add a todo", "remind me to fix X", any work item (the goals system absorbs the old `hivemind tasks` CLI — there is no separate task store)

For "list my goals" → run `ls ~/.deeplake/memory/goal/<userName>/opened/` and `ls ~/.deeplake/memory/goal/<userName>/in_progress/`. If empty, ask the user if they want to create one.

## Path conventions (LEARN THESE)

```
~/.deeplake/memory/goal/<owner>/<status>/<goal_id>.md
~/.deeplake/memory/kpi/<goal_id>/<kpi_id>.md
```

- `<owner>` — user identifier (use the userName from `hivemind whoami` or the credentials)
- `<status>` — one of `opened`, `in_progress`, `closed`
- `<goal_id>` — UUIDv4 you generate at create time
- `<kpi_id>` — short slug like `k-prs` or `k-demos`

**Path encoding is the source of truth.** The owner, status, goal_id, and kpi_id come from the path — NOT from the file body. Do NOT write owner/status/goal_id/kpi_id inside the file content.

## File body format

Goal file body — plain markdown, free form:
```
ship the goals-graph feature

Notes: focus on KPI tracking via VFS, no separate CLI.
Due: 2026-05-30.
```

KPI file body — markdown with a few mandatory key:value lines so the commit-driven auto-progress worker can parse and bump:
```
PRs merged

- target: 5
- current: 2
- unit: count
```

The `target:`, `current:`, `unit:` lines must stay on a single line each. The first line is the human-readable name. Anything else is free notes.

## Operations

### 1. Create a new goal

When the user expresses a new goal:

1. Get the current owner with `hivemind whoami` (use the userName, e.g. `emanuele.fenocchi`).
2. Generate a UUIDv4: `uuidgen` or `node -e 'console.log(crypto.randomUUID())'`.
3. Write the goal file at `~/.deeplake/memory/goal/<owner>/opened/<uuid>.md` with the goal description as body.
4. Respond to the user that the goal is created.

**Do NOT auto-generate KPIs.** A goal is created with zero KPI files by default. Generate KPIs ONLY when the user explicitly asks you to ("aggiungi KPI per …", "add metrics for this goal", "track these metrics: …"). When the user asks, write each KPI as a separate file at `~/.deeplake/memory/kpi/<goal_id>/<kpi-slug>.md` with the body format documented above.

### 1a. Capture a task for later (with resumable context)

Use this when the user **parks a tangential task** mid-session — "save this for later", "remind me to …", "don't let me forget …", "let's do X later". The value is NOT the one-liner — it's storing enough **context to resume cold** in a future session without the user re-explaining anything.

Write it via the **CLI** so the row is tagged `agent: capture`, which separates parked side-tasks from hand-made goals:

```bash
hivemind goal add --agent capture "Add rate-limiting to the webhook handler

Start here: add a per-IP token bucket on the handler entry path
Files: src/webhook/handler.ts:120-160, src/webhook/limits.ts
Branch: feat/webhook-hardening
Run: pnpm test webhook
Why: bursty clients hammer the endpoint; agreed to defer until the retry-backoff work lands"
```

- **Line 1 is the label** — short; it's what `goal list` and the SessionStart banner show.
- Fill `Start here / Files / Branch / Run / Why` from the live conversation. Include only the lines you can fill; `Start here:` (the concrete first action) matters most.
- Pass the whole package as **one double-quoted argument** (newlines are preserved into the stored body).
- Confirm to the user: the label + that it'll resume cleanly next session.

### 1b. Resume a parked task (automatic context transfer)

When the user says "let's work on that task / that goal", "let's start the `<X>` task", or "pick up the parked `<X>`", pull its stored context back into the session and continue — the user should NOT have to re-explain anything.

1. **Find it:** `hivemind goal list --mine` and match the user's reference to a `goal_id`. If ambiguous, show the candidates and ask.
2. **Transfer the context:** `hivemind goal get <goal_id>` prints the full package (`Start here / Files / Branch / Run / Why`). Read it as your working context — `goal list` only shows the first line, so always use `goal get` for the full body.
3. **Flip to in_progress:** `mv ~/.deeplake/memory/goal/<owner>/opened/<uuid>.md ~/.deeplake/memory/goal/<owner>/in_progress/<uuid>.md`
4. **Act on it:** open the `Files:`, switch to the `Branch:` if given, and begin from `Start here:`. You are resumed — continue as if the context was never lost.

### 2. List goals

```bash
ls ~/.deeplake/memory/goal/<owner>/opened/
ls ~/.deeplake/memory/goal/<owner>/in_progress/
```

Then `cat` each `<uuid>.md` to read the body. Optionally `ls ~/.deeplake/memory/kpi/<uuid>/` and `cat` each KPI to surface progress.

### 3. Edit a goal description

```bash
# Use Read + Edit (or Write) on the existing file. The VFS handles
# version-bumping — every write produces a fresh row in the
# hivemind_goals table.
```

### 4. Move a goal to in_progress

```bash
mv ~/.deeplake/memory/goal/<owner>/opened/<uuid>.md ~/.deeplake/memory/goal/<owner>/in_progress/<uuid>.md
```

`mv` between status folders is an atomic version-bump. The file body carries over unchanged.

### 5. Close a goal

Two equivalent ways:

```bash
# Explicit mv to closed (recommended — clearest intent)
mv ~/.deeplake/memory/goal/<owner>/in_progress/<uuid>.md ~/.deeplake/memory/goal/<owner>/closed/<uuid>.md

# Or: rm (the VFS interprets rm on a goal path as a soft-close)
rm ~/.deeplake/memory/goal/<owner>/opened/<uuid>.md
```

**Important:** `rm` does NOT actually delete the goal. It is a soft-close — the VFS writes a new version with status=closed. The goal remains in the team-shared table for audit. There is no hard-delete in v1.

### 6. Add a KPI manually

```bash
Write the file at ~/.deeplake/memory/kpi/<uuid>/<kpi-slug>.md with:
  <KPI name>

  - target: <N>
  - current: 0
  - unit: <unit>
```

### 7. Record progress on a KPI

Read the KPI file, increment the `current:` line, write it back:

```
<KPI name>

- target: 5
- current: 3       ← incremented from 2
- unit: count
```

Use the Edit tool for the most surgical change (just the line with `current:`).

### 8. Reassign a goal (transfer ownership)

```bash
mv ~/.deeplake/memory/goal/<old-owner>/<status>/<uuid>.md ~/.deeplake/memory/goal/<new-owner>/<status>/<uuid>.md
```

Goal ownership lives in the path. KPI files do NOT have an owner segment — they are linked to the goal by `<uuid>`, so they need no change when a goal is reassigned.

## Constraints — DO NOT do these

- Do NOT put `owner`, `status`, `goal_id`, or `kpi_id` inside the file body. The path is the source of truth — duplicating in the body causes drift.
- Do NOT use status values other than `opened`, `in_progress`, `closed`.
- Do NOT rename the goal_id (the UUID in the filename) via `mv`. The VFS rejects goal_id renames.
- Do NOT block on the KPI generator subprocess — always spawn it detached (`nohup … &`).

## Auto-progress from `git commit`

A PostToolUse hook listens for `git commit`. When it fires, it spawns the agent's native LLM in the background with the commit diff + the list of the current user's open goals. The LLM reads each goal + its KPIs, judges whether the commit advanced any KPI, and edits the relevant KPI file to bump `current:`. This is fire-and-forget; the user does not block on it.

To disable globally: `HIVEMIND_AUTO_KPI_FROM_COMMITS=false`.

## Team visibility

Every write goes to a team-shared table on Deeplake (`hivemind_goals` or `hivemind_kpis`). Other team members see your goals in their SessionStart context and via direct `ls` / `cat` on the same paths in their own VFS. No explicit sharing step needed.
