/**
 * End-to-end-ish tests for `hivemind dashboard`. fetchOrgStats is
 * mocked at the module boundary; everything else (data loading,
 * rendering, file IO) runs for real against tmpdir + overridden
 * HOME. The opener is injected as a stub so no browser actually
 * launches during tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { orgStatsMock } = vi.hoisted(() => ({ orgStatsMock: vi.fn() }));
vi.mock("../../src/notifications/sources/org-stats.js", () => ({
  fetchOrgStats: orgStatsMock,
}));

import {
  defaultDashboardOutPath,
  parseDashboardArgs,
  runDashboardCommand,
} from "../../src/commands/dashboard.js";
import { deriveProjectKey } from "../../src/skillify/state.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

describe("parseDashboardArgs", () => {
  it("returns help for --help / -h", () => {
    expect(parseDashboardArgs(["--help"]).help).toBe(true);
    expect(parseDashboardArgs(["-h"]).help).toBe(true);
  });
  it("defaults cwd to process.cwd(), open=true, outPath empty", () => {
    const r = parseDashboardArgs([]);
    expect(r.args?.cwd).toBe(process.cwd());
    expect(r.args?.open).toBe(true);
    expect(r.args?.outPath).toBe("");
  });
  it("parses --no-open", () => {
    expect(parseDashboardArgs(["--no-open"]).args?.open).toBe(false);
  });
  it("parses --cwd <value> AND --cwd=value forms", () => {
    expect(parseDashboardArgs(["--cwd", "/foo"]).args?.cwd).toBe("/foo");
    expect(parseDashboardArgs(["--cwd=/bar"]).args?.cwd).toBe("/bar");
  });
  it("parses --out <value> AND --out=value forms", () => {
    expect(parseDashboardArgs(["--out", "/o.html"]).args?.outPath).toBe("/o.html");
    expect(parseDashboardArgs(["--out=/p.html"]).args?.outPath).toBe("/p.html");
  });
  it("errors on unknown flags", () => {
    expect(parseDashboardArgs(["--nope"]).error).toMatch(/unknown/);
  });
  it("errors on a dangling --cwd / --out with no value", () => {
    expect(parseDashboardArgs(["--cwd"]).error).toMatch(/requires a value/);
    expect(parseDashboardArgs(["--out"]).error).toMatch(/requires a value/);
  });
  it("rejects a flag token used as the value for --cwd / --out", () => {
    // codex review on commit 4: `--out --no-open` previously wrote a
    // file called `./--no-open`.
    expect(parseDashboardArgs(["--cwd", "--no-open"]).error).toMatch(/--cwd requires a value/);
    expect(parseDashboardArgs(["--out", "--no-open"]).error).toMatch(/--out requires a value/);
    expect(parseDashboardArgs(["--out", "-foo"]).error).toMatch(/--out requires a value/);
  });
  it("parses --serve (default port undefined → server picks 8123)", () => {
    const r = parseDashboardArgs(["--serve"]);
    expect(r.args?.serve).toBe(true);
    expect(r.args?.port).toBeUndefined();
  });
  it("parses --port N AND --port=N forms", () => {
    expect(parseDashboardArgs(["--serve", "--port", "9000"]).args?.port).toBe(9000);
    expect(parseDashboardArgs(["--serve", "--port=9000"]).args?.port).toBe(9000);
  });
  it("rejects non-integer / out-of-range ports", () => {
    expect(parseDashboardArgs(["--serve", "--port", "abc"]).error).toMatch(/--port must be an integer/);
    expect(parseDashboardArgs(["--serve", "--port", "-1"]).error).toMatch(/--port requires a value/); // - prefix triggers earlier guard
    expect(parseDashboardArgs(["--serve", "--port=70000"]).error).toMatch(/--port must be an integer/);
    expect(parseDashboardArgs(["--serve", "--port="]).error).toMatch(/--port requires a value/);
  });
  it("rejects --port unless --serve is also passed (codex review on serve commit)", () => {
    expect(parseDashboardArgs(["--port", "9000"]).error).toMatch(/--port requires --serve/);
    expect(parseDashboardArgs(["--port=9000"]).error).toMatch(/--port requires --serve/);
    // sanity: with --serve it parses cleanly
    expect(parseDashboardArgs(["--serve", "--port", "9000"]).error).toBeUndefined();
  });
});

describe("defaultDashboardOutPath", () => {
  it("lives under HOME/.hivemind/dashboards/<repo-key>/index.html", () => {
    const home = process.env.HOME ?? "";
    expect(defaultDashboardOutPath("deadbeef")).toBe(
      join(home, ".hivemind", "dashboards", "deadbeef", "index.html"),
    );
  });
});

describe("runDashboardCommand", () => {
  let homeDir: string;
  let originalHome: string | undefined;
  let stdout: string;
  let stderr: string;
  const out = (s: string) => { stdout += s; };
  const err = (s: string) => { stderr += s; };

  function makeFakeServer() {
    let resolveStopped!: () => void;
    const stopped = new Promise<void>(r => { resolveStopped = r; });
    const close = vi.fn(async () => { resolveStopped(); });
    const server = vi.fn(async (_opts: any) => ({
      host: "127.0.0.1",
      port: 8123,
      stopped,
      close,
    }));
    return { server, close, resolveStopped };
  }

  function makeSignalSink() {
    let captured: { signal: NodeJS.Signals; handler: () => void } | null = null;
    const off = vi.fn();
    const onSignal = vi.fn((signal: NodeJS.Signals, handler: () => void) => {
      if (signal === "SIGINT") captured = { signal, handler };
      return off;
    });
    return { onSignal, off, fire: () => captured?.handler() };
  }

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "hm-dash-cli-"));
    originalHome = process.env.HOME;
    setFakeHome(homeDir);
    stdout = "";
    stderr = "";
    orgStatsMock.mockReset();
    orgStatsMock.mockResolvedValue(null);
  });

  afterEach(() => {
    clearFakeHome();
    rmSync(homeDir, { recursive: true, force: true });
  });

  it("--help prints USAGE and returns 0", async () => {
    const code = await runDashboardCommand(["--help"], { out, err });
    expect(code).toBe(0);
    expect(stdout).toContain("hivemind dashboard");
    expect(stdout).toContain("Usage:");
    expect(stderr).toBe("");
  });

  it("returns 2 and prints USAGE on unknown flag", async () => {
    const code = await runDashboardCommand(["--bogus"], { out, err });
    expect(code).toBe(2);
    expect(stderr).toContain("unknown arg");
    expect(stderr).toContain("Usage:");
  });

  it("writes the HTML to the default path under HOME and reports it", async () => {
    const opener = vi.fn().mockReturnValue({ attempted: true, command: "xdg-open" });
    const code = await runDashboardCommand(["--cwd", "/tmp"], { out, err, opener, isRemote: false });
    expect(code).toBe(0);
    const { key } = deriveProjectKey("/tmp");
    const expectedPath = join(homeDir, ".hivemind", "dashboards", key, "index.html");
    expect(existsSync(expectedPath)).toBe(true);
    expect(stdout).toContain(`Wrote ${expectedPath}`);
    expect(stdout).toContain("Opening via xdg-open");
    const html = readFileSync(expectedPath, "utf-8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("hivemind dashboard");
    // Empty-state for graph because we never built one
    expect(html).toContain("No graph snapshot yet");
    // Empty-state for KPIs because no creds and no usage stats
    expect(html).toContain("Run a session to start tracking");
  });

  it("respects --out and writes to the requested path", async () => {
    const outPath = join(homeDir, "custom", "dash.html");
    const opener = vi.fn().mockReturnValue({ attempted: false });
    const code = await runDashboardCommand(
      ["--cwd", "/tmp", "--out", outPath, "--no-open"],
      { out, err, opener },
    );
    expect(code).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    expect(opener).not.toHaveBeenCalled();
    expect(stdout).not.toContain("Opening via");
  });

  it("--no-open does NOT call the opener", async () => {
    const opener = vi.fn();
    await runDashboardCommand(["--cwd", "/tmp", "--no-open"], { out, err, opener });
    expect(opener).not.toHaveBeenCalled();
  });

  it("falls back to local serve when the opener returns attempted=false", async () => {
    const opener = vi.fn().mockReturnValue({ attempted: false });
    const { server } = makeFakeServer();
    const { onSignal, fire } = makeSignalSink();
    const runP = runDashboardCommand(["--cwd", "/tmp"], { out, err, opener, server: server as any, onSignal, isRemote: false });
    await new Promise(r => setImmediate(r));
    fire();
    const code = await runP;
    expect(code).toBe(0);
    expect(stdout).toContain("(no opener for this platform; click the URL above or open it manually)");
  });

  it("surfaces a runtime write failure as a one-line stderr instead of a stack", async () => {
    // --out points at a child of an existing FILE (not a directory).
    // mkdir -p there fails with ENOTDIR; the catch block must convert
    // that into a one-liner rather than letting node print a stack.
    const { writeFileSync } = await import("node:fs");
    const fileMasqueradingAsDir = join(homeDir, "iamafile");
    writeFileSync(fileMasqueradingAsDir, "x");
    const bogusOut = join(fileMasqueradingAsDir, "nested", "dash.html");

    const code = await runDashboardCommand(
      ["--cwd", "/tmp", "--out", bogusOut, "--no-open"],
      { out, err, opener: vi.fn() },
    );
    expect(code).toBe(1);
    expect(stderr).toContain("failed to write");
    // No node-style stack trace in the rendered error.
    expect(stderr).not.toContain("at Object.");
  });

  describe("--serve mode", () => {
    it("starts the server, prints the URL, opens it (URL not path), and exits 0 on SIGINT", async () => {
      const { server, close } = makeFakeServer();
      const { onSignal, off, fire } = makeSignalSink();
      const opener = vi.fn().mockReturnValue({ attempted: true, command: "xdg-open" });

      const runP = runDashboardCommand(
        ["--cwd", "/tmp", "--serve"],
        { out, err, opener, server: server as any, onSignal },
      );
      // give the runner a microtask to bind handlers
      await new Promise(r => setImmediate(r));
      fire(); // simulate Ctrl+C
      const code = await runP;

      expect(code).toBe(0);
      expect(server).toHaveBeenCalledWith({ html: expect.any(String), port: undefined });
      expect(stdout).toContain("Serving dashboard at http://127.0.0.1:8123/");
      expect(stdout).toContain("Opening via xdg-open");
      expect(opener).toHaveBeenCalledWith("http://127.0.0.1:8123/");
      expect(close).toHaveBeenCalled();
      // both SIGINT and SIGTERM handlers were registered and unregistered
      expect(onSignal).toHaveBeenCalledTimes(2);
      expect(off).toHaveBeenCalledTimes(2);
    });

    it("--serve --no-open does NOT call the opener", async () => {
      const { server } = makeFakeServer();
      const { onSignal, fire } = makeSignalSink();
      const opener = vi.fn();

      const runP = runDashboardCommand(
        ["--cwd", "/tmp", "--serve", "--no-open"],
        { out, err, opener, server: server as any, onSignal },
      );
      await new Promise(r => setImmediate(r));
      fire();
      await runP;

      expect(opener).not.toHaveBeenCalled();
      expect(stdout).toContain("Serving dashboard at http://127.0.0.1:8123/");
    });

    it("forwards --port to the server module", async () => {
      const { server } = makeFakeServer();
      const { onSignal, fire } = makeSignalSink();

      const runP = runDashboardCommand(
        ["--cwd", "/tmp", "--serve", "--no-open", "--port", "9090"],
        { out, err, opener: vi.fn(), server: server as any, onSignal },
      );
      await new Promise(r => setImmediate(r));
      fire();
      await runP;

      expect(server).toHaveBeenCalledWith({ html: expect.any(String), port: 9090 });
    });

    it("exits cleanly when the server stops on its own (no SIGINT)", async () => {
      const { server, resolveStopped } = makeFakeServer();
      const { onSignal } = makeSignalSink();

      const runP = runDashboardCommand(
        ["--cwd", "/tmp", "--serve", "--no-open"],
        { out, err, opener: vi.fn(), server: server as any, onSignal },
      );
      await new Promise(r => setImmediate(r));
      resolveStopped(); // emulate server.close() fired by something else
      const code = await runP;
      expect(code).toBe(0);
    });

    it("returns 1 on server-start failure with a one-line stderr", async () => {
      const server = vi.fn(async () => { throw new Error("EACCES bind"); });
      const { onSignal } = makeSignalSink();
      const code = await runDashboardCommand(
        ["--cwd", "/tmp", "--serve"],
        { out, err, opener: vi.fn(), server: server as any, onSignal },
      );
      expect(code).toBe(1);
      expect(stderr).toContain("failed to start server");
      expect(stderr).toContain("EACCES");
      expect(stderr).not.toContain("at Object.");
    });
  });
});
