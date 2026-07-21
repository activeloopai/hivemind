import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, existsSync, rmSync, lstatSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

// Mock ONLY the process boundary: ensureSharedDeps / ensureGraphDeps shell out
// to `npm install`, which we must not actually run. spawnSync + everything else
// stay real (importActual).
vi.mock("node:child_process", async (orig) => ({
  ...(await orig<typeof import("node:child_process")>()),
  execFileSync: vi.fn(),
}));

// embeddings.ts binds `HOME`/`SHARED_DIR` at module-evaluation time, and the
// orchestration functions (installEmbeddings/statusEmbeddings/uninstall) read
// them (and findHivemindInstalls) with NO injectable seam. Point HOME at a tmp
// dir BEFORE importing the module so every path resolves under the sandbox and
// nothing touches the real ~/.hivemind or the real agent installs.
const HOME_DIR = mkdtempSync(join(tmpdir(), "emb-install-home-"));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mod: typeof import("../../src/cli/embeddings.js");
let cfg: typeof import("../../src/user-config.js");

const PREV_TABLE = process.env.HIVEMIND_TABLE;

beforeAll(async () => {
  // Sandbox the home dir on POSIX AND Windows (os.homedir reads USERPROFILE on
  // Windows) BEFORE importing embeddings.ts, which binds HOME/SHARED_DIR at load.
  setFakeHome(HOME_DIR);
  delete process.env.HIVEMIND_TABLE;
  mod = await import("../../src/cli/embeddings.js");
  cfg = await import("../../src/user-config.js");
});

afterAll(() => {
  clearFakeHome();
  if (PREV_TABLE === undefined) delete process.env.HIVEMIND_TABLE;
  else process.env.HIVEMIND_TABLE = PREV_TABLE;
  rmSync(HOME_DIR, { recursive: true, force: true });
});

function freshHome(): void {
  for (const sub of [".hivemind", ".deeplake", ".codex", ".cursor", ".hermes", ".claude"]) {
    rmSync(join(HOME_DIR, sub), { recursive: true, force: true });
  }
  cfg._resetUserConfigForTesting();
  cfg._setConfigPathForTesting(() => join(HOME_DIR, ".deeplake", "config.json"));
  mkdirSync(join(HOME_DIR, ".deeplake"), { recursive: true });
}

describe("installEmbeddings (sandboxed HOME, mocked npm)", () => {
  beforeEach(() => { freshHome(); });
  afterEach(() => { cfg._resetUserConfigForTesting(); });

  it("no agent installs → still provisions shared deps and flips the config flag on", async () => {
    const cp = await import("node:child_process");
    vi.mocked(cp.execFileSync).mockClear();
    mod.installEmbeddings();
    // ensureSharedDeps ran its npm install (mocked) into the sandbox shared dir.
    expect(vi.mocked(cp.execFileSync).mock.calls.some((c) => c[0] === "npm")).toBe(true);
    // A shared package.json was laid down under the tmp HOME.
    expect(existsSync(join(HOME_DIR, ".hivemind", "embed-deps", "package.json"))).toBe(true);
    // Config flag flipped on regardless of whether any agent was detected.
    expect(cfg.getEmbeddingsEnabled()).toBe(true);
  });

  it("shared deps already present → skips the npm install (isSharedDepsInstalled true branch)", async () => {
    // Pre-create <shared>/node_modules/@huggingface/transformers so
    // ensureSharedDeps takes its "already present" skip path.
    mkdirSync(join(mod.SHARED_NODE_MODULES, mod.TRANSFORMERS_PKG), { recursive: true });
    const cp = await import("node:child_process");
    vi.mocked(cp.execFileSync).mockClear();
    mod.installEmbeddings();
    // No transformers `npm install` — the only npm call (if any) is the graph
    // parsers, never the transformers one.
    const transformersInstall = vi.mocked(cp.execFileSync).mock.calls.some(
      (c) => c[0] === "npm" && Array.isArray(c[1]) && c[1].includes(mod.TRANSFORMERS_PKG),
    );
    expect(transformersInstall).toBe(false);
    expect(cfg.getEmbeddingsEnabled()).toBe(true);
  });

  it("with a detected agent install → symlinks its node_modules to the shared deps", async () => {
    // Lay down a codex plugin bundle so findHivemindInstalls() sees it.
    mkdirSync(join(HOME_DIR, ".codex", "hivemind", "bundle"), { recursive: true });
    mod.installEmbeddings();
    const link = join(HOME_DIR, ".codex", "hivemind", "node_modules");
    // npm is mocked so the shared node_modules target is never created; assert
    // the symlink itself was laid down and points at the canonical shared dir
    // (existsSync would follow the link to the absent target and report false).
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(mod.SHARED_NODE_MODULES);
    expect(cfg.getEmbeddingsEnabled()).toBe(true);
  });
});

