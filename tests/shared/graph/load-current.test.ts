import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadCurrentSnapshot, workTreeIdFor } from "../../../src/graph/load-current.js";
import { repoDir } from "../../../src/graph/snapshot.js";
import { deriveProjectKey } from "../../../src/utils/repo-identity.js";

const ORIG = process.env.HIVEMIND_GRAPHS_HOME;
let graphsHome: string;
let cwd: string;

function baseDirFor(dir: string): string {
  return repoDir(deriveProjectKey(dir).key);
}

function writeLastBuild(dir: string, state: Record<string, unknown>): void {
  const p = join(baseDirFor(dir), "worktrees", workTreeIdFor(dir), ".last-build.json");
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(state));
}

function writeSnapshotFile(dir: string, fileBase: string, body: string): void {
  const snapDir = join(baseDirFor(dir), "snapshots");
  mkdirSync(snapDir, { recursive: true });
  writeFileSync(join(snapDir, `${fileBase}.json`), body);
}

beforeEach(() => {
  graphsHome = mkdtempSync(join(tmpdir(), "graphs-home-"));
  cwd = mkdtempSync(join(tmpdir(), "repo-"));
  process.env.HIVEMIND_GRAPHS_HOME = graphsHome;
});
afterEach(() => {
  if (ORIG === undefined) delete process.env.HIVEMIND_GRAPHS_HOME;
  else process.env.HIVEMIND_GRAPHS_HOME = ORIG;
  rmSync(graphsHome, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("loadCurrentSnapshot", () => {
  it("returns null when no graph has been built for the worktree", () => {
    expect(loadCurrentSnapshot(cwd)).toBeNull();
  });

  it("loads the snapshot the last build points at (keyed by commit_sha)", () => {
    writeLastBuild(cwd, { ts: 1, commit_sha: "abc123", snapshot_sha256: "deadbeef" });
    writeSnapshotFile(cwd, "abc123", JSON.stringify({ nodes: [{ id: "x" }], links: [] }));
    const snap = loadCurrentSnapshot(cwd);
    expect(snap).not.toBeNull();
    expect(snap!.nodes).toHaveLength(1);
  });

  it("falls back to snapshot_sha256 when there is no commit context", () => {
    writeLastBuild(cwd, { ts: 1, commit_sha: null, snapshot_sha256: "feedface" });
    writeSnapshotFile(cwd, "feedface", JSON.stringify({ nodes: [], links: [] }));
    expect(loadCurrentSnapshot(cwd)).not.toBeNull();
  });

  it("returns null when the snapshot file is missing on disk", () => {
    writeLastBuild(cwd, { ts: 1, commit_sha: "abc123", snapshot_sha256: "d" });
    // no snapshot file written
    expect(loadCurrentSnapshot(cwd)).toBeNull();
  });

  it("returns null when the snapshot json is malformed or structurally wrong", () => {
    writeLastBuild(cwd, { ts: 1, commit_sha: "abc123", snapshot_sha256: "d" });
    writeSnapshotFile(cwd, "abc123", "{ not valid json");
    expect(loadCurrentSnapshot(cwd)).toBeNull();

    writeSnapshotFile(cwd, "abc123", JSON.stringify({ nope: true }));
    expect(loadCurrentSnapshot(cwd)).toBeNull();
  });
});
