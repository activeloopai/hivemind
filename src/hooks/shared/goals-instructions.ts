/**
 * Inline goal instructions appended to every agent's
 * SessionStart context.
 *
 * TWO VARIANTS because the underlying runtimes differ:
 *
 *   - GOALS_INSTRUCTIONS (VFS variant): for claude-code and codex,
 *     whose pre-tool-use hook can REWRITE the Write/Edit tool
 *     calls and route them through deeplake-shell into the
 *     hivemind_goals table. The agent uses
 *     native Write/Edit on memory paths.
 *
 *   - GOALS_INSTRUCTIONS_CLI (CLI variant): for cursor/hermes/pi,
 *     whose pre-tool-use hook can only intercept Shell / terminal
 *     commands (not Write tool). The Write tool on those runtimes
 *     would land on the host filesystem and never reach Deeplake.
 *     The agent instead invokes `hivemind goal add/list/done/...`
 *     as plain shell commands.
 *     The `hivemind` CLI talks directly to the Deeplake API.
 *
 * Both variants end up writing to the same hivemind_goals table.
 * Team visibility is identical. Only the code path inside the agent
 * differs.
 *
 * Single source of truth lives here so we never drift between
 * the per-agent session-start.ts forks.
 */

export const GOALS_INSTRUCTIONS = `HIVEMIND GOALS — track team goals via the virtual filesystem at \`~/.deeplake/memory/goal/\`. Writes auto-persist to the org-shared \`hivemind_goals\` table.

Path convention (path encoding is the source of truth — do NOT duplicate fields in the file body):
- Goal: \`~/.deeplake/memory/goal/<owner>/<status>/<goal_id>.md\`  with body = free markdown describing the goal

\`<owner>\` = userName from \`hivemind whoami\`. \`<status>\` ∈ {opened, in_progress, closed}. \`<goal_id>\` = UUIDv4 you generate at create time.

Operations:
- Create goal: Write file at \`goal/<owner>/opened/<uuid>.md\`.
- Edit goal text: Edit/Write the same path.
- Move status: \`mv goal/<u>/opened/<id>.md goal/<u>/in_progress/<id>.md\` (atomic UPDATE).
- Soft-close: \`rm goal/<u>/<status>/<id>.md\` — VFS interprets rm as status-flip to 'closed' (no hard delete; row stays for audit).

When the user mentions a goal / objective / target / measurable milestone — OR a task / todo / work item / "remind me to X" — use this convention. The goals system absorbed the legacy \`hivemind tasks\` CLI, so "task" and "goal" map to the same Hivemind row.`;

export const GOALS_INSTRUCTIONS_CLI = `HIVEMIND GOALS — track team goals via the \`hivemind\` CLI on this runtime. Your Write/Edit tools do NOT route to the team-shared tables here, so use these shell commands instead. All commands persist to the org-shared \`hivemind_goals\` table — other team members see your goals at SessionStart.

Commands (invoke via your Shell / terminal / Bash tool):

  hivemind goal add "<text>"
      Create a new goal (status=opened, assigned to you). Prints goal_id on stdout.

  hivemind goal list [--all|--mine]
      List goals. Default: --mine. Columns are tab-separated: goal_id, owner, status, first-line-of-text.

  hivemind goal done <goal_id>
      Mark a goal closed.

  hivemind goal progress <goal_id> <opened|in_progress|closed>
      Flip a goal to any status.

Workflow when the user expresses a goal OR a task / todo / work item (they are the same thing — the goals system absorbed the legacy hivemind tasks CLI):
  1. \`hivemind goal add "<short description>"\` — capture stdout as goal_id.
  2. Tell the user the goal_id and that it is now visible to the team.

Do NOT use Write/Edit on \`~/.deeplake/memory/goal/...\` here — on this runtime those tool calls write to the host filesystem only, not the shared table.`;
