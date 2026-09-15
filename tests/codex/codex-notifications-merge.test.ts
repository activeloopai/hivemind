import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

/**
 * Codex notification delivery.
 *
 * Before this landed, Codex never drained the notification queue at all, so
 * a user whose org ran out of credits got zero signal: captures and recalls
 * failed silently forever (reported 2026-08-12 in #platform). Two things have
 * to hold for the fix to actually reach a Codex user:
 *
 *   1. The rendered notification text lands in `systemMessage` (the channel
 *      Codex prints as `warning:` / `SessionStart (completed) says:`).
 *   2. The hook still emits exactly ONE JSON object. Codex's wire type is
 *      `#[serde(deny_unknown_fields)]` and its parser reads a single object —
 *      a second write would fail the parse and silently drop everything,
 *      which is the exact failure mode we are fixing.
 */

const stdinMock = vi.fn();
const loadCredsMock = vi.fn();
const drainMock = vi.fn();

vi.mock("../../src/utils/stdin.js", () => ({ readStdin: (...a: any[]) => stdinMock(...a) }));
vi.mock("../../src/commands/auth.js", () => ({
  loadCredentials: (...a: any[]) => loadCredsMock(...a),
  healDriftedOrgToken: async (creds: unknown) => creds,
  resolveWorkspaceOverride: async (creds: unknown) => ({ creds }),
}));
vi.mock("../../src/utils/debug.js", () => ({ log: () => undefined }));
vi.mock("../../src/skillify/auto-pull.js", () => ({
  autoPullSkills: async () => ({ pulled: 0, skipped: true, reason: "stubbed" }),
}));
vi.mock("../../src/skillify/local-manifest.js", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, countLocalManifestEntries: () => 0 };
});
vi.mock("../../src/graph/spawn-pull-worker.js", () => ({ spawnGraphPullWorker: () => undefined }));
vi.mock("../../src/notifications/state.js", () => ({ bumpSessionCount: () => 3 }));
vi.mock("../../src/notifications/index.js", () => ({
  drainSessionStart: (...a: any[]) => drainMock(...a),
  registerRule: () => undefined,
}));
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<any>("node:child_process");
  return {
    ...actual,
    spawn: () => {
      const stdin = new EventEmitter() as any;
      stdin.write = vi.fn(); stdin.end = vi.fn();
      return { stdin, unref: vi.fn() };
    },
  };
});

const BALANCE_NOTIFICATION = {
  id: "balance-exhausted",
  severity: "warn" as const,
  transient: true,
  title: "Hivemind credits exhausted — top up to keep capturing",
  body: "Sessions are not being saved. Top up at https://deeplake.ai/acme/workspace/default/billing.",
  dedupKey: { reason: "balance-zero" },
  userVisibleOnly: true,
};

/** Runs the hook and returns every console.log write it made. */
async function runHook(): Promise<string[]> {
  delete process.env.HIVEMIND_WIKI_WORKER;
  vi.resetModules();
  const collected: string[] = [];
  const original = console.log;
  console.log = (...args: any[]) => { collected.push(args.join(" ")); };
  try {
    await import("../../src/hooks/codex/session-start.js");
    for (let i = 0; i < 200 && collected.length === 0; i++) {
      await new Promise(r => setTimeout(r, 5));
    }
    return collected;
  } finally {
    console.log = original;
  }
}

