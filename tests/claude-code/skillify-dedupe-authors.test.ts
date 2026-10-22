import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runPull, retiredChains, selectLatestPerName, type QueryFn } from "../../src/skillify/pull.js";
import { loadManifest, recordPull } from "../../src/skillify/manifest.js";
import { renderExistingSkillsBlock } from "../../src/skillify/existing-skills.js";
import { isOwnSkill } from "../../src/skillify/ownership.js";
import {
  buildMergePrompt, mergeAuthorDuplicates, parseMergeVerdict, type MergeFn, type MergeInput,
} from "../../src/skillify/dedupe-authors.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

// Two authors, one skill name: dedupe merges them into one chain. The
// survivor keeps its author; every merged author becomes a contributor, so
// pull treats the survivor as "own" for each of them and retires the rest.

let projectCwd: string;
let fakeHome: string;

beforeEach(() => {
  projectCwd = mkdtempSync(join(tmpdir(), "skillify-authors-project-"));
  fakeHome = mkdtempSync(join(tmpdir(), "skillify-authors-home-"));
  setFakeHome(fakeHome);
});

afterEach(() => {
  clearFakeHome();
  rmSync(projectCwd, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

const globalRoot = () => join(fakeHome, ".claude", "skills");
const projectRoot = () => join(projectCwd, ".claude", "skills");

function skillFile(name: string, author: string, version: number, body = "body", contributors: string[] = [author]): string {
  const contribs = contributors.map(c => `  - ${c}`).join("\n");
  return `---\nname: ${name}\ndescription: "d ${author}"\nauthor: ${author}\nsource_sessions:\n  - s-${author}\ncontributors:\n${contribs}\nversion: ${version}\ncreated_by_agent: x\ncreated_at: 2026-01-01T00:00:00.000Z\nupdated_at: 2026\n---\n\n${body}\n`;
}

function writeSkill(root: string, dirName: string, name: string, author: string, version: number, body = "body", contributors?: string[]): void {
  mkdirSync(join(root, dirName), { recursive: true });
  writeFileSync(join(root, dirName, "SKILL.md"), skillFile(name, author, version, body, contributors));
}

function recordGlobal(dirName: string, name: string, author: string, version: number): void {
  recordPull({
    dirName, name, rawName: name, author, projectKey: "pk", remoteVersion: version,
    install: "global", installRoot: globalRoot(), pulledAt: "2026", symlinks: [],
  });
}

const mergeOk: MergeFn = async () => ({
  verdict: "MERGE", description: "merged d", trigger: "Use this skill when deploying", body: "merged body",
});

interface FakeTable { query: QueryFn; inserts: string[]; remoteVersion?: number }

function fakeTable(): FakeTable {
  const t: FakeTable = { inserts: [], query: async () => [] };
  t.query = async (sql) => {
    if (/^INSERT/i.test(sql)) { t.inserts.push(sql); return []; }
    if (t.remoteVersion === undefined) return [];
    return [{ name: "deploy", author: "alice", project: "p", project_key: "pk", version: t.remoteVersion, contributors: "[]", source_sessions: "[]", install: "global", scope: "me" }];
  };
  return t;
}

describe("ownership", () => {
  it("a contributor owns the skill like the author does", () => {
    expect(isOwnSkill("alice", "alice")).toBe(true);
    expect(isOwnSkill("alice", "bob", ["bob", "alice"])).toBe(true);
    expect(isOwnSkill("alice", "bob", ["bob"])).toBe(false);
    expect(isOwnSkill(undefined, "alice")).toBe(false);
  });
});

describe("dedupe: same name, several authors", () => {
  it("merges two authors into the user's own slot, records one row on the survivor chain, removes the copy", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3, "alice body");
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2, "bob body");
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    const q = fakeTable();
    let input: MergeInput | undefined;
    const out = await mergeAuthorDuplicates({
      myUsername: "alice", cwd: projectCwd, query: q.query, tableName: "skills", workspaceId: "ws",
      merge: async (i) => { input = i; return mergeOk(i); }, now: () => "2026-02-02T00:00:00.000Z",
    });
    expect(out.map(e => [e.name, e.action, e.reason])).toEqual([["deploy", "merged", "authors alice, bob -> alice v4"]]);
    expect(input!.candidates.map(c => [c.author, c.version])).toEqual([["alice", 3], ["bob", 2]]);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    const text = readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8");
    expect(text).toContain("merged body");
    expect(text).toContain("author: alice");
    expect(text).toContain("version: 4");
    expect(text).toMatch(/contributors:\n  - alice\n  - bob\n/);
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md.bak"), "utf-8")).toContain("alice body");
    expect(loadManifest().entries).toEqual([]);
    expect(q.inserts).toHaveLength(1);
    expect(q.inserts[0]).toContain("'alice'");
    expect(q.inserts[0]).toContain(`'["alice","bob"]'`);
    expect(q.inserts[0]).toMatch(/'team'/);
    expect(q.inserts[0]).toMatch(/, 4, /);
  });

  it("the survivor is the highest version, also when it is a teammate's chain", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 1, "alice body");
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 5, "bob body");
    recordGlobal("deploy--bob", "deploy", "bob", 5);
    const q = fakeTable();
    const out = await mergeAuthorDuplicates({
      myUsername: "alice", cwd: projectCwd, query: q.query, tableName: "skills", workspaceId: "ws", merge: mergeOk,
    });
    expect(out[0].reason).toBe("authors alice, bob -> bob v6");
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    const text = readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8");
    expect(text).toContain("author: bob");
    expect(text).toMatch(/contributors:\n  - bob\n  - alice\n/);
    // The slot now holds a teammate's chain: pull-managed, so unpull can remove it.
    expect(loadManifest().entries.map(e => [e.dirName, e.author, e.remoteVersion])).toEqual([["deploy", "bob", 6]]);
    expect(q.inserts[0]).toContain("'bob'");
  });

  it("a version tie goes to the user's own chain", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 2);
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2);
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    const out = await mergeAuthorDuplicates({ myUsername: "alice", cwd: projectCwd, merge: mergeOk });
    expect(out[0].reason).toBe("authors alice, bob -> alice v3 (local only)");
  });

  it("uses the remote version when the table is ahead of the local file", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3);
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 1);
    recordGlobal("deploy--bob", "deploy", "bob", 1);
    const q = fakeTable();
    q.remoteVersion = 7;
    const out = await mergeAuthorDuplicates({
      myUsername: "alice", cwd: projectCwd, query: q.query, tableName: "skills", workspaceId: "ws", merge: mergeOk,
    });
    expect(out[0].reason).toBe("authors alice, bob -> alice v8");
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8")).toContain("version: 8");
  });

  it("DISTINCT keeps both skills", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3);
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2);
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    const q = fakeTable();
    const out = await mergeAuthorDuplicates({
      myUsername: "alice", cwd: projectCwd, query: q.query, tableName: "skills", workspaceId: "ws",
      merge: async () => ({ verdict: "DISTINCT" }),
    });
    expect(out.map(e => [e.action, e.reason])).toEqual([["kept", "distinct skills"]]);
    expect(readdirSync(globalRoot()).sort()).toEqual(["deploy", "deploy--bob"]);
    expect(q.inserts).toEqual([]);
  });

  it("dry-run plans the merge without a merge call or a write", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3);
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2);
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    let calls = 0;
    const out = await mergeAuthorDuplicates({
      myUsername: "alice", cwd: projectCwd, dryRun: true, merge: async () => { calls++; return mergeOk({} as MergeInput); },
    });
    expect(calls).toBe(0);
    expect(out.map(e => [e.action, e.dryRun, e.reason])).toEqual([["merged", true, "authors alice, bob -> alice v4"]]);
    expect(readdirSync(globalRoot()).sort()).toEqual(["deploy", "deploy--bob"]);
  });

  it("writes the merged skill into the project slot when the user's copy lives there", async () => {
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 3, "alice body");
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2);
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    await mergeAuthorDuplicates({ myUsername: "alice", cwd: projectCwd, merge: mergeOk });
    expect(readFileSync(join(projectRoot(), "deploy", "SKILL.md"), "utf-8")).toContain("merged body");
    expect(readdirSync(globalRoot())).toEqual([]);
  });

  it("creates the global slot when the user owns none of the copies", async () => {
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2);
    writeSkill(globalRoot(), "deploy--carol", "deploy", "carol", 4);
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    recordGlobal("deploy--carol", "deploy", "carol", 4);
    const out = await mergeAuthorDuplicates({ myUsername: "alice", cwd: projectCwd, merge: mergeOk });
    expect(out[0].reason).toBe("authors bob, carol -> carol v5 (local only)");
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    const text = readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8");
    expect(text).toMatch(/contributors:\n  - carol\n  - bob\n  - alice\n/);
    expect(loadManifest().entries.map(e => e.dirName)).toEqual(["deploy"]);
  });

  it("a merge failure is reported and nothing changes", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3);
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 2);
    recordGlobal("deploy--bob", "deploy", "bob", 2);
    const out = await mergeAuthorDuplicates({
      myUsername: "alice", cwd: projectCwd, merge: async () => { throw new Error("no CLI"); },
    });
    expect(out.map(e => [e.action, e.reason])).toEqual([["failed", "merge: no CLI"]]);
    expect(readdirSync(globalRoot()).sort()).toEqual(["deploy", "deploy--bob"]);
  });

  it("one author with several copies is not a candidate", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3);
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 2);
    expect(await mergeAuthorDuplicates({ myUsername: "alice", cwd: projectCwd, merge: mergeOk })).toEqual([]);
  });
});

