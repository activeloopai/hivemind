import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { referralInviteRule } from "../../src/notifications/rules/referral-invite.js";
import { bumpSessionCount, readState, writeState, markShown } from "../../src/notifications/state.js";
import type { NotificationContext, Notification } from "../../src/notifications/types.js";
import type { Credentials } from "../../src/commands/auth-creds.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

const signedIn = { token: "tok" } as unknown as Credentials;

function ctx(over: Partial<NotificationContext>): NotificationContext {
  return { agent: "claude-code", creds: null, state: { shown: {} }, ...over };
}

describe("referralInviteRule", () => {
  it("stays silent when not signed in (no org to invite into)", () => {
    expect(referralInviteRule.evaluate(ctx({ creds: null, sessionCount: 5 }))).toBeNull();
  });

  it("stays silent for the first two sessions", () => {
    expect(referralInviteRule.evaluate(ctx({ creds: signedIn, sessionCount: 1 }))).toBeNull();
    expect(referralInviteRule.evaluate(ctx({ creds: signedIn, sessionCount: 2 }))).toBeNull();
  });

  it("stays silent when sessionCount is missing", () => {
    expect(referralInviteRule.evaluate(ctx({ creds: signedIn }))).toBeNull();
  });

  it("fires on the 3rd session for a signed-in user", () => {
    const n = referralInviteRule.evaluate(ctx({ creds: signedIn, sessionCount: 3 }));
    expect(n).not.toBeNull();
    expect(n!.id).toBe("referral-invite");
    expect(n!.title).toBe("💸 Invite a teammate — your org earns $20");
    expect(n!.body).toBe(
      "Run `hivemind invite <email> <ADMIN|WRITE|READ>` — your org gets $20 in credit when they sign up (up to $100).",
    );
    expect(n!.dedupKey).toEqual({ v: 1 }); // stable → shown once
  });

  it("keeps firing past the 3rd session (dedup handles once-only at drain)", () => {
    expect(referralInviteRule.evaluate(ctx({ creds: signedIn, sessionCount: 9 }))).not.toBeNull();
  });
});

describe("bumpSessionCount", () => {
  let prevHome: string | undefined;
  let home: string;

  beforeEach(() => {
    prevHome = process.env.HOME;
    home = mkdtempSync(join(tmpdir(), "hm-sess-"));
    setFakeHome(home);
  });
  afterEach(() => {
    clearFakeHome();
    rmSync(home, { recursive: true, force: true });
  });

  it("increments once per distinct session_id", () => {
    expect(bumpSessionCount("s1")).toBe(1);
    expect(bumpSessionCount("s2")).toBe(2);
    expect(bumpSessionCount("s3")).toBe(3);
    expect(readState().sessionCount).toBe(3);
  });

  it("does not double-count the same session_id (parallel hook fires)", () => {
    expect(bumpSessionCount("same")).toBe(1);
    expect(bumpSessionCount("same")).toBe(1);
    expect(readState().sessionCount).toBe(1);
  });

  it("leaves the count unchanged when session_id is missing", () => {
    expect(bumpSessionCount("s1")).toBe(1);
    expect(bumpSessionCount(undefined)).toBe(1);
    expect(readState().sessionCount).toBe(1);
  });

  it("survives a round-trip through writeState/readState", () => {
    writeState({ shown: {}, sessionCount: 5, lastCountedSessionId: "s5" });
    const s = readState();
    expect(s.sessionCount).toBe(5);
    expect(s.lastCountedSessionId).toBe("s5");
  });

  it("treats a legacy state file (no counter) as count 0", () => {
    writeState({ shown: {} });
    expect(readState().sessionCount).toBeUndefined();
    expect(bumpSessionCount("first")).toBe(1);
  });

  it("markShown preserves the session counter fields", () => {
    const n: Notification = { id: "x", title: "t", body: "b", dedupKey: { v: 1 } };
    const next = markShown({ shown: {}, sessionCount: 3, lastCountedSessionId: "s3" }, n);
    expect(next.sessionCount).toBe(3);
    expect(next.lastCountedSessionId).toBe("s3");
    expect(next.shown["x"]).toBeDefined();
  });
});
