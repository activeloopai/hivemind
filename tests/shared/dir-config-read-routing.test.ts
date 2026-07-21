/**
 * Reads must route through `.hivemind` exactly like capture does.
 *
 * The gap this covers: `resolveDirConfig` was fully unit-tested in isolation and
 * correct, but no read path consumed it — every one called `loadConfig()` raw.
 * A routed directory therefore captured to its workspace while reading from the
 * global one, and the SessionStart banner reported the routed identity anyway.
 * Unit-testing the resolver could never catch that; only asserting the CONSUMER
 * can. These tests pin the wiring, not the resolver.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processPreToolUse } from "../../src/hooks/pre-tool-use.js";
import { renderWhoami } from "../../src/commands/whoami.js";
import type { Config } from "../../src/config.js";

let root: string;

const BASE_CONFIG = {
  token: "test-token",
  apiUrl: "https://api.test",
  orgId: "global-org",
  orgName: "global-org",
  userName: "u",
  workspaceId: "default",
  tableName: "memory",
  docsTableName: "hivemind_docs",
} as any as Config;

function dir(...segs: string[]): string {
  const p = join(root, ...segs);
  mkdirSync(p, { recursive: true });
  return p;
}

function writeHivemind(dirPath: string, body: unknown): void {
  writeFileSync(join(dirPath, ".hivemind"), JSON.stringify(body));
}

/** Stub API: every read resolves to nothing — we assert on ROUTING, not rows. */
function makeApi() {
  return { query: vi.fn(async () => []) } as any;
}

/**
 * Drive a memory read through the hook and return the Config the VFS backend
 * was actually constructed with. That config is the routing decision.
 */
async function configUsedForRead(cwd: string, base: Config = BASE_CONFIG): Promise<Config> {
  const createApi = vi.fn((_table: string, _cfg: Config) => makeApi());
  await processPreToolUse(
    {
      session_id: "s-route",
      tool_name: "Bash",
      tool_input: { command: "cat ~/.deeplake/memory/index.md" },
      tool_use_id: "tu-route",
      cwd,
    },
    {
      config: base,
      createApi,
      executeCompiledBashCommandFn: vi.fn(async () => null) as any,
      readCachedIndexContentFn: () => null,
      writeCachedIndexContentFn: () => undefined,
      writeReadCacheFileFn: () => undefined,
      logFn: () => undefined,
    } as any,
  );
  expect(createApi).toHaveBeenCalled();
  return createApi.mock.calls[0][1];
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hivemind-read-routing-"));
  delete process.env.HIVEMIND_ORG_ID;
  delete process.env.HIVEMIND_WORKSPACE_ID;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("memory reads route through .hivemind", () => {
  it("reads from the workspace the directory is pinned to, not the global one", async () => {
    const proj = dir("proj");
    writeHivemind(proj, { workspaceId: "workspace2" });
    const used = await configUsedForRead(proj);
    expect(used.workspaceId).toBe("workspace2");
    expect(used.orgId).toBe("global-org"); // org untouched
  });

  it("routes the org too, and inherits it from an ancestor directory", async () => {
    writeHivemind(dir("proj"), { orgId: "acme", workspaceId: "client-work" });
    const used = await configUsedForRead(dir("proj", "svc", "deep"));
    expect(used.orgId).toBe("acme");
    expect(used.workspaceId).toBe("client-work");
  });

  it("falls back to the global identity when no .hivemind applies", async () => {
    const used = await configUsedForRead(dir("plain"));
    expect(used.orgId).toBe("global-org");
    expect(used.workspaceId).toBe("default");
  });

  it("still routes reads under collect:false — collect gates writes, not reads", async () => {
    const proj = dir("readonly");
    writeHivemind(proj, { workspaceId: "client-work", collect: false });
    const used = await configUsedForRead(proj);
    expect(used.workspaceId).toBe("client-work");
  });

  it("honors the HIVEMIND_WORKSPACE_ID lock on the read path too", async () => {
    process.env.HIVEMIND_WORKSPACE_ID = "env-ws";
    const proj = dir("proj");
    writeHivemind(proj, { workspaceId: "workspace2" });
    // loadConfig() folds the env in upstream; base reflects that.
    const used = await configUsedForRead(proj, { ...BASE_CONFIG, workspaceId: "env-ws" });
    expect(used.workspaceId).toBe("env-ws");
  });
});

describe("whoami reports the identity actually in use", () => {
  const creds = { token: "t", orgId: "global-org", orgName: "global-org", workspaceId: "default" } as any;

  it("reports the routed workspace and discloses the file that routed it", () => {
    const proj = dir("proj");
    writeHivemind(proj, { workspaceId: "workspace2" });
    const out = renderWhoami(BASE_CONFIG, creds, proj);
    expect(out).toContain("Workspace: workspace2");
    expect(out).toContain(join(proj, ".hivemind"));
    expect(out).toContain("Stored identity: global-org / default");
  });

  it("reports the stored identity plainly when nothing overrides it", () => {
    const out = renderWhoami(BASE_CONFIG, creds, dir("plain"));
    expect(out).toContain("Workspace: default");
    expect(out).not.toContain("Routed by");
    expect(out).not.toContain("Stored identity:");
  });

  it("discloses an env override as env, not as a .hivemind routing", () => {
    const out = renderWhoami({ ...BASE_CONFIG, workspaceId: "env-ws" }, creds, dir("plain"));
    expect(out).toContain("Workspace: env-ws");
    expect(out).toContain("Overridden by HIVEMIND_* environment variables");
    expect(out).not.toContain("Routed by");
  });

  it("surfaces a capture opt-out alongside the identity it still reads from", () => {
    const proj = dir("proj");
    writeHivemind(proj, { workspaceId: "client-work", collect: false });
    const out = renderWhoami(BASE_CONFIG, creds, proj);
    expect(out).toContain("Workspace: client-work");
    expect(out).toContain("Capture: disabled for this directory");
  });
});
