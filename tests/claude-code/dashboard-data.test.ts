/**
 * Unit tests for the dashboard data layer. Mocks fetchOrgStats at the
 * module boundary (matches the pattern used in
 * notifications-primary-banner.test.ts) and uses HOME + graphsHome
 * overrides so no test touches the real user filesystem.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { orgStatsMock } = vi.hoisted(() => ({ orgStatsMock: vi.fn() }));
vi.mock("../../src/notifications/sources/org-stats.js", () => ({
  fetchOrgStats: orgStatsMock,
}));

import { loadDashboardData } from "../../src/dashboard/data.js";
import { workTreeIdFor } from "../../src/graph/load-current.js";
import { deriveProjectKey } from "../../src/skillify/state.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

function snapshotsDirFor(graphsHome: string, cwd: string): { repoDir: string; snapshotsDir: string } {
  const { key } = deriveProjectKey(cwd);
  const repoDir = join(graphsHome, key);
  return { repoDir, snapshotsDir: join(repoDir, "snapshots") };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function writeWorktreeBuild(
  graphsHome: string,
  cwd: string,
  state: { commit_sha: string | null; snapshot_sha256: string },
): void {
  const { repoDir } = snapshotsDirFor(graphsHome, cwd);
  const stateDir = join(repoDir, "worktrees", workTreeIdFor(cwd));
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, ".last-build.json"), JSON.stringify({ ts: 1, ...state }));
}

describe("loadDashboardData", () => {
  let graphsHome: string;
  let homeDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    graphsHome = mkdtempSync(join(tmpdir(), "hm-dash-graphs-"));
    homeDir = mkdtempSync(join(tmpdir(), "hm-dash-home-"));
    originalHome = process.env.HOME;
    setFakeHome(homeDir);
    orgStatsMock.mockReset();
    orgStatsMock.mockResolvedValue(null);
  });

  afterEach(() => {
    clearFakeHome();
    rmSync(graphsHome, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("returns graph=null when no snapshots/ dir exists for the repo", async () => {
    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).toBeNull();
    expect(result.kpis.tokensSource).toBe("none");
    expect(result.kpis.tokensSaved).toBeNull();
    expect(result.kpis.skillsCreated).toBe(0);
    expect(result.repoKey).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof result.repoProject).toBe("string");
  });

  it("loads snapshot pointed to by latest-commit.txt", async () => {
    const { repoDir, snapshotsDir } = snapshotsDirFor(graphsHome, "/tmp");
    mkdirSync(snapshotsDir, { recursive: true });
    const snapshot = {
      directed: true,
      multigraph: true,
      graph: { commit_sha: "abc123" },
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
      links: [
        { source: "a", target: "b", relation: "calls" },
        { source: "b", target: "c", relation: "imports" },
      ],
    };
    writeFileSync(join(snapshotsDir, "abc123.json"), JSON.stringify(snapshot));
    writeFileSync(join(repoDir, "latest-commit.txt"), "abc123\n");

    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).not.toBeNull();
    expect(result.graph!.nodeCount).toBe(3);
    expect(result.graph!.edgeCount).toBe(2);
    expect(result.graph!.commitSha).toBe("abc123");
    expect(result.graph!.snapshotPath.endsWith("abc123.json")).toBe(true);
    expect(result.graph!.snapshot).toEqual(snapshot);
  });

  it("falls back to newest snapshot when latest-commit.txt is missing", async () => {
    const { snapshotsDir } = snapshotsDirFor(graphsHome, "/tmp");
    mkdirSync(snapshotsDir, { recursive: true });
    const older = { directed: true, multigraph: true, graph: {}, nodes: [{ id: "x" }], links: [] };
    const newer = { directed: true, multigraph: true, graph: {}, nodes: [{ id: "y" }, { id: "z" }], links: [] };
    const olderPath = join(snapshotsDir, "older.json");
    const newerPath = join(snapshotsDir, "newer.json");
    writeFileSync(olderPath, JSON.stringify(older));
    // Force older to actually be older — same mtime causes deterministic
    // tiebreak ambiguity, which the test should not rely on.
    const past = new Date(Date.now() - 60_000);
    const futime = (path: string, when: Date) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { utimesSync } = require("node:fs");
      utimesSync(path, when, when);
    };
    futime(olderPath, past);
    writeFileSync(newerPath, JSON.stringify(newer));

    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).not.toBeNull();
    expect(result.graph!.nodeCount).toBe(2);
    expect(result.graph!.commitSha).toBeNull();
    expect(result.graph!.snapshotPath.endsWith("newer.json")).toBe(true);
  });

  it("falls back from a dangling latest-commit.txt to the snapshot scan", async () => {
    const { repoDir, snapshotsDir } = snapshotsDirFor(graphsHome, "/tmp");
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(join(repoDir, "latest-commit.txt"), "missing-sha\n");
    const snap = { directed: true, multigraph: true, graph: {}, nodes: [{ id: "p" }], links: [] };
    writeFileSync(join(snapshotsDir, "actual.json"), JSON.stringify(snap));

    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).not.toBeNull();
    expect(result.graph!.nodeCount).toBe(1);
    expect(result.graph!.snapshotPath.endsWith("actual.json")).toBe(true);
  });

  it("rejects a legacy pointer whose snapshot metadata names another commit", async () => {
    const { repoDir, snapshotsDir } = snapshotsDirFor(graphsHome, "/tmp");
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(join(repoDir, "latest-commit.txt"), "expected-head\n");
    writeFileSync(join(snapshotsDir, "expected-head.json"), JSON.stringify({
      graph: { commit_sha: "other-head" }, nodes: [{ id: "wrong" }], links: [],
    }));

    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).toBeNull();
  });

  it("uses this worktree's build pointer instead of a newer sibling snapshot", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "hm-dash-git-"));
    const sibling = join(fixtureRoot, "feature");
    try {
      mkdirSync(join(fixtureRoot, "src"), { recursive: true });
      git(fixtureRoot, "init", "-b", "main");
      git(fixtureRoot, "config", "user.email", "test@example.invalid");
      git(fixtureRoot, "config", "user.name", "Dashboard Test");
      git(fixtureRoot, "remote", "add", "origin", "https://example.invalid/acme/repo.git");
      writeFileSync(join(fixtureRoot, "src", "main.ts"), "export const main = 1;\n");
      git(fixtureRoot, "add", ".");
      git(fixtureRoot, "commit", "-m", "main");
      const mainSha = git(fixtureRoot, "rev-parse", "HEAD");
      git(fixtureRoot, "branch", "feature");
      git(fixtureRoot, "worktree", "add", sibling, "feature");
      writeFileSync(join(sibling, "src", "feature.ts"), "export const feature = 1;\n");
      git(sibling, "add", ".");
      git(sibling, "commit", "-m", "feature");
      const featureSha = git(sibling, "rev-parse", "HEAD");

      const mainInfo = snapshotsDirFor(graphsHome, fixtureRoot);
      const repoKey = deriveProjectKey(fixtureRoot).key;
      mkdirSync(mainInfo.snapshotsDir, { recursive: true });
      writeFileSync(join(mainInfo.snapshotsDir, `${mainSha}.json`), JSON.stringify({
        directed: true, multigraph: true,
        graph: { commit_sha: mainSha, repo_key: repoKey },
        nodes: [{ id: "main" }], links: [],
      }));
      writeFileSync(join(mainInfo.snapshotsDir, `${featureSha}.json`), JSON.stringify({
        directed: true, multigraph: true,
        graph: { commit_sha: featureSha, repo_key: repoKey },
        nodes: [{ id: "feature" }, { id: "newer" }], links: [],
      }));
      writeWorktreeBuild(graphsHome, fixtureRoot, { commit_sha: mainSha, snapshot_sha256: "a".repeat(64) });
      writeWorktreeBuild(graphsHome, sibling, { commit_sha: featureSha, snapshot_sha256: "b".repeat(64) });

      const result = await loadDashboardData({ cwd: fixtureRoot, graphsHome, creds: null });
      expect(result.graph?.commitSha).toBe(mainSha);
      expect(result.graph?.nodeCount).toBe(1);
      expect(result.graph?.snapshotPath).toContain(`${mainSha}.json`);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("does not select a sibling when this worktree pointer is stale or identity-mismatched", async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "hm-dash-stale-"));
    try {
      const { repoDir, snapshotsDir } = snapshotsDirFor(graphsHome, fixtureRoot);
      mkdirSync(snapshotsDir, { recursive: true });
      const repoKey = deriveProjectKey(fixtureRoot).key;
      writeFileSync(join(snapshotsDir, "foreign.json"), JSON.stringify({
        graph: { commit_sha: "foreign", repo_key: "different-repo" },
        nodes: [{ id: "foreign" }], links: [],
      }));
      writeWorktreeBuild(graphsHome, fixtureRoot, { commit_sha: "missing", snapshot_sha256: "c".repeat(64) });

      const stale = await loadDashboardData({ cwd: fixtureRoot, graphsHome, creds: null });
      expect(stale.graph).toBeNull();

      writeFileSync(join(snapshotsDir, "missing.json"), JSON.stringify({
        graph: { commit_sha: "other-head", repo_key: repoKey },
        nodes: [{ id: "wrong-head" }], links: [],
      }));
      const mismatched = await loadDashboardData({ cwd: fixtureRoot, graphsHome, creds: null });
      expect(mismatched.graph).toBeNull();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("keeps a commitless non-git snapshot addressable through its worktree state", async () => {
    const loose = mkdtempSync(join(tmpdir(), "hm-dash-loose-"));
    try {
      const { repoDir, snapshotsDir } = snapshotsDirFor(graphsHome, loose);
      mkdirSync(snapshotsDir, { recursive: true });
      const repoKey = deriveProjectKey(loose).key;
      const hash = "d".repeat(64);
      writeFileSync(join(snapshotsDir, `${hash}.json`), JSON.stringify({
        graph: { commit_sha: null, repo_key: repoKey },
        nodes: [{ id: "loose" }], links: [],
      }));
      writeWorktreeBuild(graphsHome, loose, { commit_sha: null, snapshot_sha256: hash });
      const result = await loadDashboardData({ cwd: loose, graphsHome, creds: null });
      expect(result.graph?.commitSha).toBeNull();
      expect(result.graph?.nodeCount).toBe(1);
    } finally {
      rmSync(loose, { recursive: true, force: true });
    }
  });

  it("rejects malformed snapshot shape gracefully (no nodes/links arrays)", async () => {
    const { snapshotsDir } = snapshotsDirFor(graphsHome, "/tmp");
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(join(snapshotsDir, "bad.json"), JSON.stringify({ hello: "world" }));

    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).toBeNull();
  });

  it("rejects unparseable snapshot JSON gracefully", async () => {
    const { snapshotsDir } = snapshotsDirFor(graphsHome, "/tmp");
    mkdirSync(snapshotsDir, { recursive: true });
    writeFileSync(join(snapshotsDir, "garbled.json"), "{ not valid json");

    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.graph).toBeNull();
  });

  it("uses org stats when fetchOrgStats returns data", async () => {
    orgStatsMock.mockResolvedValue({
      org: { sessionsCount: 5, memoryRecallCount: 100, memorySearchBytes: 40_000 },
      user: { sessionsCount: 2, memoryRecallCount: 50, memorySearchBytes: 20_000 },
    });
    const result = await loadDashboardData({
      cwd: "/tmp",
      graphsHome,
      creds: { token: "t", orgId: "o", userName: "user", savedAt: "2026-01-01T00:00:00Z" },
    });
    expect(result.kpis.tokensSource).toBe("org");
    // 40000 / 4 = 10000 delivered; 0.7 * 10000 = 7000 saved
    expect(result.kpis.tokensSaved).toBe(7000);
    expect(result.kpis.memorySearches).toBe(100);
    expect(result.kpis.sessionsCount).toBe(5);
    // 20000 / 4 = 5000 delivered; 0.7 * 5000 = 3500 saved
    expect(result.kpis.userTokensSaved).toBe(3500);
  });

  it("falls back to local stats when fetchOrgStats returns null", async () => {
    orgStatsMock.mockResolvedValue(null);
    mkdirSync(join(homeDir, ".deeplake"), { recursive: true });
    const records = [
      { endedAt: "2026-01-01T00:00:00Z", sessionId: "a", memorySearchBytes: 8_000, memorySearchCount: 4 },
      { endedAt: "2026-01-02T00:00:00Z", sessionId: "b", memorySearchBytes: 4_000, memorySearchCount: 2 },
    ];
    writeFileSync(
      join(homeDir, ".deeplake", "usage-stats.jsonl"),
      records.map(r => JSON.stringify(r)).join("\n") + "\n",
    );

    const result = await loadDashboardData({
      cwd: "/tmp",
      graphsHome,
      creds: { token: "t", orgId: "o", savedAt: "x" },
    });
    expect(result.kpis.tokensSource).toBe("local");
    // (8000 + 4000) / 4 = 3000 delivered; 0.7 * 3000 = 2100 saved
    expect(result.kpis.tokensSaved).toBe(2100);
    expect(result.kpis.memorySearches).toBe(6);
    expect(result.kpis.sessionsCount).toBe(2);
    expect(result.kpis.userTokensSaved).toBe(2100);
  });

  it("returns tokensSource='none' when no creds and no local records", async () => {
    const result = await loadDashboardData({ cwd: "/tmp", graphsHome, creds: null });
    expect(result.kpis.tokensSource).toBe("none");
    expect(result.kpis.tokensSaved).toBeNull();
    expect(result.kpis.userTokensSaved).toBeNull();
    expect(result.kpis.sessionsCount).toBeNull();
  });

  it("treats a fetchOrgStats throw as 'no org data' instead of crashing", async () => {
    orgStatsMock.mockRejectedValue(new Error("boom"));
    const result = await loadDashboardData({
      cwd: "/tmp",
      graphsHome,
      creds: { token: "t", orgId: "o", savedAt: "x" },
    });
    // No local records either => "none"
    expect(result.kpis.tokensSource).toBe("none");
  });

  it("does NOT call fetchOrgStats when creds lack a token", async () => {
    await loadDashboardData({
      cwd: "/tmp",
      graphsHome,
      creds: { token: "", orgId: "o", savedAt: "x" },
    });
    expect(orgStatsMock).not.toHaveBeenCalled();
  });
});
