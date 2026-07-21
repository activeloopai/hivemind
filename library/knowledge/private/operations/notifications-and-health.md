# Notifications and Environment Health

> Category: Operations | Version: 1.0 | Date: June 2026 | Status: Active

Architecture of the Hivemind notifications framework and the proactive prerequisite environment health check and auto-wiring engine.

**Related:**
- [`cli-command-architecture.md`](cli-command-architecture.md)
- [`../auth/auth-architecture.md`](../auth/auth-architecture.md)
- [`../overview.md`](../overview.md)
- [`../architecture/system-overview.md`](../architecture/system-overview.md)
- [`../architecture/session-lifecycle.md`](../architecture/session-lifecycle.md)

---

## Why this exists

Coding assistant integrations are complex and fragile. They are highly dependent on external command-line utilities, correct user sessions, and global configuration files like `~/.cursor/hooks.json`. 

To prevent silent failures, Hivemind implements two proactive operational guardrails:
1. **The Notifications Framework:** Evaluates, queues, and delivers contextual alerts on session start, helping developers resolve subscription issues, account limits, and local mining opportunities.
2. **The Environment Health Check:** Continuously monitors local prerequisites, verifies compiler tools and helper CLIs, and auto-wires lifecycle hooks with near-zero friction.

Together, these guardrails ensure that the shared memory layer remains robust, and that potential compilation or summarization failures are caught and surfaced before causing silent data loss.

---

## The Notifications Framework

The notifications pipeline is trigger-agnostic and fail-soft. It is designed to run synchronously during `SessionStart` without introducing visible latency into the user's coding session.

```77:104:src/notifications/index.ts
export async function drainSessionStart(opts: DrainOptions): Promise<void> {
  try {
    const state = readState();
    const queue = readQueue();
    const ctx: NotificationContext = {
      agent: opts.agent,
      creds: opts.creds,
      state,
      localSkillsCount: opts.localSkillsCount ?? null,
      latestInsightEntry: opts.latestInsightEntry ?? null,
      sessionCount: opts.sessionCount,
    };

    const fromRules = evaluateRules("session_start", ctx);
    const fromQueue = queue.queue;
    // Two parallel fetches with independent 1.5s timeouts so session-start
    // latency stays bounded by ~1.5s rather than 3s. Both fail-soft.
    //
    // pickPrimaryBanner returns the single banner for the welcome/savings
    // priority slot (org savings > 1M → savings recap; else → welcome).
    // Backend pushes remain additive in this PR — they're rare and not yet
    // under the priority model. A follow-up will collapse all sources
    // (including queue) under the same priority.
    const [fromBackend, primary] = await Promise.all([
      fetchBackendNotifications(opts.creds),
      pickPrimaryBanner(opts.sessionId, opts.creds, opts.source),
    ]);
```

### Double-Invocation Race Mitigation

In some environments, such as Claude Code, the notifications hook can be registered in both the user's global configuration (`~/.claude/settings.json`) and the marketplace plugin definition (`hooks.json`). This causes two separate Node processes to spawn and run in parallel, both reading state before either writes.

To prevent duplicate banners from cluttering the terminal, Hivemind implements an atomic claiming lock using POSIX file semantics:

```114:133:src/notifications/state.ts
export function tryClaim(n: Notification): boolean {
  const home = resolve(homedir());
  const claimsDir = join(home, ".deeplake", "notifications-claims");
  try {
    mkdirSync(claimsDir, { recursive: true, mode: 0o700 });
  } catch (e: any) {
    log(`tryClaim mkdir failed: ${e?.message ?? String(e)}`);
    return true;
  }
  const claimPath = claimPathFor(claimsDir, n);
  try {
    const fd = openSync(claimPath, "wx", 0o600);
    closeSync(fd);
    return true;
  } catch (e: any) {
    if (e?.code === "EEXIST") return false;
    log(`tryClaim open failed: ${e?.message ?? String(e)}`);
    return true;
  }
}
```

