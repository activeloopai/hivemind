import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runPull, type QueryFn } from "../../src/skillify/pull.js";
import { loadManifest, recordPull } from "../../src/skillify/manifest.js";
import { renderExistingSkillsBlock } from "../../src/skillify/existing-skills.js";
import { mergeSkill } from "../../src/skillify/skill-writer.js";
import { runDedupe } from "../../src/skillify/dedupe.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

// One skill = one version chain. The user's own skill must never get a second
// dir (`<name>--<me>` beside `<name>`), and the gate must continue the chain
// of the user's own global copy instead of starting a new v1 under the name.

let projectCwd: string;
let fakeHome: string;

beforeEach(() => {
  projectCwd = mkdtempSync(join(tmpdir(), "skillify-chain-project-"));
  fakeHome = mkdtempSync(join(tmpdir(), "skillify-chain-home-"));
  setFakeHome(fakeHome);
});

afterEach(() => {
  clearFakeHome();
  rmSync(projectCwd, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

const globalRoot = () => join(fakeHome, ".claude", "skills");
const projectRoot = () => join(projectCwd, ".claude", "skills");

function skillFile(name: string, author: string, version: number, body = "body"): string {
  return `---\nname: ${name}\ndescription: "d"\nauthor: ${author}\nsource_sessions: []\nversion: ${version}\ncreated_by_agent: x\ncreated_at: 2026\nupdated_at: 2026\n---\n\n${body}\n`;
}

function writeSkill(root: string, dirName: string, name: string, author: string, version: number, body = "body"): void {
  mkdirSync(join(root, dirName), { recursive: true });
  writeFileSync(join(root, dirName, "SKILL.md"), skillFile(name, author, version, body));
}

function recordGlobal(dirName: string, name: string, author: string, version: number, symlinks: string[] = []): void {
  recordPull({
    dirName, name, rawName: name, author, projectKey: "pk", remoteVersion: version,
    install: "global", installRoot: globalRoot(), pulledAt: "2026", symlinks,
  });
}

const row = (over: Record<string, unknown> = {}) => ({
  name: "deploy", project: "p", project_key: "pk", body: "remote body", version: 3,
  source_agent: "claude_code", scope: "me", author: "alice", description: "d",
  trigger_text: "", source_sessions: "[]", install: "global",
  created_at: "2026", updated_at: "2026", ...over,
});

const query = (rows: Record<string, unknown>[]): QueryFn => async () => rows;

const pull = (rows: Record<string, unknown>[], over: Record<string, unknown> = {}) => runPull({
  query: query(rows), tableName: "skills", install: "global", users: [],
  selfAuthor: "alice", projectCwd, ...over,
});

describe("pull: own-author rows", () => {
  it("installs an own row into the <name> slot, not <name>--<me>", async () => {
    const summary = await pull([row()]);
    expect(summary.wrote).toBe(1);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(loadManifest().entries.map(e => e.dirName)).toEqual(["deploy"]);
  });

  it("does not create a second dir beside a locally-mined <name> at the same version", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 3, "local body");
    const summary = await pull([row()]);
    expect(summary.skipped).toBe(1);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8")).toContain("local body");
  });

  it("updates an older locally-mined <name> but never records it, so unpull cannot delete it", async () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 1, "local body");
    const summary = await pull([row()]);
    expect(summary.wrote).toBe(1);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8")).toContain("version: 3");
    expect(loadManifest().entries).toEqual([]);
  });

  it("skips an own row when the project copy has the same or a higher version", async () => {
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 4);
    const summary = await pull([row()]);
    expect(summary.skipped).toBe(1);
    expect(existsSync(globalRoot())).toBe(false);
  });

  it("moves a managed legacy <name>--<me> copy into the <name> slot", async () => {
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 3);
    recordGlobal("deploy--alice", "deploy", "alice", 3);
    await pull([row()]);
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(loadManifest().entries.map(e => e.dirName)).toEqual(["deploy"]);
  });

  it("keeps <name>--<author> for teammates", async () => {
    await pull([row({ author: "bob" })]);
    expect(readdirSync(globalRoot())).toEqual(["deploy--bob"]);
  });

  it("keeps the old layout when the caller does not pass selfAuthor", async () => {
    await pull([row()], { selfAuthor: undefined });
    expect(readdirSync(globalRoot())).toEqual(["deploy--alice"]);
  });
});

describe("gate: own global skill is a merge target", () => {
  it("offers the user's own pulled <name>--<me> copy under its real name", () => {
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 6);
    const block = renderExistingSkillsBlock(projectCwd, 100_000, "alice");
    expect(block.mergeTargetNames).toEqual(["deploy"]);
    expect(block.mergeTargets.deploy).toEqual({ install: "global", skillsRoot: globalRoot(), dirName: "deploy--alice" });
    expect(block.block).toContain("[global, author=alice]: deploy");
  });

  it("keeps a teammate's global skill read-only", () => {
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 6);
    const block = renderExistingSkillsBlock(projectCwd, 100_000, "alice");
    expect(block.mergeTargetNames).toEqual([]);
    expect(block.block).toContain("[global, read-only, author=bob]: deploy--bob");
  });

  it("picks the higher version when the project and global copies share a name", () => {
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 2);
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 7);
    const block = renderExistingSkillsBlock(projectCwd, 100_000, "alice");
    expect(block.mergeTargets.deploy.install).toBe("global");
  });

  it("a MERGE into the resolved target continues the chain at v+1", () => {
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 6);
    const target = renderExistingSkillsBlock(projectCwd, 100_000, "alice").mergeTargets.deploy;
    const result = mergeSkill({
      skillsRoot: target.skillsRoot, dirName: target.dirName, name: "deploy",
      body: "merged", newSourceSessions: ["s"], agent: "claude_code", editor: "alice",
    });
    expect(result.version).toBe(7);
    expect(readFileSync(join(globalRoot(), "deploy--alice", "SKILL.md"), "utf-8")).toMatch(/^name: deploy$/m);
  });
});

