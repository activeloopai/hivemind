import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for src/cli/index.ts — the unified `hivemind` CLI dispatcher.
 *
 * The module's main() runs at import time (the file is the bin entry).
 * We mock every per-platform installer + the auth module + the auth-login
 * dispatcher (CLAUDE.md rule 5: mock at the boundary), set process.argv to
 * the command we want to drive, and import fresh.
 *
 * Each subcommand path is asserted on COUNT and SHAPE (rule 6) so a
 * regression that swaps install↔uninstall, double-runs an installer, or
 * fires the wrong platform cannot slip through.
 */

const installs = {
  installClaude: vi.fn(), uninstallClaude: vi.fn(),
  installCodex: vi.fn(),  uninstallCodex: vi.fn(),
  installOpenclaw: vi.fn(), uninstallOpenclaw: vi.fn(),
  installCursor: vi.fn(), uninstallCursor: vi.fn(),
  installHermes: vi.fn(), uninstallHermes: vi.fn(),
  installPi: vi.fn(),     uninstallPi: vi.fn(),
};
const ensureLoggedInMock = vi.fn();
const isLoggedInMock = vi.fn();
const maybeShowOrgChoiceMock = vi.fn();
const runAuthCommandMock = vi.fn();
const detectPlatformsMock = vi.fn();
const allPlatformIdsMock = vi.fn();
const getVersionMock = vi.fn();
const runUpdateMock = vi.fn();
const stdoutMock = vi.fn();
const stderrMock = vi.fn();
const exitSpy = vi.fn();

vi.mock("../../src/cli/install-claude.js", () => ({
  installClaude: (...a: unknown[]) => installs.installClaude(...a),
  uninstallClaude: (...a: unknown[]) => installs.uninstallClaude(...a),
}));
vi.mock("../../src/cli/install-codex.js", () => ({
  installCodex: (...a: unknown[]) => installs.installCodex(...a),
  uninstallCodex: (...a: unknown[]) => installs.uninstallCodex(...a),
}));
vi.mock("../../src/cli/install-openclaw.js", () => ({
  installOpenclaw: (...a: unknown[]) => installs.installOpenclaw(...a),
  uninstallOpenclaw: (...a: unknown[]) => installs.uninstallOpenclaw(...a),
}));
vi.mock("../../src/cli/install-cursor.js", () => ({
  installCursor: (...a: unknown[]) => installs.installCursor(...a),
  uninstallCursor: (...a: unknown[]) => installs.uninstallCursor(...a),
}));
vi.mock("../../src/cli/install-hermes.js", () => ({
  installHermes: (...a: unknown[]) => installs.installHermes(...a),
  uninstallHermes: (...a: unknown[]) => installs.uninstallHermes(...a),
}));
vi.mock("../../src/cli/install-pi.js", () => ({
  installPi: (...a: unknown[]) => installs.installPi(...a),
  uninstallPi: (...a: unknown[]) => installs.uninstallPi(...a),
  // The pure helpers cli-index doesn't use; keep them defined so the
  // import resolves cleanly even if import() pulls the whole module.
  upsertHivemindBlock: () => "",
  stripHivemindBlock: (s: string) => s,
}));
const loginWithProvidedTokenMock = vi.fn();
vi.mock("../../src/cli/auth.js", () => ({
  ensureLoggedIn: (...a: unknown[]) => ensureLoggedInMock(...a),
  isLoggedIn: (...a: unknown[]) => isLoggedInMock(...a),
  loginWithProvidedToken: (...a: unknown[]) => loginWithProvidedTokenMock(...a),
  maybeShowOrgChoice: (...a: unknown[]) => maybeShowOrgChoiceMock(...a),
}));
vi.mock("../../src/commands/auth-login.js", () => ({
  runAuthCommand: (...a: unknown[]) => runAuthCommandMock(...a),
}));
const confirmMock = vi.fn();
const promptLineMock = vi.fn();
vi.mock("../../src/cli/util.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
  return {
    ...actual,
    detectPlatforms: (...a: unknown[]) => detectPlatformsMock(...a),
    allPlatformIds: (...a: unknown[]) => allPlatformIdsMock(...a),
    confirm: (...a: unknown[]) => confirmMock(...a),
    promptLine: (...a: unknown[]) => promptLineMock(...a),
  };
});
vi.mock("../../src/cli/version.js", () => ({
  getVersion: (...a: unknown[]) => getVersionMock(...a),
}));
vi.mock("../../src/cli/update.js", () => ({
  runUpdate: (...a: unknown[]) => runUpdateMock(...a),
}));
const installEmbeddingsMock = vi.fn();
const enableEmbeddingsMock = vi.fn();
const disableEmbeddingsMock = vi.fn();
const uninstallEmbeddingsMock = vi.fn();
const statusEmbeddingsMock = vi.fn();
const runBackfillMemoryMock = vi.fn();
const runFlushMemoryMock = vi.fn();
const maybeAutoBackfillMemoryMock = vi.fn();
vi.mock("../../src/commands/backfill-memory.js", () => ({
  runBackfillMemory: (...a: unknown[]) => runBackfillMemoryMock(...a),
}));
vi.mock("../../src/commands/flush-memory.js", () => ({
  runFlushMemory: (...a: unknown[]) => runFlushMemoryMock(...a),
}));
vi.mock("../../src/skillify/spawn-backfill-memory-worker.js", () => ({
  maybeAutoBackfillMemory: (...a: unknown[]) => maybeAutoBackfillMemoryMock(...a),
}));
vi.mock("../../src/cli/embeddings.js", () => ({
  installEmbeddings: (...a: unknown[]) => installEmbeddingsMock(...a),
  enableEmbeddings: (...a: unknown[]) => enableEmbeddingsMock(...a),
  disableEmbeddings: (...a: unknown[]) => disableEmbeddingsMock(...a),
  uninstallEmbeddings: (...a: unknown[]) => uninstallEmbeddingsMock(...a),
  statusEmbeddings: (...a: unknown[]) => statusEmbeddingsMock(...a),
}));

