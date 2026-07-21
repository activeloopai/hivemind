import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Mock the org-stats source so primary-banner doesn't actually hit the
// network. Tests below set the resolved value per case.
const { orgStatsMock } = vi.hoisted(() => ({ orgStatsMock: vi.fn() }));
vi.mock("../../src/notifications/sources/org-stats.js", () => ({
  fetchOrgStats: orgStatsMock,
}));

// Mock the resume brief too — it issues a DeeplakeApi query that would
// otherwise retry against the dead test endpoint. Default: nothing to resume.
const { resumeMock } = vi.hoisted(() => ({ resumeMock: vi.fn() }));
vi.mock("../../src/notifications/sources/resume-brief.js", () => ({
  pickResumeBrief: resumeMock,
}));

// Mock the cold-start brief so it doesn't take the prefix slot from the
// resume brief in tests that exercise the resume path. Default: null.
const { coldMock } = vi.hoisted(() => ({ coldMock: vi.fn() }));
vi.mock("../../src/notifications/sources/cold-start-brief.js", () => ({
  pickColdStartBrief: coldMock,
}));

// Mock only the network read of open goals; keep the real formatter so the
// banner's goals block (and its spacing) is exercised end to end.
const { goalsMock } = vi.hoisted(() => ({ goalsMock: vi.fn() }));
vi.mock("../../src/notifications/sources/open-goals.js", async (importActual) => {
  const actual = await importActual<typeof import("../../src/notifications/sources/open-goals.js")>();
  return { ...actual, fetchOpenGoals: goalsMock };
});

import { pickPrimaryBanner, formatTokens } from "../../src/notifications/sources/primary-banner.js";
import { appendUsageRecord } from "../../src/notifications/usage-tracker.js";
import type { Credentials } from "../../src/commands/auth-creds.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;
let ORIGINAL_HIVEMIND_TOKEN: string | undefined;
let ORIGINAL_HIVEMIND_ORG_ID: string | undefined;

const FRESH_CREDS: Credentials = {
  token: "tok",
  orgId: "org-1",
  orgName: "acme",
  userName: "ada",
  workspaceId: "ws-1",
  apiUrl: "http://x",
  savedAt: "2026-05-18T00:00:00Z",
};

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-primary-banner-test-"));
  ORIGINAL_HOME = process.env.HOME;
  setFakeHome(TEMP_HOME);
  mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
  orgStatsMock.mockReset();
  // Default: server unreachable → primary-banner falls back to local jsonl.
  orgStatsMock.mockResolvedValue(null);
  resumeMock.mockReset();
  // Default: no prior summary for this project → no resume brief.
  resumeMock.mockResolvedValue(null);
  coldMock.mockReset();
  // Default: not a first-run → cold-start brief stays out of the way.
  coldMock.mockResolvedValue(null);
  goalsMock.mockReset();
  // Default: no open goals.
  goalsMock.mockResolvedValue(null);
  // loadConfig() (used by the goals lookup) needs a token + org to return a
  // config; supply them via env so fetchOpenGoals is actually consulted.
  // goalsMock defaults to null, so cases that don't set goals are unchanged.
  // Capture-and-restore (rather than delete) so a real token/org in the
  // ambient env isn't clobbered for whatever runs after this suite.
  ORIGINAL_HIVEMIND_TOKEN = process.env.HIVEMIND_TOKEN;
  ORIGINAL_HIVEMIND_ORG_ID = process.env.HIVEMIND_ORG_ID;
  process.env.HIVEMIND_TOKEN = "tok";
  process.env.HIVEMIND_ORG_ID = "org-1";
});