describe("dedupe", () => {
  it("dry-run reports and changes nothing", () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 5);
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5);
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    const out = runDedupe({ myUsername: "alice", cwd: projectCwd, dryRun: true });
    expect(out.map(e => [e.dirName, e.action])).toEqual([["deploy--alice", "removed"]]);
    expect(readdirSync(globalRoot()).sort()).toEqual(["deploy", "deploy--alice"]);
  });

  it("removes the copy and its fan-out link when a local <name> is at the same or a higher version", () => {
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 6);
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5);
    const link = join(fakeHome, ".agents", "skills", "deploy--alice");
    mkdirSync(join(fakeHome, ".agents", "skills"), { recursive: true });
    symlinkSync(join(globalRoot(), "deploy--alice"), link, "dir");
    recordGlobal("deploy--alice", "deploy", "alice", 5, [link]);
    runDedupe({ myUsername: "alice", cwd: projectCwd });
    expect(readdirSync(globalRoot())).toEqual([]);
    expect(() => lstatSync(link)).toThrow();
    expect(loadManifest().entries).toEqual([]);
  });

  it("moves the copy into the <name> slot when no local <name> exists", () => {
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5);
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    runDedupe({ myUsername: "alice", cwd: projectCwd });
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(loadManifest().entries.map(e => e.dirName)).toEqual(["deploy"]);
  });

  it("replaces an older global <name> with the newer copy and keeps a .bak", () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 2, "old");
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5, "new");
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    runDedupe({ myUsername: "alice", cwd: projectCwd });
    expect(readdirSync(globalRoot())).toEqual(["deploy"]);
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md"), "utf-8")).toContain("new");
    expect(readFileSync(join(globalRoot(), "deploy", "SKILL.md.bak"), "utf-8")).toContain("old");
  });

  it("keeps the copy when only an older project <name> exists", () => {
    writeSkill(projectRoot(), "deploy", "deploy", "alice", 2);
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5);
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    const out = runDedupe({ myUsername: "alice", cwd: projectCwd });
    expect(out.map(e => e.action)).toEqual(["kept"]);
    expect(readdirSync(globalRoot())).toEqual(["deploy--alice"]);
  });

  it("repairs a project-install copy within its own root", () => {
    writeSkill(projectRoot(), "deploy--alice", "deploy", "alice", 5);
    recordPull({
      dirName: "deploy--alice", name: "deploy", author: "alice", projectKey: "pk", remoteVersion: 5,
      install: "project", installRoot: projectRoot(), pulledAt: "2026", symlinks: [],
    });
    runDedupe({ myUsername: "alice", cwd: projectCwd });
    expect(readdirSync(projectRoot())).toEqual(["deploy"]);
  });

  it("keeps the copy when the <name> slot exists without a readable version", () => {
    mkdirSync(join(globalRoot(), "deploy"), { recursive: true });
    writeFileSync(join(globalRoot(), "deploy", "notes.txt"), "hand-made");
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5);
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    expect(runDedupe({ myUsername: "alice", cwd: projectCwd }).map(e => e.action)).toEqual(["kept"]);
    expect(readdirSync(globalRoot()).sort()).toEqual(["deploy", "deploy--alice"]);
  });

  it("reports a failed entry and goes on with the next one", () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 2);
    writeSkill(globalRoot(), "deploy--alice", "deploy", "alice", 5);
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    mkdirSync(join(globalRoot(), "deploy", "SKILL.md.bak"));
    writeSkill(globalRoot(), "build--alice", "build", "alice", 1);
    recordGlobal("build--alice", "build", "alice", 1);
    const out = runDedupe({ myUsername: "alice", cwd: projectCwd });
    expect(out.map(e => [e.dirName, e.action])).toEqual([["deploy--alice", "failed"], ["build--alice", "moved"]]);
    expect(existsSync(join(globalRoot(), "build", "SKILL.md"))).toBe(true);
  });

  it("skips a manifest entry whose copy is already gone", () => {
    recordGlobal("deploy--alice", "deploy", "alice", 5);
    expect(runDedupe({ myUsername: "alice", cwd: projectCwd })).toEqual([]);
  });

  it("never touches teammates' copies or unmanaged dirs", () => {
    writeSkill(globalRoot(), "deploy", "deploy", "alice", 9);
    writeSkill(globalRoot(), "deploy--bob", "deploy", "bob", 1);
    recordGlobal("deploy--bob", "deploy", "bob", 1);
    writeSkill(globalRoot(), "build--alice", "build", "alice", 1);
    expect(runDedupe({ myUsername: "alice", cwd: projectCwd })).toEqual([]);
    expect(readdirSync(globalRoot()).sort()).toEqual(["build--alice", "deploy", "deploy--bob"]);
  });
});