/** Same as runHook but waits long enough for the hook budget to fire. */
async function runHookSlow(): Promise<string[]> {
  delete process.env.HIVEMIND_WIKI_WORKER;
  vi.resetModules();
  const collected: string[] = [];
  const original = console.log;
  console.log = (...args: any[]) => { collected.push(args.join(" ")); };
  try {
    await import("../../src/hooks/codex/session-start.js");
    for (let i = 0; i < 300 && collected.length === 0; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    return collected;
  } finally {
    console.log = original;
  }
}

beforeEach(() => {
  stdinMock.mockReset().mockResolvedValue({
    session_id: "sid-1", cwd: "/x", hook_event_name: "SessionStart", model: "gpt-5", source: "startup",
  });
  loadCredsMock.mockReset().mockReturnValue({
    token: "tok", orgId: "org-id", orgName: "acme", userName: "alice", workspaceId: "default",
  });
  drainMock.mockReset().mockImplementation(async () => undefined);
});

describe("codex session-start — notification delivery", () => {
  it("drains the notification queue as agent 'codex'", async () => {
    await runHook();
    expect(drainMock).toHaveBeenCalledTimes(1);
    const opts = drainMock.mock.calls[0][0];
    expect(opts.agent).toBe("codex");
    expect(opts.sessionId).toBe("sid-1");
    expect(opts.source).toBe("startup");
    // Codex owns its stdout, so the hook must supply a delivery override
    // rather than letting an adapter write a second JSON object.
    expect(typeof opts.deliver).toBe("function");
  });

  it("puts the credits-exhausted CTA in systemMessage, in a single JSON object", async () => {
    drainMock.mockImplementation(async (opts: any) => { opts.deliver([BALANCE_NOTIFICATION]); });
    const writes = await runHook();

    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]);
    // The whole rendered notification, not fragments — a partial match would
    // still pass if the billing link (the entire point of the CTA) were lost.
    expect(parsed.systemMessage).toBe(
      `⚠️ ${BALANCE_NOTIFICATION.title}\n${BALANCE_NOTIFICATION.body}`,
    );
    expect(parsed.systemMessage).toContain(
      "https://deeplake.ai/acme/workspace/default/billing",
    );
    expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
  });

  it("keeps a userVisibleOnly notification out of the model-visible context", async () => {
    drainMock.mockImplementation(async (opts: any) => { opts.deliver([BALANCE_NOTIFICATION]); });
    const parsed = JSON.parse((await runHook())[0]);
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain("credits exhausted");
    // The hook's own login-state line is still there.
    expect(parsed.hookSpecificOutput.additionalContext).toContain("logged in as org acme");
  });

  it("renders a model-safe notification into BOTH channels", async () => {
    drainMock.mockImplementation(async (opts: any) => {
      opts.deliver([{ ...BALANCE_NOTIFICATION, userVisibleOnly: false }]);
    });
    const parsed = JSON.parse((await runHook())[0]);
    expect(parsed.systemMessage).toContain("Hivemind credits exhausted");
    expect(parsed.hookSpecificOutput.additionalContext).toContain("Hivemind credits exhausted");
  });

  it("puts notifications ABOVE the hook's own copy — a warning must not be buried", async () => {
    drainMock.mockImplementation(async (opts: any) => {
      opts.deliver([{ ...BALANCE_NOTIFICATION, userVisibleOnly: false }]);
    });
    const parsed = JSON.parse((await runHook())[0]);
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain(BALANCE_NOTIFICATION.title);
    expect(ctx).toContain("logged in as org acme");
    expect(ctx.indexOf("credits exhausted")).toBeLessThan(ctx.indexOf("logged in as org acme"));
  });

  it("still emits output when the drain hangs past the hook budget", async () => {
    // Codex discards the ENTIRE hook output on a 10s timeout — the user sees
    // "SessionStart hook (failed)" and loses the login context and any billing
    // CTA with it. Observed in real sessions. A hung drain must not do that.
    drainMock.mockImplementation(() => new Promise(() => { /* never settles */ }));
    const writes = await runHookSlow();
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]);
    expect(parsed.hookSpecificOutput.additionalContext).toContain("logged in as org acme");
  }, 20_000);

  it("emits its normal single JSON object when there is nothing to notify", async () => {
    const writes = await runHook();
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]);
    expect(parsed.systemMessage).toBeUndefined();
    expect(parsed.hookSpecificOutput.additionalContext).toContain("logged in as org acme");
  });
});
