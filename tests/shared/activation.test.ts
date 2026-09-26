import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../src/config.js";
import {
  getActivationMode,
  isHivemindActive,
  parseActivationMode,
  resolveActivation,
  setActivationMode,
} from "../../src/activation.js";
import { parseDirConfig, resolveDirConfig } from "../../src/dir-config.js";
import { _setConfigPathForTesting, _resetUserConfigForTesting } from "../../src/user-config.js";
import { runActivationCommand } from "../../src/commands/activation.js";
import { resolveCursorCwd } from "../../src/hooks/cursor/cwd.js";

let root: string;
let cfgPath: string;
let savedEnv: string | undefined;

function base(): Config {
  return {
    token: "tok",
    orgId: "global-org",
    orgName: "global",
    userName: "u",
    workspaceId: "default",
    apiUrl: "https://api.deeplake.ai",
    tableName: "memory",
    sessionsTableName: "sessions",
    skillsTableName: "skills",
    rulesTableName: "hivemind_rules",
    goalsTableName: "hivemind_goals",
    codebaseTableName: "codebase",
    docsTableName: "docs",
    memoryPath: "/tmp/mem",
  };
}

function dir(...segs: string[]): string {
  const p = join(root, ...segs);
  mkdirSync(p, { recursive: true });
  return p;
}

function write(dirPath: string, name: string, body: unknown): void {
  writeFileSync(join(dirPath, name), typeof body === "string" ? body : JSON.stringify(body));
}

function setMode(mode: string | null): void {
  writeFileSync(cfgPath, JSON.stringify(mode === null ? {} : { activation: { mode } }));
  _setConfigPathForTesting(() => cfgPath);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hivemind-activation-"));
  cfgPath = join(root, "config.json");
  savedEnv = process.env.HIVEMIND_ACTIVATION;
  delete process.env.HIVEMIND_ACTIVATION;
  setMode(null);
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.HIVEMIND_ACTIVATION;
  else process.env.HIVEMIND_ACTIVATION = savedEnv;
  _resetUserConfigForTesting();
  rmSync(root, { recursive: true, force: true });
});

describe("parseActivationMode", () => {
  it("accepts opt-in spellings and always spellings, rejects garbage", () => {
    for (const v of ["opt-in", "OPT-IN", " optin ", "opt_in"]) expect(parseActivationMode(v)).toBe("opt-in");
    for (const v of ["always", "on", "default"]) expect(parseActivationMode(v)).toBe("always");
    for (const v of ["", "nope", 1, null, undefined, {}]) expect(parseActivationMode(v)).toBeNull();
  });
});

describe("getActivationMode", () => {
  it("defaults to always (existing installs unchanged)", () => {
    expect(getActivationMode()).toEqual({ mode: "always", source: "default" });
  });

  it("reads config.json", () => {
    setMode("opt-in");
    expect(getActivationMode()).toEqual({ mode: "opt-in", source: "config" });
  });

  it("HIVEMIND_ACTIVATION env overrides config.json", () => {
    setMode("opt-in");
    process.env.HIVEMIND_ACTIVATION = "always";
    expect(getActivationMode()).toEqual({ mode: "always", source: "env" });
  });

  it("unknown mode string in config falls back to default", () => {
    setMode("sometimes");
    expect(getActivationMode().mode).toBe("always");
  });

  it("corrupt config.json falls back to default", () => {
    writeFileSync(cfgPath, "{not json");
    _setConfigPathForTesting(() => cfgPath);
    expect(getActivationMode().mode).toBe("always");
  });

  it("setActivationMode persists without clobbering other settings", () => {
    writeFileSync(cfgPath, JSON.stringify({ embeddings: { enabled: true } }));
    _setConfigPathForTesting(() => cfgPath);
    setActivationMode("opt-in");
    expect(JSON.parse(readFileSync(cfgPath, "utf-8"))).toEqual({
      embeddings: { enabled: true },
      activation: { mode: "opt-in" },
    });
  });
});

