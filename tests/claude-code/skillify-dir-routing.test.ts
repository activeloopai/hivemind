import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * `hivemind skillify push`/`pull` must route to the directory's `.hivemind`
 * workspace, exactly like session capture does — otherwise a skill saved from a
 * routed repo lands in the GLOBAL workspace (the bug DevOps hit: "saved a local
 * skill, it appeared in the default workspace"). skillify.ts used `loadConfig()`
 * raw with no `.hivemind` overlay; these tests pin the fix by asserting WHICH
 * workspace the DeeplakeApi was constructed against — that URL path is where the
 * write lands (deeplake-api.ts: /workspaces/{workspaceId}/tables/query).
 *
 * resolveDirConfig runs for REAL against the process cwd; only the config
 * boundary and the API transport are mocked.
 */

const h = vi.hoisted(() => ({
  ctorWorkspaces: [] as string[],
  loadConfigMock: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({ loadConfig: h.loadConfigMock }));
vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    constructor(_token: string, _apiUrl: string, _orgId: string, workspaceId: string) {
      h.ctorWorkspaces.push(workspaceId);
    }
    async query() { return []; }
  },
}));

import { runSkillifyCommand } from "../../src/commands/skillify.js";

const GLOBAL_CONFIG = {
  token: "tok", apiUrl: "https://api.test", orgId: "org", workspaceId: "global-ws",
  userName: "tester", skillsTableName: "skills", codebaseTableName: "codebase",
  tableName: "memory", sessionsTableName: "sessions", memoryPath: "/m", orgName: "org",
};

let root: string;
let originalCwd: string;

function hivemind(dir: string, body: unknown): void {
  writeFileSync(join(dir, ".hivemind"), JSON.stringify(body));
}

function writeSkill(dir: string, name: string): void {
  const skillDir = join(dir, ".claude", "skills", name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    ["---", `name: ${name}`, "description: a test skill", "version: 1", "author: tester", "---", "", "body", ""].join("\n"),
  );
}

beforeEach(() => {
  originalCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), "hivemind-skillify-route-"));
  h.ctorWorkspaces.length = 0;
  h.loadConfigMock.mockReset().mockReturnValue(GLOBAL_CONFIG);
  delete process.env.HIVEMIND_ORG_ID;
  delete process.env.HIVEMIND_WORKSPACE_ID;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("skillify push routes through .hivemind", () => {
  it("pushes to the directory's routed workspace, not the global one", async () => {
    hivemind(root, { workspaceId: "workspace2" });
    writeSkill(root, "my-skill");
    process.chdir(root);
    await runSkillifyCommand(["push", "my-skill", "--from", "project"]);
    expect(h.ctorWorkspaces).toContain("workspace2");
    expect(h.ctorWorkspaces).not.toContain("global-ws");
  });

  it("inherits the workspace from an ancestor .hivemind", async () => {
    hivemind(root, { workspaceId: "client-work" });
    const leaf = join(root, "svc", "deep");
    mkdirSync(leaf, { recursive: true });
    writeSkill(leaf, "my-skill");
    process.chdir(leaf);
    await runSkillifyCommand(["push", "my-skill", "--from", "project"]);
    expect(h.ctorWorkspaces).toContain("client-work");
  });

  it("still routes push under collect:false — collect gates capture, not identity", async () => {
    hivemind(root, { workspaceId: "client-work", collect: false });
    writeSkill(root, "my-skill");
    process.chdir(root);
    await runSkillifyCommand(["push", "my-skill", "--from", "project"]);
    expect(h.ctorWorkspaces).toContain("client-work");
  });

  it("falls back to the global workspace when no .hivemind applies", async () => {
    writeSkill(root, "my-skill");
    process.chdir(root);
    await runSkillifyCommand(["push", "my-skill", "--from", "project"]);
    expect(h.ctorWorkspaces).toContain("global-ws");
  });
});

describe("skillify pull routes through .hivemind", () => {
  it("pulls from the directory's routed workspace", async () => {
    hivemind(root, { workspaceId: "workspace2" });
    process.chdir(root);
    await runSkillifyCommand(["pull"]);
    expect(h.ctorWorkspaces).toContain("workspace2");
    expect(h.ctorWorkspaces).not.toContain("global-ws");
  });

  it("falls back to the global workspace with no .hivemind", async () => {
    process.chdir(root);
    await runSkillifyCommand(["pull"]);
    expect(h.ctorWorkspaces).toContain("global-ws");
  });
});
