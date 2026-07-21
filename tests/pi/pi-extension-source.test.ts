import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The pi extension is shipped as raw TypeScript (// @ts-nocheck) into
 * ~/.pi/agent/extensions/hivemind.ts and compiled at runtime by pi.
 * That makes it awkward to import + execute here, so we verify the
 * load-bearing wiring at the source level instead.
 *
 * What's locked in:
 *   - The INSERT into the sessions table includes the message_embedding column
 *     (without it, schema-strict tables reject the row — see the schema race
 *     incident in CLAUDE.md).
 *   - The auto-spawn path uses the canonical shared-deps daemon location so
 *     pi works standalone after `hivemind embeddings install`.
 *   - The socket path matches the same UID-keyed convention EmbedClient uses
 *     (otherwise pi's daemon would never converge with other agents').
 */

const PI_SRC = readFileSync(
  join(process.cwd(), "harnesses", "pi", "extension-source", "hivemind.ts"),
  "utf-8",
);

describe("pi extension — embedding wiring", () => {
  it("INSERT into the sessions table includes the message_embedding column", () => {
    const insertLine = PI_SRC.match(
      /INSERT INTO "\$\{SESSIONS_TABLE\}"\s*\([^)]+\)/,
    );
    expect(insertLine).not.toBeNull();
    expect(insertLine![0]).toContain("message_embedding");
  });

  // Regression for C1 (duplicate session rows). The sessions table has no
  // UNIQUE constraint on id, so a plain `INSERT ... VALUES` that gets re-sent
  // (retry after a transient error) creates a duplicate. pi must build the row
  // idempotently — `INSERT ... SELECT ... WHERE NOT EXISTS (id = ...)` — matching
  // the shared buildDirectSessionInsertSql helper the bundled agents use.
  it("builds the sessions INSERT idempotently (no bare VALUES insert)", () => {
    expect(PI_SRC).toMatch(
      /INSERT INTO "\$\{SESSIONS_TABLE\}"[\s\S]*?WHERE NOT EXISTS \(SELECT 1 FROM "\$\{SESSIONS_TABLE\}" WHERE id = '\$\{rowId\}'\)/,
    );
    // ...and never the duplicate-prone bare VALUES form for the sessions row.
    expect(PI_SRC).not.toMatch(
      /INSERT INTO "\$\{SESSIONS_TABLE\}" \([^)]*message_embedding[^)]*\)\s*VALUES/,
    );
  });

  // Regression for the pi `plugin_version` 42703 incident (org c2d29f27 et al.):
  // the pi extension hard-codes its sessions CREATE TABLE inline (it does NOT go
  // through DeeplakeApi.ensureSessionsTable / healMissingColumns like the other
  // agents). When `plugin_version` was added to the canonical SESSIONS_COLUMNS
  // (2026-05-18) the pi INSERT picked it up but the inline CREATE did not, so
  // every pi-created sessions table was one column short from birth and every
  // INSERT failed with `column "plugin_version" ... does not exist` — with no
  // heal to recover. This invariant locks INSERT ⊆ CREATE so the schemas can
  // never silently drift again.
  function sessionsInsertColumns(): string[] {
    const m = PI_SRC.match(/INSERT INTO "\$\{SESSIONS_TABLE\}"\s*\(([^)]+)\)/);
    expect(m).not.toBeNull();
    return m![1].split(",").map(c => c.trim().toLowerCase());
  }
  function sessionsCreateColumns(): string[] {
    const block = PI_SRC.match(/const sessCreate =([\s\S]*?)USING deeplake/);
    expect(block).not.toBeNull();
    const cols = new Set<string>();
    for (const m of block![1].matchAll(
      /[(,`]\s*([a-z_][a-z0-9_]*)\s+(?:TEXT|JSONB|FLOAT4|BIGINT|INT|BOOLEAN|DOUBLE)/gi,
    )) {
      cols.add(m[1].toLowerCase());
    }
    return [...cols];
  }

  it("every column the sessions INSERT writes exists in the sessions CREATE TABLE", () => {
    const created = new Set(sessionsCreateColumns());
    const missing = sessionsInsertColumns().filter(c => !created.has(c));
    expect(missing).toEqual([]);
  });

  it("plugin_version is in both the sessions CREATE and INSERT", () => {
    expect(sessionsCreateColumns()).toContain("plugin_version");
    expect(sessionsInsertColumns()).toContain("plugin_version");
  });

  // The CREATE/INSERT invariants above only protect FRESH tables. Existing
  // 13-column pi tables (the actual prod incident — org c2d29f27) are recovered
  // by the session_start SCHEMA_HEAL pass. Guard that contract too: dropping
  // plugin_version from the heal, or no longer healing MEMORY_TABLE, would
  // silently re-break pre-existing tables while the suite stayed green.
  it("session_start SCHEMA_HEAL heals sessions + memory tables for plugin_version", () => {
    const block = PI_SRC.match(/const SCHEMA_HEAL[^=]*=\s*\[([\s\S]*?)\];/);
    expect(block).not.toBeNull();
    const heal = block![1];
    expect(heal).toContain("SESSIONS_TABLE");
    expect(heal).toContain("MEMORY_TABLE");
    const pluginVersionHeals =
      heal.match(/\["plugin_version",\s*"TEXT NOT NULL DEFAULT ''"\]/g) ?? [];
    expect(pluginVersionHeals.length).toBeGreaterThanOrEqual(2);
  });

  it("auto-spawn target is the canonical shared-deps daemon path", () => {
    expect(PI_SRC).toContain('".hivemind"');
    expect(PI_SRC).toContain('"embed-deps"');
    expect(PI_SRC).toContain('"embed-daemon.js"');
  });

  it("uses the same UID-keyed socket convention as EmbedClient", () => {
    // Pattern: /tmp/hivemind-embed-${SOMETHING_UID}.sock — the UID identifier
    // moved from a closure-scoped `uid` to the module-level `EMBED_UID` when
    // the spawn-on-miss helper was added (issue #178), but the convention
    // itself — UID-keyed per-user socket under /tmp — must stay locked.
    expect(PI_SRC).toMatch(/\/tmp\/hivemind-embed-\$\{[A-Z_a-z]*[Uu][Ii][Dd][A-Z_a-z]*\}\.sock/);
  });

  it("uses an O_EXCL pidfile lock to prevent duplicate daemon spawns", () => {
    // Without this, two pi turns (or pi + another agent) racing to embed
    // would both call spawn() and the second daemon would crash on bind.
    // The fix for issue #178 routes spawn through openSync(pidPath, "wx").
    expect(PI_SRC).toMatch(/openSync\(\s*EMBED_PID_PATH\s*,\s*"wx"/);
  });

  it("respects an alive pidfile owner instead of SIGTERMing it", () => {
    // PR #168's lesson, mirrored here: a stale-looking pidfile with a
    // live PID is most likely another agent in the middle of bringing
    // the daemon up. Killing it would race with a possibly-recycled OS
    // pid (PR #168 reproduced the exact harm in src/embeddings/client.ts).
    // We require the inline helper to call isPidAlive but never SIGTERM
    // the daemon — the only allowed kill is the liveness probe `kill(pid, 0)`.
    expect(PI_SRC).toContain("isPidAlive");
    // Allowed: `process.kill(pid, 0)` — liveness probe used inside
    // isPidAlive(). Any OTHER process.kill(...) is forbidden, including
    // the bare `process.kill(pid)` form which Node treats as SIGTERM by
    // default.
    expect(PI_SRC).toMatch(/process\.kill\(\s*pid\s*,\s*0\s*\)/);
    const withoutLivenessProbe = PI_SRC.replace(/process\.kill\(\s*pid\s*,\s*0\s*\)/g, "");
    expect(withoutLivenessProbe).not.toMatch(/process\.kill\(/);
  });

  it("treats an empty pidfile as 'writer in progress' to avoid duplicate spawns", () => {
    // The catch-after-openSync(wx) branch MUST short-circuit on empty
    // pidfile, not unlink + retry. Without this, two pi turns racing
    // openSync(wx) can both end up calling spawn(): caller A wins
    // openSync but hasn't yet writeSync'd its PID, caller B sees the
    // empty pidfile, treats it as stale, unlinks, and spawns too.
    // The second daemon crashes on bind().
    expect(PI_SRC).toMatch(/if\s*\(\s*existing\s*===\s*"empty"\s*\)\s*return\s+false/);
  });

  it("cleans up own placeholder PID after spawnWaitMs timeout (enables retry)", () => {
    // If trySpawnDaemonInline wrote our placeholder PID and the daemon
    // never opened a socket, the pidfile still holds our PID. Every
    // subsequent pi turn sees "live owner" (we're alive) and waits
    // forever instead of retrying the spawn. Source must call
    // maybeCleanupOwnPlaceholderInline on the timeout path.
    expect(PI_SRC).toContain("maybeCleanupOwnPlaceholderInline");
    // The cleanup must be guarded on "still ours" — never blindly unlink
    // (a fresh daemon may have already overwritten the placeholder).
    expect(PI_SRC).toMatch(/existing\s*===\s*process\.pid/);
  });

  it("validates daemon embedding payload is finite numbers", () => {
    // JSON from the socket is untrusted at runtime. A misbehaving / older
    // daemon could ship strings or NaN that flow into the ARRAY[...] SQL
    // literal. The inline sendEmbedRequest must reject any non-finite
    // element before returning the vector.
    expect(PI_SRC).toMatch(/Number\.isFinite\(/);
    expect(PI_SRC).toMatch(/typeof\s+v\s*!==\s*"number"/);
  });

  it("speaks the daemon's protocol shape exactly: {op:'embed', id, kind, text}", () => {
    // Regression guard: an earlier version sent `{type:'embed', id:1, ...}` —
    // the daemon silently ignored the malformed verb (`type` instead of `op`)
    // and the embed ended up null on every call. Source of truth is
    // src/embeddings/protocol.ts (EmbedRequest interface).
    expect(PI_SRC).toContain('op: "embed"');
    expect(PI_SRC).not.toMatch(/type:\s*"embed"/);
    expect(PI_SRC).toMatch(/id:\s*"1"/); // id is a string, not a number
  });

  it("session_start CREATE TABLE IF NOT EXISTS for both memory + sessions tables", () => {
    // Without these, the first writeSessionRow fails because the test's
    // custom HIVEMIND_TABLE / HIVEMIND_SESSIONS_TABLE haven't been created
    // by any other agent. The pi extension's writeSessionRow swallows
    // errors silently — we'd see "no rows" with no log explanation. The
    // CREATE TABLE makes the extension standalone-capable.
    expect(PI_SRC).toMatch(/CREATE TABLE IF NOT EXISTS "\$\{MEMORY_TABLE\}"/);
    expect(PI_SRC).toMatch(/CREATE TABLE IF NOT EXISTS "\$\{SESSIONS_TABLE\}"/);
    expect(PI_SRC).toMatch(/summary_embedding FLOAT4\[\]/);
    expect(PI_SRC).toMatch(/message_embedding FLOAT4\[\]/);
  });

  it("summary-state thresholds match the canonical defaults from src/hooks/summary-state.ts", () => {
    // Source of truth: 50 msgs / 2 hours. If those defaults change in
    // summary-state.ts the pi extension MUST track them — otherwise pi
    // and CC/codex would summarise at different cadences using the same
    // sidecar dir.
    expect(PI_SRC).toContain("HIVEMIND_SUMMARY_EVERY_N_MSGS");
    expect(PI_SRC).toContain("HIVEMIND_SUMMARY_EVERY_HOURS");
    expect(PI_SRC).toMatch(/everyNMessages.*50/);
    expect(PI_SRC).toMatch(/everyHours.*2/);
  });

  it("first-chat trigger fires at FIRST_SUMMARY_AT=10 (matches summary-state.ts canonical)", () => {
    // Without this trigger a brand-new session would have to accumulate 50
    // messages before the first summary lands. The canonical CC/codex
    // shouldTrigger() has an early-fire condition: when lastSummaryCount===0
    // and totalCount>=10. Pi MUST replicate it or fresh pi-only sessions
    // wouldn't get indexed for an unreasonably long time.
    expect(PI_SRC).toContain("FIRST_SUMMARY_AT");
    expect(PI_SRC).toMatch(/FIRST_SUMMARY_AT\s*=\s*10/);
    expect(PI_SRC).toMatch(/lastSummaryCount\s*===?\s*0\s*&&\s*state\.totalCount\s*>=\s*FIRST_SUMMARY_AT/);
  });

  it("time-based trigger formula matches summary-state.ts canonical (everyHours * 3600 * 1000)", () => {
    // Locks in: msgsSince > 0 AND lastSummaryAt > 0 AND elapsed >= everyHours*ms.
    // The "msgsSince > 0" guard is critical — without it a quiet session past
    // 2h would summarise itself in a loop even with no new events.
    expect(PI_SRC).toMatch(/cfg\.everyHours\s*\*\s*3600\s*\*\s*1000/);
    expect(PI_SRC).toMatch(/msgsSince\s*>\s*0/);
    expect(PI_SRC).toMatch(/state\.lastSummaryAt\s*>\s*0/);
  });

  it("shares the summary-state dir with CC/codex/cursor/hermes (~/.claude/hooks/summary-state)", () => {
    // The pi-spawned wiki-worker bundle imports finalizeSummary/releaseLock
    // from src/hooks/summary-state.ts which writes to that dir. The pi
    // extension's inline state helpers MUST point at the same dir or the
    // worker's writes won't be visible to subsequent threshold checks.
    expect(PI_SRC).toContain('".claude"');
    expect(PI_SRC).toContain('"hooks"');
    expect(PI_SRC).toContain('"summary-state"');
  });

  it("session_shutdown spawns the wiki-worker with reason=final", () => {
    expect(PI_SRC).toMatch(/spawnWikiWorker\(creds,\s*sessionId,\s*cwd,\s*"final"\)/);
  });

  it("input/tool_result/message_end each invoke maybeTriggerPeriodicSummary after writing", () => {
    // Three call sites — one per capture event. If any of them is missing,
    // periodic summaries skip events of that type and the threshold drifts
    // (or never fires for a tool-heavy or assistant-heavy session).
    const matches = PI_SRC.match(/maybeTriggerPeriodicSummary\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("wiki-worker spawn target is ~/.pi/agent/hivemind/wiki-worker.js (where install-pi.ts deposits it)", () => {
    expect(PI_SRC).toContain('".pi"');
    expect(PI_SRC).toContain('"agent"');
    expect(PI_SRC).toContain('"hivemind"');
    expect(PI_SRC).toContain('"wiki-worker.js"');
  });

  it("falls back gracefully when embeddings are explicitly disabled", () => {
    expect(PI_SRC).toContain('process.env.HIVEMIND_EMBEDDINGS === "false"');
  });

  it("emits NULL (not a malformed literal) when no embedding is available", () => {
    // embedSqlLiteral(null) → "NULL" — guards against `ARRAY[]::FLOAT4[]` slipping in.
    expect(PI_SRC).toMatch(/return\s+"NULL"/);
  });
});

describe("pi extension — SkillOpt wiring", () => {
  it("arms on a SKILL.md READ in the tool_result handler (non-error reads only, read tools only)", () => {
    // pi has no first-class Skill tool — it USES a skill by reading its SKILL.md, so arming hangs
    // off tool_result, gated on a successful read. The toolName is passed so arming is restricted
    // to read tools (an edit/write of a SKILL.md must not arm).
    expect(PI_SRC).toContain("skilloptArm(sessionId, event.toolName, event.input, event.toolCallId)");
    expect(PI_SRC).toContain("event.isError !== true");
    expect(PI_SRC).toMatch(/\/\^read\/i\.test/); // arm restricted to read tools
    expect(PI_SRC).toContain("/skills/"); // the ref-from-path matcher targets …/skills/<ref>/SKILL.md
  });

  it("reacts on the user prompt in the input handler", () => {
    expect(PI_SRC).toContain("skilloptReact(sessionId, text)");
  });

  it("spawns the bundled skillopt-worker with the cross-process env contract", () => {
    expect(PI_SRC).toContain('"skillopt-worker.js"');
    // these env-var names MUST match SKILLOPT_ENV — the worker reads the literals back
    for (const v of [
      "HIVEMIND_SKILLOPT_WORKER", "HIVEMIND_SKILLOPT_SESSION", "HIVEMIND_SKILLOPT_SKILL",
      "HIVEMIND_SKILLOPT_REACTION", "HIVEMIND_SKILLOPT_AGENT",
    ]) expect(PI_SRC).toContain(v);
    expect(PI_SRC).toContain('HIVEMIND_SKILLOPT_AGENT: "pi"'); // judge/proposer run on pi
  });

  it("honors the kill switch + the in-worker recursion guard", () => {
    expect(PI_SRC).toContain('process.env.HIVEMIND_SKILLOPT_DISABLED === "1"');
    expect(PI_SRC).toContain('process.env.HIVEMIND_WIKI_WORKER === "1"');
  });

  it("only arms org-shaped refs (name--author), not bare/plugin skills", () => {
    expect(PI_SRC).toContain('ref.includes(":")');      // reject plugin-namespaced
    expect(PI_SRC).toContain('ref.lastIndexOf("--")');  // require name--author
  });
});

// Pi is a standalone extension (no shared-module imports), so it carries an
// inline mirror of src/dir-config.ts. These guard that the per-directory
// `.hivemind` wiring (opt-out + routing) is present and applied on every
// capture path — the gap Emanuele flagged on PR #302.
describe("pi extension — per-directory .hivemind wiring", () => {
  it("defines the inline resolver over both filenames", () => {
    expect(PI_SRC).toContain("function findHivemindDir");
    expect(PI_SRC).toContain("function applyDirConfig");
    expect(PI_SRC).toContain('".hivemind.local", ".hivemind"');
  });

  it("honors env precedence (env > file) in the overlay", () => {
    expect(PI_SRC).toContain("process.env.HIVEMIND_ORG_ID");
    expect(PI_SRC).toContain("process.env.HIVEMIND_WORKSPACE_ID");
  });

  it("gates every capture path on the resolved collect flag", () => {
    // input / tool_result / message_end / session_shutdown each skip on opt-out.
    const skips = PI_SRC.match(/capture disabled for cwd=\$\{cwd\} via \.hivemind/g) ?? [];
    expect(skips.length).toBe(4);
    // and each reassigns creds to the routed identity after the gate.
    const reassigns = PI_SRC.match(/creds = dirRes\.creds;/g) ?? [];
    expect(reassigns.length).toBe(4);
  });

  it("gates session_start table setup on collect and discloses routing", () => {
    expect(PI_SRC).toContain("creds && captureEnabled && dirCollect");
    expect(PI_SRC).toContain("routed by .hivemind");
    expect(PI_SRC).toContain("capture is disabled for this directory");
  });
});