afterEach(() => {
  clearFakeHome();
  restoreEnv("HIVEMIND_TOKEN", ORIGINAL_HIVEMIND_TOKEN);
  restoreEnv("HIVEMIND_ORG_ID", ORIGINAL_HIVEMIND_ORG_ID);
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

function restoreEnv(key: string, original: string | undefined): void {
  if (original === undefined) delete process.env[key];
  else process.env[key] = original;
}

describe("pickPrimaryBanner — guard conditions", () => {
  it("returns null when sessionId is undefined", async () => {
    expect(await pickPrimaryBanner(undefined, FRESH_CREDS)).toBeNull();
  });

  it("returns null when creds is null (logged-out user)", async () => {
    expect(await pickPrimaryBanner("s-1", null)).toBeNull();
  });

  it("returns null when creds has no token", async () => {
    expect(await pickPrimaryBanner("s-1", { ...FRESH_CREDS, token: "" })).toBeNull();
  });

  it("returns null on a resume — no banner when the user already has the thread", async () => {
    expect(await pickPrimaryBanner("s-1", FRESH_CREDS, "resume")).toBeNull();
  });

  it("still renders on a fresh startup and when source is absent (older Claude Code)", async () => {
    expect(await pickPrimaryBanner("s-startup", FRESH_CREDS, "startup")).not.toBeNull();
    expect(await pickPrimaryBanner("s-nosrc", FRESH_CREDS)).not.toBeNull();
  });
});

describe("pickPrimaryBanner — welcome (default when savings ≤ 1M)", () => {
  it("renders welcome with userName/orgName/workspace when org-stats null + no local data", async () => {
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n).not.toBeNull();
    expect(n!.id).toBe("welcome");
    expect(n!.title).toBe("Welcome back, ada");
    expect(n!.body).toBe("Connected to org acme (workspace ws-1).");
    expect(n!.dedupKey).toEqual({ session: "s-1" });
  });

  it("separates the resume brief and the open-goals block by exactly one blank line", async () => {
    // The resume brief ends each session block with a trailing newline.
    // composeBody joins sections with '\n\n'; without trimming that trailing
    // newline the brief→goals seam rendered TWO blank lines.
    resumeMock.mockResolvedValue({
      brief:
        "📌 Picking up on indra — where you left off:\n" +
        "   • finish the thing\n" +
        "     ↳ /resume abc · earlier today\n",
    });
    goalsMock.mockResolvedValue({ count: 2, sample: ["goal one", "goal two"] });
    const n = await pickPrimaryBanner("s-blank", FRESH_CREDS, "startup");
    expect(n!.body).not.toContain("\n\n\n");
    expect(n!.body).toContain("↳ /resume abc · earlier today\n\n📌 2 goals open");
  });

  it("renders welcome when org-stats present but savings < 1k", async () => {
    // 4k bytes → Y = 1000 tokens → Z = 0.7 × 1000 = 700 tokens
    // → below the 1k threshold, so welcome still wins for brand-new
    // teams whose cumulative bytes haven't crossed even the lowered bar.
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 2, memoryRecallCount: 1, memorySearchBytes: 4_000 },
      user: { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 4_000 },
    });
    const n = await pickPrimaryBanner("s-edge", FRESH_CREDS);
    expect(n!.id).toBe("welcome");
  });

  it("merges a live low-balance line into the banner when balanceCents is below threshold", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 2, memoryRecallCount: 1, memorySearchBytes: 4_000 },
      user: { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 4_000 },
      balanceCents: 113,
    });
    const n = await pickPrimaryBanner("s-lowbal", FRESH_CREDS);
    expect(n!.body).toContain("balance low");
    expect(n!.body).toContain("$1.13");
    expect(n!.body).toContain("Connected to org acme"); // merged, not replacing
    expect(n!.userVisibleOnly).toBe(true);              // never the model channel
  });

  it("does NOT add a balance line when balance is healthy or unknown", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 2, memoryRecallCount: 1, memorySearchBytes: 4_000 },
      user: { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 4_000 },
      balanceCents: 5_000,
    });
    expect((await pickPrimaryBanner("s-ok", FRESH_CREDS))!.body).not.toContain("balance low");
    orgStatsMock.mockResolvedValue(null); // unknown
    expect((await pickPrimaryBanner("s-unk", FRESH_CREDS))!.body).not.toContain("balance low");
  });

  it("drops comma-clause when userName is missing", async () => {
    const n = await pickPrimaryBanner("s-1", { ...FRESH_CREDS, userName: undefined });
    expect(n!.title).toBe("Welcome back");
    expect(n!.title).not.toContain("there");
    expect(n!.title).not.toContain(",");
  });

  it("uses 'your organization' fallback when orgName is missing (no UUID leak)", async () => {
    const n = await pickPrimaryBanner("s-1", { ...FRESH_CREDS, orgName: undefined });
    expect(n!.body).toContain("your organization");
    expect(n!.body).not.toContain(FRESH_CREDS.orgId);
    expect(n!.body).not.toContain("undefined");
  });

  it("uses 'default' workspace when workspaceId is missing", async () => {
    const n = await pickPrimaryBanner("s-1", { ...FRESH_CREDS, workspaceId: undefined });
    expect(n!.body).toContain("workspace default");
  });

  it("dedupKey is session-scoped (refires on a new sessionId)", async () => {
    const a = await pickPrimaryBanner("s-A", FRESH_CREDS);
    const b = await pickPrimaryBanner("s-B", FRESH_CREDS);
    expect(a!.dedupKey).toEqual({ session: "s-A" });
    expect(b!.dedupKey).toEqual({ session: "s-B" });
    expect(a!.dedupKey).not.toEqual(b!.dedupKey);
  });
});

