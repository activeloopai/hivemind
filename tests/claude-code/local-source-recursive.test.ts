/**
 * Regression tests for listLocalSessions' depth-agnostic walk.
 *
 * The original walk only descended ONE directory level, which matched
 * Claude's `projects/<enc-cwd>/<id>.jsonl` layout but silently yielded ZERO
 * sessions for Codex's `sessions/YYYY/MM/DD/rollout-*.jsonl` nesting (and
 * cursor/hermes). These tests pin the recursive behavior and the inCwd
 * anchoring so the backfill + mine-local both keep reaching nested agents.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listLocalSessions, type AgentInstall } from "../../src/skillify/local-source.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ls-recursive-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(p: string): void {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, "{}\n");
}

describe("listLocalSessions recursive walk", () => {
  it("finds Claude flat layout: <root>/<enc-cwd>/<id>.jsonl", () => {
    const encoded = "-home-admin-proj";
    mkdirSync(join(root, encoded), { recursive: true });
    touch(join(root, encoded, "s1.jsonl"));
    touch(join(root, encoded, "s2.jsonl"));

    const install: AgentInstall = {
      agent: "claude_code",
      sessionRoot: root,
      encodeCwd: () => encoded,
    };
    const found = listLocalSessions([install], "/home/admin/proj");
    expect(found.map((s) => s.sessionId).sort()).toEqual(["s1", "s2"]);
    // The encoded-cwd dir matches → inCwd true.
    expect(found.every((s) => s.inCwd)).toBe(true);
  });

  it("finds Codex deep layout: <root>/YYYY/MM/DD/rollout-*.jsonl", () => {
    touch(join(root, "2026", "06", "10", "rollout-2026-06-10-abc.jsonl"));
    touch(join(root, "2026", "05", "30", "rollout-2026-05-30-def.jsonl"));

    const install: AgentInstall = {
      agent: "codex",
      sessionRoot: root,
      encodeCwd: () => "__cwd_unknown__",
    };
    const found = listLocalSessions([install], "/anything");
    expect(found.map((s) => s.sessionId).sort()).toEqual([
      "rollout-2026-05-30-def",
      "rollout-2026-06-10-abc",
    ]);
    // Codex never matches an encoded cwd → inCwd false.
    expect(found.every((s) => !s.inCwd)).toBe(true);
    expect(found.every((s) => s.agent === "codex")).toBe(true);
  });

  it("inCwd is anchored on the TOP-LEVEL segment, not the file's parent", () => {
    // A nested file under the encoded-cwd top segment must still be inCwd.
    const encoded = "-home-admin-proj";
    touch(join(root, encoded, "sub", "deep.jsonl"));
    const install: AgentInstall = {
      agent: "claude_code",
      sessionRoot: root,
      encodeCwd: () => encoded,
    };
    const found = listLocalSessions([install], "/home/admin/proj");
    expect(found).toHaveLength(1);
    expect(found[0].sessionId).toBe("deep");
    expect(found[0].inCwd).toBe(true);
  });

  it("ignores non-jsonl files and tolerates unreadable dirs", () => {
    const encoded = "x";
    mkdirSync(join(root, encoded), { recursive: true });
    writeFileSync(join(root, encoded, "notes.txt"), "ignore me");
    touch(join(root, encoded, "ok.jsonl"));
    const install: AgentInstall = { agent: "claude_code", sessionRoot: root, encodeCwd: () => encoded };
    const found = listLocalSessions([install], "/x");
    expect(found.map((s) => s.sessionId)).toEqual(["ok"]);
  });
});