const originalArgv = process.argv;
const originalIsTTY = (process.stdin as { isTTY?: boolean }).isTTY;

beforeEach(() => {
  for (const fn of Object.values(installs)) fn.mockReset();
  ensureLoggedInMock.mockReset().mockResolvedValue(true);
  isLoggedInMock.mockReset().mockReturnValue(true);
  loginWithProvidedTokenMock.mockReset().mockResolvedValue(false);
  confirmMock.mockReset().mockResolvedValue(true);
  // Paste fallback defaults to empty (skip) so existing tests that don't
  // care about the fallback don't accidentally try to validate a token.
  promptLineMock.mockReset().mockResolvedValue("");
  maybeShowOrgChoiceMock.mockReset().mockResolvedValue(undefined);
  delete process.env.HIVEMIND_TOKEN;
  runAuthCommandMock.mockReset().mockResolvedValue(undefined);
  detectPlatformsMock.mockReset().mockReturnValue([]);
  allPlatformIdsMock.mockReset().mockReturnValue(["claude", "codex", "claw", "cursor", "hermes", "pi"]);
  getVersionMock.mockReset().mockReturnValue("1.2.3");
  runUpdateMock.mockReset().mockResolvedValue(0);
  installEmbeddingsMock.mockReset();
  enableEmbeddingsMock.mockReset();
  disableEmbeddingsMock.mockReset();
  uninstallEmbeddingsMock.mockReset();
  statusEmbeddingsMock.mockReset();
  runBackfillMemoryMock.mockReset().mockResolvedValue(0);
  runFlushMemoryMock.mockReset().mockResolvedValue({ pending: 0, uploaded: 0, failed: 0 });
  maybeAutoBackfillMemoryMock.mockReset().mockReturnValue({ triggered: false });
  stdoutMock.mockReset();
  stderrMock.mockReset();
  exitSpy.mockReset();
  vi.spyOn(process.stdout, "write").mockImplementation(((...a: unknown[]) => { stdoutMock(...a); return true; }) as any);
  vi.spyOn(process.stderr, "write").mockImplementation(((...a: unknown[]) => { stderrMock(...a); return true; }) as any);
  // Real process.exit aborts execution; mock it to throw so the rest of
  // main() short-circuits like in production, then swallow the throw via
  // main()'s .catch chain.
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitSpy(code);
    throw Object.assign(new Error("__test_process_exit__"), { __exit: true });
  }) as any);
});