The first process to call `openSync` with the exclusive write-creation flag (`wx`) succeeds and gains the claim. The racer process encounters an `EEXIST` error and immediately skips emitting that notification.

### Transient vs. Persistent States

* **Persistent Notifications:** Welcome messages, first-time guides, or organization-wide savings recaps are registered in state. Storing their `id` and `dedupKey` in `~/.deeplake/notifications-state.json` ensures they display exactly once.
* **Transient Notifications:** Used for self-clearing events, such as payment failures or missing background dependencies. When a transient notification is drained, its claim file is unlinked using `releaseClaim`, allowing future sessions to re-emit the warning if the underlying issue continues.

To prevent filesystem corruption during state updates, `writeState` writes output to a temporary process-tagged file first, then executes an atomic POSIX `renameSync` operation over the active state path.

---

## Environment Health Check (D1 - D4)

The health check resolves the silent-failure gap described in `prd-002a-health-check.md`. If a background summary worker fails because a compiler or tool binary is missing, the error was previously swallowed. The check proactive monitors four independent dimensions of environment health.

| Dimension | Checked Precondition | Resolving Strategy |
| --- | --- | --- |
| **D1: `hivemind` CLI** | Is the global `hivemind` CLI binary installed? | PATH resolution with version probing. |
| **D2: `cursor-agent` CLI** | Is `cursor-agent` present and executable? | PATH resolution with fallbacks to known IDE directories. |
| **D3: `cursor-agent` login** | Is the user logged into `cursor-agent`? | A lightweight status query command. |
| **D4: Hooks wired and current** | Are the correct lifecycle hooks present? | Checks `hooks.json` for matches against the current bundle. |

Surfacing logged-out and missing states upfront prevents the shared database from filling with silent, empty placeholders.

---

## Auto-Wiring and Idempotency

The auto-wiring engine removes the friction of manual hook setup by managing the `~/.cursor/hooks.json` configuration file on the developer's behalf.

The engine wires six specific lifecycle events to redirect agent actions through the Hivemind shared core:

```44:61:src/cli/install-cursor.ts
function buildHookConfig(): Record<string, CursorHookEntry[]> {
  return {
    sessionStart: [buildHookCmd("session-start.js", 30)],
    beforeSubmitPrompt: [buildHookCmd("capture.js", 10)],
    // preToolUse with Shell matcher rewrites grep/rg against ~/.deeplake/memory/
    // into a single SQL fast-path call, matching Claude Code / Codex accuracy.
    preToolUse: [buildHookCmdShellMatcher("pre-tool-use.js", 30)],
    postToolUse: [buildHookCmd("capture.js", 15)],
    afterAgentResponse: [buildHookCmd("capture.js", 15)],
    // graph-on-stop: auto-build the code graph (A1 Cursor parity). Same hook
    // Claude Code registers under Stop + SessionEnd. It's gated (rate limit +
    // HEAD-changed + source-diff) so the common path is a ~5ms skip, and runs
    // async so it never blocks Cursor.
    stop: [buildHookCmd("capture.js", 15), buildHookCmd("graph-on-stop.js", 30)],
    sessionEnd: [buildHookCmd("session-end.js", 30), buildHookCmd("graph-on-stop.js", 30)],
  };
}
```

### Correctness and Safety Requirements

To operate safely inside developer environments, the auto-wiring process adheres to three strict rules:

1. **Preserving Foreign Hooks:** Auto-wiring must never overwrite other third-party hooks. It parses the existing array, filters out entries matching Hivemind paths via `isHivemindEntry`, and appends the new configuration.
2. **Idempotency:** Re-wiring when no configuration has changed must not touch the file. This protects the hook-trust fingerprint calculated by the editor, avoiding warning dialogs. This is implemented using `writeJsonIfChanged` under the hood.
3. **Reversibility:** When uninstalling, the engine strips only the Hivemind hooks. If the resulting `hooks` object contains no further hooks, the configuration file itself is cleanly unlinked.