describe("parseDirConfig enabled field", () => {
  it("keeps boolean enabled, drops non-boolean", () => {
    expect(parseDirConfig('{"enabled": true}')).toEqual({ enabled: true });
    expect(parseDirConfig('{"enabled": false, "collect": true}')).toEqual({ enabled: false, collect: true });
    expect(parseDirConfig('{"enabled": "yes"}')).toEqual({});
  });
});

describe("resolveActivation — always mode (default)", () => {
  it("active with no .hivemind anywhere", () => {
    expect(resolveActivation(dir("a", "b")).active).toBe(true);
  });

  it("collect:false alone does NOT deactivate (read-only recipe still works)", () => {
    const src = dir("src");
    write(src, ".hivemind", { collect: false });
    expect(resolveActivation(dir("src", "repo")).active).toBe(true);
  });

  it("enabled:false deactivates the whole tree below it", () => {
    const src = dir("src");
    write(src, ".hivemind", { enabled: false });
    const r = resolveActivation(dir("src", "repo", "pkg"));
    expect(r.active).toBe(false);
    expect(r.reason).toContain(join(src, ".hivemind"));
  });

  it("nearer enabled:true re-enables below a disabled ancestor", () => {
    write(dir("src"), ".hivemind", { enabled: false });
    write(dir("src", "dl"), ".hivemind.local", { enabled: true });
    expect(resolveActivation(dir("src", "dl", "x")).active).toBe(true);
    expect(resolveActivation(dir("src", "other")).active).toBe(false);
  });
});

describe("resolveActivation — opt-in mode", () => {
  beforeEach(() => setMode("opt-in"));

  it("inactive with no .hivemind anywhere", () => {
    const r = resolveActivation(dir("random", "repo"));
    expect(r.active).toBe(false);
    expect(r.mode).toBe("opt-in");
  });

  it("customer scenario: root collect:false, unrelated repo → inactive; opted-in repo → active", () => {
    write(dir("src"), ".hivemind", { collect: false });
    write(dir("src", "deeplake"), ".hivemind.local", { enabled: true });
    expect(resolveActivation(dir("src", "unrelated")).active).toBe(false);
    expect(resolveActivation(dir("src", "deeplake", "python", "deeplake")).active).toBe(true);
  });

  it("a routing-only .hivemind does not opt in (must be explicit)", () => {
    write(dir("team"), ".hivemind", { orgId: "acme", workspaceId: "w" });
    expect(resolveActivation(dir("team")).active).toBe(false);
  });

  it("committed .hivemind with enabled:true opts in the whole team repo", () => {
    write(dir("repo"), ".hivemind", { enabled: true, workspaceId: "w" });
    expect(resolveActivation(dir("repo", "sub")).active).toBe(true);
  });

  it(".hivemind.local enabled:false beats a committed enabled:true in the same dir", () => {
    const repo = dir("repo");
    write(repo, ".hivemind", { enabled: true });
    write(repo, ".hivemind.local", { enabled: false });
    expect(resolveActivation(repo).active).toBe(false);
  });

  it("empty cwd is inactive (never falls back to the process cwd)", () => {
    expect(resolveActivation("").active).toBe(false);
  });

  it("HIVEMIND_ACTIVATION=always overrides the file for one process", () => {
    process.env.HIVEMIND_ACTIVATION = "always";
    expect(resolveActivation(dir("random")).active).toBe(true);
  });
});

describe("isHivemindActive", () => {
  it("logs the reason when inactive", () => {
    setMode("opt-in");
    const lines: string[] = [];
    expect(isHivemindActive(dir("x"), (m) => lines.push(m))).toBe(false);
    expect(lines.join("\n")).toMatch(/inactive/);
  });

  it("stays silent when active", () => {
    const lines: string[] = [];
    expect(isHivemindActive(dir("x"), (m) => lines.push(m))).toBe(true);
    expect(lines).toEqual([]);
  });
});

