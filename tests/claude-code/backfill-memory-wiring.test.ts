/**
 * Coverage for runBackfillMemory's REAL non-dry path: planBackfill →
 * runExtract → executeBackfill(defaultStageFn) → releaseBackfillLock.
 * local-source (session discovery) and stage-memory (the claude -p stager)
 * are vi.mock'd so the orchestration runs without touching disk history or
 * spawning claude.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;
const staged: string[] = [];

vi.mock("../../src/skillify/local-source.js", () => ({
  detectInstalledAgents: () => [{ agent: "claude_code", sessionRoot: "/x", encodeCwd: () => "x" }],
  listLocalSessions: () => [
    { agent: "claude_code", path: "/x/s1.jsonl", mtime: Date.now() - TEN_DAYS, inCwd: true, sessionId: "s1" },
    { agent: "codex", path: "/x/s2.jsonl", mtime: Date.now() - 2 * TEN_DAYS, inCwd: false, sessionId: "s2" },
  ],
}));
vi.mock("../../src/skillify/stage-memory.js", () => ({
  resolveClaudeBin: () => "/fake/claude",
  // planBackfill dedups via backfillSessionKey, so the mock must export it.
  backfillSessionKey: (agent: string, sessionId: string) => `${agent}-${sessionId}`,
  stageSession: async (input: { sessionId: string }) => {
    staged.push(input.sessionId);
    return { sessionId: input.sessionId, ok: true, embedded: false };
  },
}));

import { runBackfillMemory } from "../../src/commands/backfill-memory.js";

let writeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  staged.length = 0;
  writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});
afterEach(() => writeSpy.mockRestore());

describe("runBackfillMemory non-dry wiring", () => {
  it("plans + extracts via the real default stager and reports staged counts", async () => {
    const code = await runBackfillMemory([]); // non-dry, default cap
    expect(code).toBe(0);
    // defaultStageFn ran the (mocked) stageSession for both eligible sessions.
    expect(staged.sort()).toEqual(["s1", "s2"]);
    const printed = writeSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
    expect(printed).toContain("staged 2/2 session(s) (0 embedded, 0 failed)");
  });

  it("--project-only extracts only the in-cwd session (codex out-of-cwd excluded)", async () => {
    const code = await runBackfillMemory(["--project-only"]);
    expect(code).toBe(0);
    expect(staged).toContain("s1");
    expect(staged).not.toContain("s2"); // codex inCwd:false excluded
  });
});