describe("uninstallEmbeddings --prune (sandboxed HOME)", () => {
  beforeEach(() => { freshHome(); });
  afterEach(() => { cfg._resetUserConfigForTesting(); });

  it("prune removes the shared-deps dir and flips the flag off", () => {
    mkdirSync(mod.SHARED_DIR, { recursive: true });
    expect(existsSync(mod.SHARED_DIR)).toBe(true);
    mod.uninstallEmbeddings({ prune: true });
    expect(existsSync(mod.SHARED_DIR)).toBe(false);
    expect(cfg.getEmbeddingsEnabled()).toBe(false);
  });

  it("without prune, leaves the shared-deps dir in place but still disables", () => {
    mkdirSync(mod.SHARED_DIR, { recursive: true });
    mod.uninstallEmbeddings();
    expect(existsSync(mod.SHARED_DIR)).toBe(true);
    expect(cfg.getEmbeddingsEnabled()).toBe(false);
  });
});

describe("statusEmbeddings (sandboxed HOME)", () => {
  beforeEach(() => { freshHome(); });
  afterEach(() => { cfg._resetUserConfigForTesting(); vi.restoreAllMocks(); });

  it("prints config + shared-deps + per-agent link state without throwing", () => {
    mkdirSync(join(HOME_DIR, ".codex", "hivemind", "bundle"), { recursive: true });
    // log()/warn() write to process.stdout/stderr (not console.*), so capture
    // the raw streams.
    const lines: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    expect(() => mod.statusEmbeddings()).not.toThrow();
    outSpy.mockRestore();
    errSpy.mockRestore();
    const out = lines.join("\n");
    // Shared deps absent + codex has no node_modules symlink → specific lines.
    expect(out).toContain(`Shared deps:   ${mod.SHARED_DIR}`);
    expect(out).toContain("Installed:     no");
    expect(out).toMatch(/codex\s+✗ not linked/);
  });

  it("reports a linked agent + present shared deps (linked/present status arms)", () => {
    // Shared deps present + codex bundle symlinked into them → exercises the
    // isSharedDepsInstalled=true and linked-to-shared status branches.
    mkdirSync(join(HOME_DIR, ".hivemind", "embed-deps", "node_modules", "@huggingface", "transformers"), { recursive: true });
    mkdirSync(join(HOME_DIR, ".codex", "hivemind", "bundle"), { recursive: true });
    mod._linkAgentForTesting({ id: "codex", pluginDir: join(HOME_DIR, ".codex", "hivemind") });
    const lines: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    expect(() => mod.statusEmbeddings()).not.toThrow();
    outSpy.mockRestore();
    errSpy.mockRestore();
    const out = lines.join("\n");
    // Shared deps present + codex symlinked → the "installed" + linked arms.
    expect(out).toContain("Installed:     yes");
    expect(out).toMatch(/codex\s+✓ linked → shared/);
  });

  function capture(fn: () => void): string {
    const lines: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    try { fn(); } finally { outSpy.mockRestore(); errSpy.mockRestore(); }
    return lines.join("\n");
  }

  it("disabled config → prints the DISABLED help block", () => {
    cfg.setEmbeddingsEnabled(false);
    const out = capture(() => mod.statusEmbeddings());
    expect(out).toContain("Embeddings are DISABLED in user config");
  });

  it("enabled but shared deps missing → warns deps are missing", () => {
    cfg.setEmbeddingsEnabled(true);
    // No <shared>/node_modules/@huggingface/transformers laid down.
    const out = capture(() => mod.statusEmbeddings());
    expect(out).toContain("enabled in config but shared deps are missing");
  });

  it("no agent installs detected → prints '(none detected)' and returns early", () => {
    // freshHome() already removed every agent dir → findHivemindInstalls == [].
    const out = capture(() => mod.statusEmbeddings());
    expect(out).toContain("(none detected)");
  });

  it("agent owns its own node_modules → prints the has-its-own label", () => {
    mkdirSync(join(HOME_DIR, ".codex", "hivemind", "bundle"), { recursive: true });
    mkdirSync(join(HOME_DIR, ".codex", "hivemind", "node_modules"), { recursive: true });
    const out = capture(() => mod.statusEmbeddings());
    expect(out).toMatch(/codex\s+△ has its own node_modules/);
  });

  it("agent linked elsewhere → prints the linked-→-other label", () => {
    mkdirSync(join(HOME_DIR, ".codex", "hivemind", "bundle"), { recursive: true });
    const elsewhere = join(HOME_DIR, "some-other-nm");
    mkdirSync(elsewhere, { recursive: true });
    symlinkSync(elsewhere, join(HOME_DIR, ".codex", "hivemind", "node_modules"));
    const out = capture(() => mod.statusEmbeddings());
    expect(out).toContain(`△ linked → ${elsewhere}`);
  });

  it("daemon bundle present → prints its path instead of '(not present)'", () => {
    // Lay the daemon file down at SHARED_DAEMON_PATH so the existsSync arm at
    // the "Daemon:" line takes the present branch.
    mkdirSync(mod.SHARED_DIR, { recursive: true });
    writeFileSync(mod.SHARED_DAEMON_PATH, "// daemon");
    const out = capture(() => mod.statusEmbeddings());
    expect(out).toContain(`Daemon:        ${mod.SHARED_DAEMON_PATH}`);
    expect(out).not.toContain("Daemon:        (not present)");
  });
});