describe("merge prompt and verdict", () => {
  it("the prompt lists every candidate with author and version and asks for JSON", () => {
    const p = buildMergePrompt({ name: "deploy", candidates: [
      { author: "alice", version: 3, description: "a", body: "A" },
      { author: "bob", version: 2, description: "b", trigger: "Use this skill when b", body: "B" },
    ] });
    expect(p).toContain('named "deploy"');
    expect(p).toContain("[author=alice, v3]");
    expect(p).toContain("[author=bob, v2]");
    expect(p).toContain("trigger: Use this skill when b");
    expect(p).toContain('"verdict": "MERGE" | "DISTINCT"');
  });

  it("parses fenced and bare JSON, rejects MERGE without a body", () => {
    expect(parseMergeVerdict('```json\n{"verdict":"DISTINCT"}\n```')).toEqual({ verdict: "DISTINCT" });
    expect(parseMergeVerdict('ok {"verdict":"MERGE","body":"x"} done')).toMatchObject({ verdict: "MERGE", body: "x" });
    expect(parseMergeVerdict('{"verdict":"MERGE"}')).toBeNull();
    expect(parseMergeVerdict('{"verdict":"KEEP"}')).toBeNull();
    expect(parseMergeVerdict("nothing")).toBeNull();
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  name: "deploy", project: "p", project_key: "pk", body: "remote body", version: 3,
  source_agent: "claude_code", scope: "me", author: "alice", description: "d", contributors: '["alice"]',
  trigger_text: "", source_sessions: "[]", install: "global",
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026", ...over,
});

const pull = (rows: Record<string, unknown>[], over: Record<string, unknown> = {}) => runPull({
  query: (async () => rows) as QueryFn, tableName: "skills", install: "global", users: [],
  selfAuthor: "alice", projectCwd, ...over,
});

describe("pull: chains after a cross-author merge", () => {
  it("selectLatestPerName keeps one row per author under the same name", () => {
    const out = selectLatestPerName([
      row({ author: "alice", version: 3 }), row({ author: "alice", version: 2 }), row({ author: "bob", version: 1 }),
    ]);
    expect(out.map(r => [r.author, r.version])).toEqual([["alice", 3], ["bob", 1]]);
  });

  it("retires a chain whose author is a contributor on a newer same-name row", () => {
    const mine = row({ author: "alice", version: 3 });
    const theirs = row({ author: "bob", version: 6, contributors: '["bob","alice"]', created_at: "2026-02-02T00:00:00.000Z" });
    const other = row({ author: "carol", version: 1, created_at: "2026-03-03T00:00:00.000Z" });
    const retired = retiredChains([mine, theirs, other]);
    expect([...retired.entries()].map(([r, s]) => [r.author, s])).toEqual([["alice", "bob"]]);
  });

  it("does not retire a chain that is newer than the row that lists its author", () => {
    const mine = row({ author: "alice", version: 9, created_at: "2026-05-05T00:00:00.000Z" });
    const theirs = row({ author: "bob", version: 6, contributors: '["bob","alice"]', created_at: "2026-02-02T00:00:00.000Z" });
    expect(retiredChains([mine, theirs]).size).toBe(0);
  });

  it("skips the retired chain and installs the survivor into the <name> slot, replacing my old chain with a .bak", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3, "my old body");
    const summary = await pull([
      row({ author: "alice", version: 3 }),
      row({ author: "bob", version: 6, body: "survivor body", contributors: '["bob","alice"]', created_at: "2026-02-02T00:00:00.000Z" }),
    ]);
    expect(summary.entries.map(e => [e.author, e.action, e.destination.startsWith("(merged into") ? e.destination : "file"]))
      .toEqual([["alice", "skipped", "(merged into bob)"], ["bob", "wrote", "file"]]);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8")).toContain("survivor body");
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md.bak"), "utf-8")).toContain("my old body");
    expect(loadManifest().entries.map(e => [e.dirName, e.author])).toEqual([["deploy", "bob"]]);
  });

  it("installs a teammate's row that lists me as a contributor into the <name> slot", async () => {
    const summary = await pull([row({ author: "bob", version: 2, contributors: '["bob","alice"]' })]);
    expect(summary.wrote).toBe(1);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
  });

  it("keeps <name>--<author> for a teammate's row that does not list me", async () => {
    await pull([row({ author: "bob", version: 2, contributors: '["bob"]' })]);
    expect(readdirSync(globalRoot())).toEqual(["deploy--bob"]);
  });

  it("does not skip a survivor because a project copy by another author has a higher version", async () => {
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 9, "my project body");
    const summary = await pull([row({ author: "bob", version: 2, contributors: '["bob","alice"]' })]);
    expect(summary.wrote).toBe(1);
    expect(existsSync(join(globalRoot(), "deploy", "SKILL.md"))).toBe(true);
  });
});

describe("gate: a skill that lists me as a contributor is a merge target", () => {
  it("offers a teammate's global copy under its real name when I am a contributor", () => {
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 6, "body", ["bob", "alice"]);
    const result = renderExistingSkillsBlock(projectCwd, 100_000, "alice");
    expect(result.mergeTargetNames).toEqual(["deploy"]);
    expect(result.mergeTargets.deploy).toMatchObject({ install: "global", dirName: "deploy--bob" });
    expect(result.block).toContain("[global, author=bob]: deploy");
  });

  it("keeps a teammate's global copy read-only when I am not a contributor", () => {
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 6, "body", ["bob"]);
    const result = renderExistingSkillsBlock(projectCwd, 100_000, "alice");
    expect(result.mergeTargetNames).toEqual([]);
    expect(result.block).toContain("[global, read-only, author=bob]: deploy--bob");
  });
});