afterEach(() => {
  process.argv = originalArgv;
  // Restore process.stdin.isTTY in case a test mutated it — otherwise the
  // mutation leaks into later tests in the same worker and makes them
  // order-dependent.
  Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runCli(args: string[]): Promise<void> {
  process.argv = ["node", "/path/to/hivemind-cli", ...args];
  // Swallow the second process.exit() that fires from main()'s .catch
  // handler when the first exit-throw bubbles up — that's the test mock
  // re-throwing, not a real failure.
  const onUnhandled = (e: unknown) => {
    if (e && typeof e === "object" && "__exit" in (e as Record<string, unknown>)) return;
    throw e;
  };
  process.on("unhandledRejection", onUnhandled);
  try {
    vi.resetModules();
    await import("../../src/cli/index.js");
    // Allow the floating main() promise + .catch() chain to settle.
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
}

const stdoutText = () => stdoutMock.mock.calls.map(c => c[0]).join("");
const stderrText = () => stderrMock.mock.calls.map(c => c[0]).join("");

describe("hivemind --version / --help / no args", () => {
  it("--version prints just the version string", async () => {
    await runCli(["--version"]);
    expect(stdoutText()).toContain("1.2.3");
  });

  it.each(["-v", "version"])("alias %s prints the version", async (alias) => {
    await runCli([alias]);
    expect(stdoutText()).toContain("1.2.3");
  });

  it("no args prints USAGE", async () => {
    await runCli([]);
    expect(stdoutText()).toContain("hivemind — one brain for every agent on your team");
  });

  it.each(["--help", "-h", "help"])("alias %s prints USAGE", async (alias) => {
    await runCli([alias]);
    expect(stdoutText()).toContain("Usage:");
  });
});

describe("hivemind install", () => {
  it("with no detected platforms: prints 'No supported assistants detected.' and runs no installer", async () => {
    detectPlatformsMock.mockReturnValue([]);
    await runCli(["install"]);
    expect(stdoutText()).toContain("No supported assistants detected.");
    for (const k of ["installClaude", "installCodex", "installCursor", "installHermes", "installPi", "installOpenclaw"] as const) {
      expect(installs[k]).not.toHaveBeenCalled();
    }
  });

  it("with detected platforms: ensures login (TTY consent → yes), runs each installer once, then maybeShowOrgChoice", async () => {
    detectPlatformsMock.mockReturnValue([
      { id: "claude", markerDir: "/x/.claude" },
      { id: "codex",  markerDir: "/x/.codex" },
    ]);
    isLoggedInMock.mockReturnValue(false);
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    confirmMock.mockResolvedValue(true);
    ensureLoggedInMock.mockResolvedValue(true);

    await runCli(["install"]);

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(ensureLoggedInMock).toHaveBeenCalledTimes(1);
    expect(installs.installClaude).toHaveBeenCalledTimes(1);
    expect(installs.installCodex).toHaveBeenCalledTimes(1);
    expect(installs.installCursor).not.toHaveBeenCalled();
    expect(installs.installHermes).not.toHaveBeenCalled();
    expect(installs.installPi).not.toHaveBeenCalled();
    expect(maybeShowOrgChoiceMock).toHaveBeenCalledTimes(1);
  });

  it("--skip-auth bypasses login even when not logged in", async () => {
    detectPlatformsMock.mockReturnValue([{ id: "claude", markerDir: "/x/.claude" }]);
    isLoggedInMock.mockReturnValue(false);

    await runCli(["install", "--skip-auth"]);

    expect(ensureLoggedInMock).not.toHaveBeenCalled();
    expect(installs.installClaude).toHaveBeenCalledTimes(1);
  });

  it("continues install (exit 0) when login does not complete — auth is no longer a blocker", async () => {
    detectPlatformsMock.mockReturnValue([{ id: "claude", markerDir: "/x/.claude" }]);
    isLoggedInMock.mockReturnValue(false);
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    confirmMock.mockResolvedValue(true);
    ensureLoggedInMock.mockResolvedValue(false);

    await runCli(["install"]);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(installs.installClaude).toHaveBeenCalledTimes(1);
    expect(stderrText()).toContain("Login did not complete");
  });

  it("--only <list> overrides detection and validates platform names", async () => {
    detectPlatformsMock.mockReturnValue([{ id: "claude", markerDir: "/x/.claude" }]);
    await runCli(["install", "--only", "cursor,hermes"]);
    expect(installs.installClaude).not.toHaveBeenCalled();
    expect(installs.installCursor).toHaveBeenCalledTimes(1);
    expect(installs.installHermes).toHaveBeenCalledTimes(1);
  });

  it("--only=<list> (= form) is equivalent to --only <list>", async () => {
    await runCli(["install", "--only=pi"]);
    expect(installs.installPi).toHaveBeenCalledTimes(1);
  });

  it("--only with an unknown platform exits 1 with a stderr warning", async () => {
    await runCli(["install", "--only", "claude,bogus"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrText()).toContain("Unknown platform(s): bogus");
  });

  it("an installer that throws does not abort the loop — remaining installers still run", async () => {
    detectPlatformsMock.mockReturnValue([
      { id: "claude", markerDir: "/x/.claude" },
      { id: "codex",  markerDir: "/x/.codex" },
    ]);
    installs.installClaude.mockImplementation(() => { throw new Error("boom"); });
    await runCli(["install"]);
    expect(installs.installClaude).toHaveBeenCalled();
    expect(installs.installCodex).toHaveBeenCalled();
    expect(stderrText()).toContain("FAILED: boom");
  });
});

describe("hivemind uninstall", () => {
  it("auto-detects and uninstalls each detected platform once", async () => {
    detectPlatformsMock.mockReturnValue([
      { id: "cursor", markerDir: "/x/.cursor" },
      { id: "pi",     markerDir: "/x/.pi" },
    ]);
    await runCli(["uninstall"]);
    expect(installs.uninstallCursor).toHaveBeenCalledTimes(1);
    expect(installs.uninstallPi).toHaveBeenCalledTimes(1);
    expect(installs.uninstallClaude).not.toHaveBeenCalled();
  });

  it("--only narrows the uninstall set", async () => {
    detectPlatformsMock.mockReturnValue([
      { id: "cursor", markerDir: "/x/.cursor" },
      { id: "pi",     markerDir: "/x/.pi" },
    ]);
    await runCli(["uninstall", "--only", "pi"]);
    expect(installs.uninstallPi).toHaveBeenCalledTimes(1);
    expect(installs.uninstallCursor).not.toHaveBeenCalled();
  });
});

describe("per-platform shorthand: hivemind <platform> install|uninstall", () => {
  it.each([
    ["claude",  "installClaude"],
    ["codex",   "installCodex"],
    ["claw",    "installOpenclaw"],
    ["cursor",  "installCursor"],
    ["hermes",  "installHermes"],
    ["pi",      "installPi"],
  ] as const)("'%s install' calls %s exactly once", async (platform, fn) => {
    await runCli([platform, "install"]);
    expect(installs[fn]).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["claude",  "uninstallClaude"],
    ["codex",   "uninstallCodex"],
    ["claw",    "uninstallOpenclaw"],
    ["cursor",  "uninstallCursor"],
    ["hermes",  "uninstallHermes"],
    ["pi",      "uninstallPi"],
  ] as const)("'%s uninstall' calls %s exactly once", async (platform, fn) => {
    await runCli([platform, "uninstall"]);
    expect(installs[fn]).toHaveBeenCalledTimes(1);
  });

  it("missing subcommand exits 1 with a usage warning", async () => {
    await runCli(["claude"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrText()).toContain("Usage: hivemind claude install");
    expect(stderrText()).toContain("uninstall");
  });
});

describe("hivemind update", () => {
  it("'update' calls runUpdate({ dryRun: false }) once and exits with its return code", async () => {
    runUpdateMock.mockResolvedValueOnce(0);
    await runCli(["update"]);
    expect(runUpdateMock).toHaveBeenCalledTimes(1);
    expect(runUpdateMock.mock.calls[0][0]).toEqual({ dryRun: false });
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("'update --dry-run' passes dryRun: true", async () => {
    runUpdateMock.mockResolvedValueOnce(0);
    await runCli(["update", "--dry-run"]);
    expect(runUpdateMock).toHaveBeenCalledTimes(1);
    expect(runUpdateMock.mock.calls[0][0]).toEqual({ dryRun: true });
  });

  it("propagates a non-zero return code from runUpdate", async () => {
    runUpdateMock.mockResolvedValueOnce(1);
    await runCli(["update"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("hivemind embeddings", () => {
  it("'embeddings install' calls installEmbeddings (heavy: deps + symlinks + enabled:true)", async () => {
    await runCli(["embeddings", "install"]);
    expect(installEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(enableEmbeddingsMock).not.toHaveBeenCalled();
    expect(disableEmbeddingsMock).not.toHaveBeenCalled();
    expect(uninstallEmbeddingsMock).not.toHaveBeenCalled();
  });

  it("'embeddings enable' calls enableEmbeddings (light: flip config flag only)", async () => {
    await runCli(["embeddings", "enable"]);
    expect(enableEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(installEmbeddingsMock).not.toHaveBeenCalled();
    expect(disableEmbeddingsMock).not.toHaveBeenCalled();
    expect(uninstallEmbeddingsMock).not.toHaveBeenCalled();
  });

  it("'embeddings disable' calls disableEmbeddings (light: flip flag + kill daemon)", async () => {
    await runCli(["embeddings", "disable"]);
    expect(disableEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(disableEmbeddingsMock.mock.calls[0]).toEqual([]);
    expect(uninstallEmbeddingsMock).not.toHaveBeenCalled();
  });

  it("'embeddings uninstall' calls uninstallEmbeddings({ prune: false }) by default", async () => {
    await runCli(["embeddings", "uninstall"]);
    expect(uninstallEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(uninstallEmbeddingsMock.mock.calls[0][0]).toEqual({ prune: false });
    expect(disableEmbeddingsMock).not.toHaveBeenCalled();
  });

  it("'embeddings uninstall --prune' passes prune: true", async () => {
    await runCli(["embeddings", "uninstall", "--prune"]);
    expect(uninstallEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(uninstallEmbeddingsMock.mock.calls[0][0]).toEqual({ prune: true });
  });

  it("'embeddings status' calls statusEmbeddings once", async () => {
    await runCli(["embeddings", "status"]);
    expect(statusEmbeddingsMock).toHaveBeenCalledTimes(1);
  });

  it("unknown 'embeddings' subcommand exits 1 with usage warning that lists all 5 subcommands", async () => {
    await runCli(["embeddings", "bogus"]);
    expect(exitSpy).toHaveBeenCalledWith(1);
    const text = stderrText();
    expect(text).toContain("Usage: hivemind embeddings");
    expect(text).toContain("install");
    expect(text).toContain("enable");
    expect(text).toContain("disable");
    expect(text).toContain("uninstall");
    expect(text).toContain("status");
    expect(installEmbeddingsMock).not.toHaveBeenCalled();
    expect(enableEmbeddingsMock).not.toHaveBeenCalled();
    expect(disableEmbeddingsMock).not.toHaveBeenCalled();
    expect(uninstallEmbeddingsMock).not.toHaveBeenCalled();
    expect(statusEmbeddingsMock).not.toHaveBeenCalled();
  });

  it("'install --with-embeddings' runs installEmbeddings (heavy path) after the install loop", async () => {
    detectPlatformsMock.mockReturnValue([{ id: "claude", markerDir: "/x/.claude" }]);
    await runCli(["install", "--with-embeddings"]);
    expect(installs.installClaude).toHaveBeenCalledTimes(1);
    expect(installEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(enableEmbeddingsMock).not.toHaveBeenCalled();
  });

  it("'<platform> install --with-embeddings' runs installEmbeddings (heavy path) after the per-agent install", async () => {
    await runCli(["cursor", "install", "--with-embeddings"]);
    expect(installs.installCursor).toHaveBeenCalledTimes(1);
    expect(installEmbeddingsMock).toHaveBeenCalledTimes(1);
    expect(enableEmbeddingsMock).not.toHaveBeenCalled();
  });
});

describe("hivemind login / status", () => {
  it("'login' calls ensureLoggedIn once", async () => {
    await runCli(["login"]);
    expect(ensureLoggedInMock).toHaveBeenCalledTimes(1);
  });

  it("'login --ref <code>' passes the affiliate code to ensureLoggedIn", async () => {
    await runCli(["login", "--ref", "mario"]);
    expect(ensureLoggedInMock).toHaveBeenCalledWith("mario");
  });

  it("'login --ref' does not swallow a following flag as the code", async () => {
    await runCli(["login", "--ref", "--skip-auth"]);
    expect(ensureLoggedInMock).toHaveBeenCalledWith(undefined);
  });

  it("'status' prints version, login state, and detected platforms", async () => {
    detectPlatformsMock.mockReturnValue([{ id: "claude", markerDir: "/x/.claude" }]);
    isLoggedInMock.mockReturnValue(true);
    await runCli(["status"]);
    const out = stdoutText();
    expect(out).toContain("hivemind 1.2.3");
    expect(out).toContain("logged in: yes");
    expect(out).toContain("/x/.claude");
  });

  it("'status' shows '(none)' when no platforms detected", async () => {
    detectPlatformsMock.mockReturnValue([]);
    isLoggedInMock.mockReturnValue(false);
    await runCli(["status"]);
    expect(stdoutText()).toContain("logged in: no");
    expect(stdoutText()).toContain("(none)");
  });
});

describe("auth subcommand passthrough", () => {
  it.each(["whoami", "logout", "org", "workspaces", "workspace", "invite", "members", "remove", "autoupdate", "sessions"])(
    "'%s' delegates to runAuthCommand with the full argv",
    async (cmd) => {
      await runCli([cmd, "extra-arg"]);
      expect(runAuthCommandMock).toHaveBeenCalledTimes(1);
      expect(runAuthCommandMock.mock.calls[0][0]).toEqual([cmd, "extra-arg"]);
    },
  );
});

describe("unknown command", () => {
  it("warns, prints USAGE, and exits 1", async () => {
    await runCli(["bogus"]);
    expect(stderrText()).toContain("Unknown command: bogus");
    expect(stdoutText()).toContain("Usage:");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("hivemind memory", () => {
  it("backfill delegates to runBackfillMemory (args after subcommand) and exits with its code", async () => {
    runBackfillMemoryMock.mockResolvedValue(0);
    await runCli(["memory", "backfill", "--dry-run", "--n", "5"]);
    expect(runBackfillMemoryMock).toHaveBeenCalledTimes(1);
    expect(runBackfillMemoryMock.mock.calls[0][0]).toEqual(["--dry-run", "--n", "5"]);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("flush delegates to runFlushMemory and reports the uploaded count", async () => {
    runFlushMemoryMock.mockResolvedValue({ pending: 3, uploaded: 3, failed: 0 });
    await runCli(["memory", "flush"]);
    expect(runFlushMemoryMock).toHaveBeenCalledTimes(1);
    expect(stdoutText()).toContain("memory flush: uploaded 3/3 staged summary(ies).");
  });

  it("flush warns + exits 1 when not logged in", async () => {
    runFlushMemoryMock.mockResolvedValue({ pending: 0, uploaded: 0, failed: 0, reason: "not-logged-in" });
    await runCli(["memory", "flush"]);
    expect(stderrText()).toContain("Not logged in — run `hivemind login` before flushing staged memory.");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("unknown memory subcommand prints usage and exits 1", async () => {
    await runCli(["memory", "wat"]);
    expect(stderrText()).toContain("Usage: hivemind memory backfill [--dry-run] [--force] [--n <num|all>] [--window-days N] [--project-only] [--verbose] | flush");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("install fires the background memory backfill", () => {
  it("logs the mining note when maybeAutoBackfillMemory triggers", async () => {
    detectPlatformsMock.mockReturnValue([{ id: "claude", label: "Claude Code" }]);
    isLoggedInMock.mockReturnValue(true);
    maybeAutoBackfillMemoryMock.mockReturnValue({ triggered: true });
    await runCli(["install"]);
    expect(maybeAutoBackfillMemoryMock).toHaveBeenCalledTimes(1);
    expect(stdoutText()).toContain("Mining your past sessions for team memory in the background — sign in, then run `hivemind memory flush` to push.");
  });
});
