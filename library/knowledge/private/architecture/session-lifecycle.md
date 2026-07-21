# Session Lifecycle

> Category: Architecture | Version: 1.0 | Date: June 2026 | Status: Active

The end-to-end flow of a single coding-agent session in Hivemind: from SessionStart through per-turn capture to the background summary spawned at SessionEnd, with the exact hooks that fire at each step.

**Related:**
- [`system-overview.md`](system-overview.md)
- [`../overview.md`](../overview.md)
- [`../ai/session-capture.md`](../ai/session-capture.md)
- [`../data/memory-virtual-filesystem.md`](../data/memory-virtual-filesystem.md)
- [`../ai/wiki-summary-workers.md`](../ai/wiki-summary-workers.md)
- [`../../../../docs/CAPTURE_TASKS.md`](../../../../docs/CAPTURE_TASKS.md)
- [`../../../../docs/ARCHITECTURE.md`](../../../../docs/ARCHITECTURE.md)

---

## Why the lifecycle is hook-driven

Hivemind never runs as a daemon inside the user's session. It only ever executes as short-lived hook processes that the host assistant invokes on its own lifecycle events. That constraint shapes everything: each hook must finish fast, must fail soft (a crash exits 0 so it never breaks the user's session), and must push any heavy work to a detached background worker. The Claude Code hooks under `src/hooks/` are the reference implementation; the per-agent variants in `src/hooks/{codex,cursor,hermes,pi}/` map their assistant's event names onto the same handlers.

A session has three phases. SessionStart authenticates and injects recall context. Each turn captures one or more events into the `sessions` table and may trigger a mid-session checkpoint. SessionEnd marks the session done and spawns the summary worker.

---

## Full session sequence

```mermaid
sequenceDiagram
    participant Agent as Host assistant
    participant Start as session-start.ts
    participant Pre as pre-tool-use.ts
    participant Cap as capture.ts
    participant End as session-end.ts
    participant Worker as wiki-worker.ts
    participant DL as Deeplake

    Agent->>Start: SessionStart
    Start->>Start: loadCredentials (device-flow login if missing)
    Start->>DL: ensureTable + ensureSessionsTable
    Start->>DL: createPlaceholder summary row
    Start->>DL: autoPullSkills + renderContextBlock (rules/goals)
    Start-->>Agent: additionalContext (memory instructions + rules + graph line)

    Agent->>Cap: UserPromptSubmit
    Cap->>DL: INSERT user_message row

    Agent->>Pre: PreToolUse (Bash/Read/Grep/Glob on memory path)
    Pre->>DL: route command to SQL query
    Pre-->>Agent: rewritten command emitting recall results

    Agent->>Cap: PostToolUse
    Cap->>DL: INSERT tool_call row
    Cap->>Cap: bumpTotalCount; maybe spawn periodic worker

    Agent->>Cap: Stop
    Cap->>DL: INSERT assistant_message row
    Cap->>Cap: tryStopCounterTrigger (skillify)

    Agent->>End: SessionEnd
    End->>End: markSessionEnded + recordSessionUsage
    End->>End: forceSessionEndTrigger (skillify)
    End->>Worker: spawn detached wiki worker
    End-->>Agent: returns immediately
    Worker->>DL: read session events
    Worker->>Worker: run host CLI (claude -p / codex exec)
    Worker->>DL: UPDATE summary row in memory table
```

---

## SessionStart: authenticate and inject recall

The SessionStart hook (`src/hooks/session-start.ts`) does the setup work that makes recall possible for the rest of the session. It runs in roughly this order.

First it re-activates the session: `clearSessionEnded`, `recordSessionOwner`, and `touchSessionActivity` (from `src/hooks/summary-state.ts`) mark the session live so other sessions' resume logic does not treat it as stale.

Next it resolves credentials with `loadCredentials`. If there is no token, the session continues read-only and, on an unauthenticated box that has Claude Code transcripts but no mining manifest, it spawns a background `hivemind skillify mine-local` worker so the next SessionStart can surface a sign-in call to action. If a token exists, it self-heals any drifted org binding with `healDriftedOrgToken` and backfills a missing `userName`.

It then runs `autoUpdate` before any database calls (so the upgrade notice appears even when the backend is slow), resolves the installed plugin version once for stamping on every row, and, when capture is enabled, ensures the `memory` and `sessions` tables exist and writes a placeholder summary row via direct SQL (`createPlaceholder`). Capture is gated by `HIVEMIND_CAPTURE !== "false"` and the only-CLI entrypoint check (`entrypointPassesOnlyCliGate`); under `HIVEMIND_CAPTURE=false` the hook runs fully read-only, skipping all DDL and INSERTs.

Finally it composes the `additionalContext` payload returned to the agent. That payload is the memory-usage instructions (which describe the three VFS tiers: `index.md`, `summaries/`, and raw `sessions/`), an optional rules and goals block rendered by `renderContextBlock`, a locally-mined-skills note, and a one-line codebase-graph context line. It also fires a detached graph-pull worker whose results land for the next SessionStart, not the current one.

---

## Per-turn capture

Three event types feed the `sessions` table, all handled by `src/hooks/capture.ts`. The hook writes exactly one row per event with a single INSERT, so concurrent events never race on a shared row.