describe("enableEmbeddings (sandboxed HOME)", () => {
  beforeEach(() => { freshHome(); });
  afterEach(() => { cfg._resetUserConfigForTesting(); vi.restoreAllMocks(); });

  function capture(fn: () => void): string {
    const lines: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c: unknown) => { lines.push(String(c)); return true; });
    try { fn(); } finally { outSpy.mockRestore(); errSpy.mockRestore(); }
    return lines.join("\n");
  }

  it("shared deps absent → flips flag on and warns to run install", () => {
    const out = capture(() => mod.enableEmbeddings());
    expect(cfg.getEmbeddingsEnabled()).toBe(true);
    expect(out).toContain("shared deps not installed yet");
  });

  it("shared deps present → flips flag on and reports deps present", () => {
    mkdirSync(join(mod.SHARED_NODE_MODULES, mod.TRANSFORMERS_PKG), { recursive: true });
    const out = capture(() => mod.enableEmbeddings());
    expect(cfg.getEmbeddingsEnabled()).toBe(true);
    expect(out).toContain("shared deps present");
  });
});

describe("uninstallEmbeddings — unlinks a symlink into the shared deps (sandboxed HOME)", () => {
  beforeEach(() => { freshHome(); });
  afterEach(() => { cfg._resetUserConfigForTesting(); });

  it("removes an agent node_modules symlink pointing at SHARED_NODE_MODULES", () => {
    const pluginDir = join(HOME_DIR, ".codex", "hivemind");
    mkdirSync(join(pluginDir, "bundle"), { recursive: true });
    // isSymlinkToSharedDeps() calls existsSync(link) first, which FOLLOWS the
    // symlink — so the shared target must actually exist for the true arm to
    // fire and the unlinkSync to run.
    mkdirSync(mod.SHARED_NODE_MODULES, { recursive: true });
    const link = join(pluginDir, "node_modules");
    symlinkSync(mod.SHARED_NODE_MODULES, link);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    mod.uninstallEmbeddings();
    // The shared symlink was removed by uninstall.
    expect(lstatSync(link, { throwIfNoEntry: false })).toBeUndefined();
    expect(cfg.getEmbeddingsEnabled()).toBe(false);
  });
});
