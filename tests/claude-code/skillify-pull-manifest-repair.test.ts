import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const recordPullMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/skillify/manifest.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/skillify/manifest.js")>("../../src/skillify/manifest.js");
  return { ...actual, recordPull: (...args: Parameters<typeof actual.recordPull>) => recordPullMock(...args) };
});

const realManifest = await vi.importActual<typeof import("../../src/skillify/manifest.js")>("../../src/skillify/manifest.js");
const { runPull } = await import("../../src/skillify/pull.js");

let root: string;
let stateDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skillify-pull-repair-"));
  stateDir = mkdtempSync(join(tmpdir(), "skillify-pull-repair-state-"));
  process.env.HIVEMIND_STATE_DIR = stateDir;
  recordPullMock.mockReset().mockImplementation((...args: Parameters<typeof realManifest.recordPull>) => realManifest.recordPull(...args));
});

afterEach(() => {
  delete process.env.HIVEMIND_STATE_DIR;
  rmSync(root, { recursive: true, force: true });
  rmSync(stateDir, { recursive: true, force: true });
});

function row() {
  return {
    name: "repairable",
    project_key: "project-key",
    body: "body",
    version: 7,
    source_agent: "claude_code",
    author: "alice",
    description: "description",
    trigger_text: "",
    source_sessions: "[]",
    created_at: "2026-09-22T00:00:00.000Z",
    updated_at: "2026-09-22T00:00:00.000Z",
  };
}

function pull() {
  return runPull({
    query: async () => [row()],
    tableName: "skills",
    install: "project",
    cwd: root,
    users: [],
  });
}

describe("same-version pull manifest repair", () => {
  it("repairs a manifest-only failure without rewriting the published skill", async () => {
    recordPullMock.mockImplementationOnce(() => {
      throw new Error("simulated manifest rename failure");
    });

    const first = await pull();
    const skillFile = join(root, ".claude", "skills", "repairable--alice", "SKILL.md");
    const marker = join(root, ".claude", "skills", "repairable--alice", ".hivemind-pull-pending.json");
    const published = readFileSync(skillFile, "utf-8");
    expect(first.wrote).toBe(1);
    expect(first.entries[0].manifestError).toMatch(/rename failure/);
    expect(existsSync(marker)).toBe(true);

    const second = await pull();
    expect(second.skipped).toBe(1);
    expect(recordPullMock).toHaveBeenCalledTimes(2);
    expect(readFileSync(skillFile, "utf-8")).toBe(published);
    expect(existsSync(marker)).toBe(false);
    expect(realManifest.loadManifest().entries).toHaveLength(1);
  });

  it("does not adopt an equal-version unmanaged skill without the repair marker", async () => {
    const skillDir = join(root, ".claude", "skills", "repairable--alice");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"),
      "---\nname: repairable\nauthor: alice\nversion: 7\n---\n\nuser-owned body\n");

    const result = await pull();
    expect(result.skipped).toBe(1);
    expect(recordPullMock).not.toHaveBeenCalled();
    expect(realManifest.loadManifest().entries).toHaveLength(0);
    expect(readFileSync(join(skillDir, "SKILL.md"), "utf-8")).toContain("user-owned body");
  });
});