A UserPromptSubmit event carries a `prompt` and is written as a `user_message` row. A PostToolUse event carries `tool_name`, `tool_input`, and `tool_response` and is written as a `tool_call` row. A Stop or SubagentStop event carries `last_assistant_message` and is written as an `assistant_message` row. Each row records session metadata (session id, cwd, permission mode, hook event name, agent id) and, unless embeddings are disabled, a `message_embedding` vector produced by the local embed daemon. If the INSERT fails because the table is missing (the session-start ensure failed, or the org switched mid-session), the hook creates the table and retries once.

Capture is guarded the same way as SessionStart: it returns immediately if `HIVEMIND_CAPTURE=false`, if the plugin is disabled, or if the only-CLI entrypoint gate fails. On any fatal error it exits 0 and surfaces nothing into the agent's prompt, because writing user-facing text into `additionalContext` would be a prompt-injection pattern; user-facing notices go through the SessionStart banner channel instead.

---

## Recall through the virtual filesystem

When the agent reads memory, it issues ordinary shell or Read-tool commands against `~/.deeplake/memory/`. The PreToolUse hook (`src/hooks/pre-tool-use.ts`) intercepts Bash, Read, Grep, and Glob whose paths touch that mount and rewrites them into SQL-backed responses. `cat` becomes a direct row read, `grep` becomes a hybrid lexical-plus-semantic search through `handleGrepDirect`, `ls` becomes a path-prefix listing, and `find` becomes a path-pattern query. The rewritten command emits the fetched content with a safe `printf`, so from the agent's perspective it ran a normal command and got file output back.

The same hook enforces the memory mount's safety contract. Write and Edit on a memory path are denied with guidance to use Bash instead, because the hook can only mutate `tool_input`, not the tool itself. Unsupported commands (interpreters, pipes the VFS cannot model, command substitution) are never handed to the host shell; they are rewritten to a harmless `echo` carrying retry guidance, so a command like `python3 ~/.deeplake/memory/../../etc/passwd` can never reach the real filesystem. PreToolUse also arms the skill-optimization counter when the agent invokes an org skill.

---

## Mid-session checkpoints

Long sessions do not wait for SessionEnd to be summarized. After writing each event, `capture.ts` calls `maybeTriggerPeriodicSummary`, which bumps a per-session event counter (`bumpTotalCount`) and checks the configured threshold (`HIVEMIND_SKILLIFY_EVERY_N_TURNS` and the time-based interval). When the threshold is crossed and the per-session lock is free (`tryAcquireLock`), it spawns a detached wiki worker with reason `Periodic`. The lock ensures only one summary worker runs per session at a time, because two workers writing the same summary row trip the Deeplake UPDATE-coalescing quirk and drop a write.

On a Stop event, `capture.ts` additionally calls `tryStopCounterTrigger` from `src/skillify/triggers.ts`, which advances the skill-mining counter and may fire the skillify miner independently of the summary worker.

---

## SessionEnd: mark done and spawn the summary

The SessionEnd hook (`src/hooks/session-end.ts`) exits fast and pushes all heavy work to a detached process. It first calls `markSessionEnded` so other sessions stop treating this one as live, then `recordSessionUsage`, which parses the transcript for memory-search activity and appends one record to `~/.deeplake/usage-stats.jsonl` for the savings recap. This runs independently of the summary lock, so even sessions that cannot summarize still feed the recap.

It then calls `forceSessionEndTrigger` to run skill mining (skillify has its own per-project lock, so it fires regardless of the summary lock), acquires the per-session summary lock, and spawns the wiki worker with reason `SessionEnd`. If the spawn throws before the worker takes ownership, the hook releases the lock so a `--resume` can retrigger summaries without waiting for the stale-lock reclaim.

---

## The background summary worker

The wiki worker is spawned detached by `src/hooks/spawn-wiki-worker.ts`, which writes a temp config file (API credentials, table names, session id, project, the host CLI binary, and the summary prompt template) and launches `wiki-worker.js`. The worker reads the session's events from the `sessions` table and shells out to the host agent's own CLI (`claude -p`, `codex exec`, `pi --print`) to generate a structured wiki entry, using the host CLI so no separate API key is required. The prompt template (`WIKI_PROMPT_TEMPLATE`) instructs the model to extract entities, decisions, files modified, open questions, and a single concrete "Next Steps" line, and to keep the body under 4000 characters with no absolute filesystem paths. Resumed sessions pass a JSONL offset so the worker merges new content into the existing summary rather than regenerating it. The finished summary is written back to the `memory` table alongside its 768-dimension embedding.

---

## Explicit save and resume

Beyond automatic capture, Hivemind supports an explicit save-and-resume pair documented in `docs/CAPTURE_TASKS.md`. When a user parks a side task mid-session ("save this for later"), the agent, which already holds the live context, writes a goal row whose body is a resumable context package via `hivemind goal add --agent capture`. The `agent: "capture"` provenance keeps parked tasks separable from hand-made goals. When the user later says "let's work on that task," the agent finds the goal, pulls the full body with `hivemind goal get <goal_id>`, flips it to `in_progress`, and continues from the stored "Start here" line with no re-explaining. The v1 design is deliberately explicit and in-session; the auto-detection pipeline (a Stop-hook LLM gate that proposes captures) is preserved as a later phase.

For where these rows live and how the tables are shaped, see [`system-overview.md`](system-overview.md).