describe("resolveDirConfig honors activation for capture", () => {
  it("opt-in mode with no opt-in → collect false (every capture path skips)", () => {
    setMode("opt-in");
    expect(resolveDirConfig(base(), dir("repo")).collect).toBe(false);
  });

  it("opt-in mode with enabled:true → collect true, routing still applied", () => {
    setMode("opt-in");
    const repo = dir("repo");
    write(repo, ".hivemind.local", { enabled: true, workspaceId: "dl" });
    const r = resolveDirConfig(base(), repo);
    expect(r.collect).toBe(true);
    expect(r.config.workspaceId).toBe("dl");
  });

  it("enabled:true + collect:false → still no capture", () => {
    setMode("opt-in");
    const repo = dir("repo");
    write(repo, ".hivemind", { enabled: true, collect: false });
    expect(resolveDirConfig(base(), repo).collect).toBe(false);
  });

  it("always mode, no file → collect true (unchanged default)", () => {
    expect(resolveDirConfig(base(), dir("repo")).collect).toBe(true);
  });

  it("always mode, enabled:false → collect false", () => {
    const repo = dir("repo");
    write(repo, ".hivemind", { enabled: false });
    expect(resolveDirConfig(base(), repo).collect).toBe(false);
  });
});

describe("resolveCursorCwd", () => {
  it("prefers payload cwd, then first workspace root, then process cwd", () => {
    expect(resolveCursorCwd({ cwd: "/a", workspace_roots: ["/b"] })).toBe("/a");
    expect(resolveCursorCwd({ workspace_roots: ["/b", "/c"] })).toBe("/b");
    expect(resolveCursorCwd({ cwd: "", workspace_roots: [] })).toBe(process.cwd());
    expect(resolveCursorCwd({})).toBe(process.cwd());
  });
});

describe("hivemind activation CLI", () => {
  function run(args: string[], cwd: string) {
    const out: string[] = [];
    const err: string[] = [];
    const code = runActivationCommand(args, { log: (s) => out.push(s), warn: (s) => err.push(s), cwd });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  it("status reports mode + decision", () => {
    const r = run([], dir("repo"));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Activation mode: always \(default\)/);
    expect(r.out).toMatch(/Hivemind here:\s+ACTIVE/);
  });

  it("opt-in persists mode and reports INACTIVE here", () => {
    const r = run(["opt-in"], dir("repo"));
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(cfgPath, "utf-8")).activation.mode).toBe("opt-in");
    expect(r.out).toMatch(/INACTIVE/);
  });

  it("enable writes .hivemind.local, seeding routing from a sibling .hivemind", () => {
    setMode("opt-in");
    const repo = dir("repo");
    write(repo, ".hivemind", { workspaceId: "dl-team" });
    const r = run(["enable"], repo);
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(repo, ".hivemind.local"), "utf-8"))).toEqual({ workspaceId: "dl-team", enabled: true });
    expect(r.out).toMatch(/ACTIVE — opted in/);
    // committed file untouched
    expect(JSON.parse(readFileSync(join(repo, ".hivemind"), "utf-8"))).toEqual({ workspaceId: "dl-team" });
  });

  it("enable --shared writes .hivemind and preserves its fields", () => {
    const repo = dir("repo");
    write(repo, ".hivemind", { orgId: "acme" });
    run(["enable", "--shared"], repo);
    expect(JSON.parse(readFileSync(join(repo, ".hivemind"), "utf-8"))).toEqual({ orgId: "acme", enabled: true });
    expect(existsSync(join(repo, ".hivemind.local"))).toBe(false);
  });

  it("disable --dir targets another directory", () => {
    const other = dir("other");
    const r = run(["disable", "--dir", other], dir("here"));
    expect(r.code).toBe(0);
    expect(JSON.parse(readFileSync(join(other, ".hivemind.local"), "utf-8"))).toEqual({ enabled: false });
    expect(resolveActivation(other).active).toBe(false);
  });

  it("refuses to overwrite a corrupt existing file", () => {
    const repo = dir("repo");
    write(repo, ".hivemind.local", "not json");
    const r = run(["enable"], repo);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/not a JSON object/);
    expect(readFileSync(join(repo, ".hivemind.local"), "utf-8")).toBe("not json");
  });

  it("unknown subcommand exits 1", () => {
    expect(run(["bogus"], dir("repo")).code).toBe(1);
  });
});
