import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Config } from "../../src/config.js";
import {
  findDirConfig,
  parseDirConfig,
  resolveDirConfig,
} from "../../src/dir-config.js";

let root: string;

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
    kpisTableName: "hivemind_kpis",
    codebaseTableName: "codebase",
    docsTableName: "docs",
    memoryPath: "/tmp/mem",
  };
}

/** mkdir -p under the sandbox root and return the absolute path. */
function dir(...segs: string[]): string {
  const p = join(root, ...segs);
  mkdirSync(p, { recursive: true });
  return p;
}

function write(dirPath: string, name: string, body: unknown): void {
  writeFileSync(join(dirPath, name), typeof body === "string" ? body : JSON.stringify(body));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hivemind-dir-config-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("parseDirConfig", () => {
  it("whitelists known fields and ignores the rest", () => {
    expect(
      parseDirConfig(JSON.stringify({ orgId: "a", workspaceId: "w", collect: false, junk: 1, token: "x" })),
    ).toEqual({ orgId: "a", workspaceId: "w", collect: false });
  });

  it("drops fields of the wrong type", () => {
    expect(parseDirConfig(JSON.stringify({ orgId: 5, collect: "no" }))).toEqual({});
  });

  it("returns null for malformed JSON, arrays, and non-objects", () => {
    expect(parseDirConfig("{not json")).toBeNull();
    expect(parseDirConfig("[1,2]")).toBeNull();
    expect(parseDirConfig('"a string"')).toBeNull();
    expect(parseDirConfig("null")).toBeNull();
  });
});

describe("findDirConfig", () => {
  it("returns null when no file exists up to the boundary", () => {
    const leaf = dir("a", "b");
    expect(findDirConfig(leaf, root)).toBeNull();
  });

  it("finds a file in an ancestor directory (walk up)", () => {
    write(dir("proj"), ".hivemind", { orgId: "acme" });
    const found = findDirConfig(dir("proj", "svc", "deep"), root);
    expect(found?.raw.orgId).toBe("acme");
    expect(found?.path).toBe(join(root, "proj", ".hivemind"));
  });

  it("nearest directory wins over an ancestor", () => {
    write(dir("proj"), ".hivemind", { orgId: "outer" });
    write(dir("proj", "svc"), ".hivemind", { orgId: "inner" });
    const found = findDirConfig(dir("proj", "svc", "x"), root);
    expect(found?.raw.orgId).toBe("inner");
  });

  it("prefers .hivemind.local over .hivemind in the same directory", () => {
    const d = dir("proj");
    write(d, ".hivemind", { orgId: "committed" });
    write(d, ".hivemind.local", { orgId: "personal" });
    expect(findDirConfig(d, root)?.raw.orgId).toBe("personal");
  });

  it("skips an unparseable file and keeps walking up", () => {
    write(dir("proj"), ".hivemind", { orgId: "valid-ancestor" });
    write(dir("proj", "svc"), ".hivemind", "{ broken json");
    const found = findDirConfig(dir("proj", "svc"), root);
    expect(found?.raw.orgId).toBe("valid-ancestor");
  });
});

describe("resolveDirConfig", () => {
  it("passes through the global identity when no .hivemind applies", () => {
    const res = resolveDirConfig(base(), dir("empty"));
    expect(res.collect).toBe(true);
    expect(res.found).toBeNull();
    expect(res.config.orgId).toBe("global-org");
  });

  it("overlays org + workspace, leaving unset fields on the global default", () => {
    write(dir("proj"), ".hivemind", { orgId: "acme", orgName: "Acme" });
    const res = resolveDirConfig(base(), dir("proj"));
    expect(res.collect).toBe(true);
    expect(res.config.orgId).toBe("acme");
    expect(res.config.orgName).toBe("Acme");
    expect(res.config.workspaceId).toBe("default"); // untouched
  });

  it("derives orgName from orgId when only orgId is given", () => {
    write(dir("proj"), ".hivemind", { orgId: "acme" });
    expect(resolveDirConfig(base(), dir("proj")).config.orgName).toBe("acme");
  });

  it("routes the workspace independently of the org", () => {
    write(dir("proj"), ".hivemind", { workspaceId: "client-work" });
    const res = resolveDirConfig(base(), dir("proj"));
    expect(res.config.orgId).toBe("global-org");
    expect(res.config.workspaceId).toBe("client-work");
  });

  it("suppresses capture on collect:false, leaving a bare config untouched", () => {
    write(dir("proj"), ".hivemind", { collect: false });
    const res = resolveDirConfig(base(), dir("proj"));
    expect(res.collect).toBe(false);
    expect(res.config.orgId).toBe("global-org");
    expect(res.found?.path).toBe(join(root, "proj", ".hivemind"));
  });

  it("collect:false suppresses capture but still applies the identity overlay", () => {
    // `collect` governs WRITES only. org/workspace are identity and must still
    // route reads — otherwise `{collect:false, orgId:...}` would silently drop
    // orgId on the floor. "Read this workspace, never write to it" is valid.
    write(dir("proj"), ".hivemind", { orgId: "acme", workspaceId: "client-work", collect: false });
    const res = resolveDirConfig(base(), dir("proj"));
    expect(res.collect).toBe(false);
    expect(res.config.orgId).toBe("acme");
    expect(res.config.workspaceId).toBe("client-work");
  });
});

describe("resolveDirConfig — env precedence (env > .hivemind)", () => {
  it("HIVEMIND_ORG_ID locks the org, but the workspace still routes", () => {
    write(dir("proj"), ".hivemind", { orgId: "acme", workspaceId: "client-work" });
    // base already reflects the env-pinned org (loadConfig folds it in).
    const pinned = { ...base(), orgId: "env-org", orgName: "env-org" };
    const res = resolveDirConfig(pinned, dir("proj"), { HIVEMIND_ORG_ID: "env-org" });
    expect(res.config.orgId).toBe("env-org"); // .hivemind org ignored
    expect(res.config.workspaceId).toBe("client-work"); // workspace still routes
  });

  it("HIVEMIND_WORKSPACE_ID locks the workspace, but the org still routes", () => {
    write(dir("proj"), ".hivemind", { orgId: "acme", workspaceId: "client-work" });
    const pinned = { ...base(), workspaceId: "env-ws" };
    const res = resolveDirConfig(pinned, dir("proj"), { HIVEMIND_WORKSPACE_ID: "env-ws" });
    expect(res.config.orgId).toBe("acme"); // org still routes
    expect(res.config.workspaceId).toBe("env-ws"); // .hivemind workspace ignored
  });

  it("both env vars set → .hivemind routing is fully ignored", () => {
    write(dir("proj"), ".hivemind", { orgId: "acme", workspaceId: "client-work" });
    const pinned = { ...base(), orgId: "env-org", orgName: "env-org", workspaceId: "env-ws" };
    const res = resolveDirConfig(pinned, dir("proj"), {
      HIVEMIND_ORG_ID: "env-org",
      HIVEMIND_WORKSPACE_ID: "env-ws",
    });
    expect(res.config.orgId).toBe("env-org");
    expect(res.config.workspaceId).toBe("env-ws");
  });

  it("collect:false is a fail-safe opt-out — env does not force capture on", () => {
    write(dir("proj"), ".hivemind", { collect: false });
    const res = resolveDirConfig(base(), dir("proj"), { HIVEMIND_ORG_ID: "env-org" });
    expect(res.collect).toBe(false);
  });
});