describe("pickPrimaryBanner — savings recap (when org savings > 1k)", () => {
  it("renders online savings recap when org tokens-saved > 1k", async () => {
    // 6M bytes → Y = 1.5M tokens → Z = 0.7 × 1.5M = 1.05M → above 1M threshold
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 187, memoryRecallCount: 42000, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 22,  memoryRecallCount: 25,   memorySearchBytes: 400_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.title).toContain("your team");
    expect(n!.title).toContain("~1.1M tokens"); // 0.7 × 1.5M ≈ 1.05M → "1.1M"
    expect(n!.body).toContain("42,000 memory recalls");
    expect(n!.body).toContain("across 187 sessions");
    expect(n!.body).toContain("you contributed");
    // Regression: the trailing "saved" was awkward — "you contributed ~X saved"
    // dangled. The body shouldn't end with that word (title already says "saved").
    expect(n!.body).not.toMatch(/contributed ~\S+ saved\b/);
    expect(n!.dedupKey).toEqual({ session: "s-1" });
  });

  it("omits 'you contributed' segment when user bytes < 1k tokens (4k bytes)", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 100, memoryRecallCount: 1000, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1,  memoryRecallCount: 1,    memorySearchBytes: 100 }, // tiny
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).not.toContain("you contributed");
  });

  it("includes 'you contributed' segment when user bytes >= 4k", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 100, memoryRecallCount: 1000, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1,  memoryRecallCount: 1,    memorySearchBytes: 4_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).toContain("you contributed");
  });

  it("renders OFFLINE savings recap when org-stats is null but local jsonl > 1k tokens", async () => {
    // 6M local bytes → Z = 1.05M tokens → above threshold
    appendUsageRecord({
      endedAt: "2026-05-18T00:00:00Z",
      sessionId: "old-session",
      memorySearchBytes: 6_000_000,
      memorySearchCount: 200,
    });
    orgStatsMock.mockResolvedValue(null);
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.title).toContain("saved you ~"); // "you", not "your team"
    expect(n!.body).toContain("1 session");
    expect(n!.body).toContain("200 memory searches");
  });

  // The ONLINE recap pluralizes recall/session at lines 167-168 of
  // primary-banner.ts. The happy-path test above uses 42_000 / 187, which
  // only exercises the plural branch. This guards the singular path so a
  // future refactor that breaks "1 recall" / "1 session" rendering fails
  // here instead of slipping through coverage. Also exercises the
  // singular "1 skill generated" form via a single seeded skill dir, and
  // the `skillsGenerated > 0` path which the other tests don't trigger
  // (their tmp HOME has no .claude/skills dir at all).
  it("renders singular recall/session/skill when counts are exactly 1", async () => {
    // One skill dir owned by FRESH_CREDS.userName ("ada"). The function
    // matches `--<userName>` suffix, so naming the dir `something--ada`
    // makes countUserGeneratedSkills return 1.
    mkdirSync(join(TEMP_HOME, ".claude", "skills", "demo-skill--ada"), { recursive: true });

    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 4_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.body).toContain("1 memory recall");
    expect(n!.body).not.toContain("1 memory recalls");
    expect(n!.body).toContain("across 1 session");
    expect(n!.body).not.toContain("across 1 sessions");
    expect(n!.body).toContain("1 skill generated");
    expect(n!.body).not.toContain("1 skills generated");
  });

  // Counterpart to the singular case: with 3 seeded skill dirs the body
  // must say "3 skills" (plural). Guards the skillsGenerated === 1 ?
  // "skill" : "skills" branch on the > 1 side, which no test exercises
  // explicitly because the other recap tests have 0 skill dirs.
  it("renders plural skills when more than one skill is generated", async () => {
    for (const name of ["a--ada", "b--ada", "c--ada"]) {
      mkdirSync(join(TEMP_HOME, ".claude", "skills", name), { recursive: true });
    }
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 5, memoryRecallCount: 5, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 4_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).toContain("3 skills generated");
  });

  // OFFLINE counterpart: the existing offline test has sessionCount=1
  // (singular path) and memorySearchCount=200 (plural). This adds the
  // mirror case so both branches at lines 210/211 of primary-banner.ts
  // are covered.
  it("OFFLINE renders plural sessions and singular memory search", async () => {
    appendUsageRecord({
      endedAt: "2026-05-18T00:00:00Z",
      sessionId: "s-A",
      memorySearchBytes: 3_500_000,
      memorySearchCount: 1,
    });
    appendUsageRecord({
      endedAt: "2026-05-18T01:00:00Z",
      sessionId: "s-B",
      memorySearchBytes: 3_500_000,
      memorySearchCount: 0,
    });
    orgStatsMock.mockResolvedValue(null);
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.body).toContain("2 sessions");
    expect(n!.body).toContain("1 memory search");
    expect(n!.body).not.toContain("1 memory searches");
  });

  // Offline + skills > 0 path (lines 213-214 of primary-banner.ts).
  // The other offline test seeds no .claude/skills dir so the if-gate
  // stays false. Singular-skill flavor here.
  it("OFFLINE includes skill segment when exactly 1 skill is generated", async () => {
    mkdirSync(join(TEMP_HOME, ".claude", "skills", "demo--ada"), { recursive: true });
    appendUsageRecord({
      endedAt: "2026-05-18T00:00:00Z",
      sessionId: "s-skills-1",
      memorySearchBytes: 6_000_000,
      memorySearchCount: 10,
    });
    orgStatsMock.mockResolvedValue(null);
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.id).toBe("savings-recap");
    expect(n!.body).toContain("1 skill generated");
    expect(n!.body).not.toContain("1 skills generated");
  });

  // Offline + skills > 1 (plural side of the skillsGenerated === 1 ternary
  // at line 214). Pairs with the singular test above to lock both arms.
  it("OFFLINE renders plural skills when more than one skill is generated", async () => {
    for (const name of ["a--ada", "b--ada", "c--ada", "d--ada"]) {
      mkdirSync(join(TEMP_HOME, ".claude", "skills", name), { recursive: true });
    }
    appendUsageRecord({
      endedAt: "2026-05-18T00:00:00Z",
      sessionId: "s-skills-many",
      memorySearchBytes: 6_000_000,
      memorySearchCount: 10,
    });
    orgStatsMock.mockResolvedValue(null);
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).toContain("4 skills generated");
  });

  // Online with skills missing (lines 180 false branch): existing tests
  // never explicitly assert the "no skill segment" path even though most
  // of them implicitly hit it (HOME tmp dir has no .claude/skills).
  // Pinning it down here so a refactor that always appends the segment
  // would fail loudly instead of silently.
  it("renders no skill segment when no skills are generated", async () => {
    orgStatsMock.mockResolvedValue({
      org:  { sessionsCount: 5, memoryRecallCount: 5, memorySearchBytes: 6_000_000 },
      user: { sessionsCount: 1, memoryRecallCount: 1, memorySearchBytes: 4_000 },
    });
    const n = await pickPrimaryBanner("s-1", FRESH_CREDS);
    expect(n!.body).not.toContain("skill");
    expect(n!.body).not.toContain("skills");
  });
});

describe("formatTokens", () => {
  it("0 / negative / non-finite → '0'", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(-5)).toBe("0");
    expect(formatTokens(NaN)).toBe("0");
  });
  it("sub-thousand → integer", () => {
    expect(formatTokens(999)).toBe("999");
  });
  it("thousands with one decimal up to 100k", () => {
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(99499)).toBe("99.5k");
  });
  it(">=100k → integer thousands without decimals", () => {
    expect(formatTokens(123456)).toBe("123k");
  });
  it("millions with one decimal", () => {
    expect(formatTokens(1500000)).toBe("1.5M");
  });
});
