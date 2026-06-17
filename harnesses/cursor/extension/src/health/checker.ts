import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HealthDimension, HealthResult } from "../types/health";
import {
  cursorBundleDir,
  cursorHooksPath,
  cursorPluginDir,
  hivemindCursorBundleSrc,
} from "../utils/paths";
import { readJson } from "../utils/fs-json";

const HIVEMIND_MARKER_KEY = "_hivemindManaged";
const DOCS_URL = "https://github.com/activeloopai/hivemind#quick-start";

interface CursorHookEntry {
  type: "command" | "prompt";
  command?: string;
  timeout?: number;
  matcher?: string | Record<string, unknown>;
}

function resolveCliBin(cli: string, fallbacks: string[] = []): string | null {
  const isWin = process.platform === "win32";
  try {
    const out = execFileSync(isWin ? "where" : "which", [cli], { encoding: "utf-8" });
    const match = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    if (match) return match;
  } catch {
    /* not on PATH */
  }
  for (const fb of fallbacks) {
    if (existsSync(fb)) return fb;
  }
  return null;
}

function cursorAgentFallbacks(): string[] {
  const home = homedir();
  return [
    "/usr/local/bin/cursor-agent",
    "/usr/bin/cursor-agent",
    join(home, ".npm-global", "bin", "cursor-agent"),
    join(home, ".local", "bin", "cursor-agent"),
    "/opt/homebrew/bin/cursor-agent",
  ];
}

function probeVersion(bin: string): string | undefined {
  try {
    const out = execFileSync(bin, ["--version"], { encoding: "utf-8", timeout: 5000 }).trim();
    return out.split(/\r?\n/)[0] || undefined;
  } catch {
    return undefined;
  }
}

export function isHivemindEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const cmd = (entry as { command?: string }).command;
  if (typeof cmd !== "string") return false;
  return cmd.replace(/\\/g, "/").includes("/.cursor/hivemind/bundle/");
}

function buildHookCmd(bundleFile: string, pluginDir: string, timeout: number): CursorHookEntry {
  return {
    type: "command",
    command: `node "${join(pluginDir, "bundle", bundleFile)}"`,
    timeout,
  };
}

function buildHookCmdShellMatcher(bundleFile: string, pluginDir: string, timeout: number): CursorHookEntry {
  return {
    type: "command",
    command: `node "${join(pluginDir, "bundle", bundleFile)}"`,
    timeout,
    matcher: "Shell",
  };
}

export function buildHookConfig(pluginDir: string, version: string): Record<string, CursorHookEntry[]> {
  return {
    sessionStart: [buildHookCmd("session-start.js", pluginDir, 30)],
    beforeSubmitPrompt: [buildHookCmd("capture.js", pluginDir, 10)],
    preToolUse: [buildHookCmdShellMatcher("pre-tool-use.js", pluginDir, 30)],
    postToolUse: [buildHookCmd("capture.js", pluginDir, 15)],
    afterAgentResponse: [buildHookCmd("capture.js", pluginDir, 15)],
    stop: [buildHookCmd("capture.js", pluginDir, 15), buildHookCmd("graph-on-stop.js", pluginDir, 30)],
    sessionEnd: [buildHookCmd("session-end.js", pluginDir, 30), buildHookCmd("graph-on-stop.js", pluginDir, 30)],
  };
}

function readExtensionVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function readBundleVersion(): string | undefined {
  const stamp = join(cursorPluginDir(), ".hivemind_version");
  if (!existsSync(stamp)) return undefined;
  try {
    return readFileSync(stamp, "utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}

function checkHivemindCli(): HealthDimension {
  const bin = resolveCliBin("hivemind");
  if (!bin) {
    return {
      id: "d1",
      label: "Hivemind CLI",
      status: "missing",
      message: "Hivemind CLI not found on PATH.",
      remediation: "Install Hivemind CLI to enable shared memory.",
      installCommand: "npm install -g @deeplake/hivemind",
      docsUrl: DOCS_URL,
    };
  }
  const version = probeVersion(bin);
  return {
    id: "d1",
    label: "Hivemind CLI",
    status: "ok",
    message: version ? `Found ${bin} (${version})` : `Found ${bin}`,
  };
}

function checkCursorAgentCli(): HealthDimension {
  const bin = resolveCliBin("cursor-agent", cursorAgentFallbacks());
  if (!bin) {
    return {
      id: "d2",
      label: "cursor-agent CLI",
      status: "missing",
      message: "cursor-agent not found. Session summaries are disabled until it is installed.",
      remediation: "Install cursor-agent and ensure it is on PATH.",
      docsUrl: "https://cursor.com/docs/agent/cli",
    };
  }
  const version = probeVersion(bin);
  return {
    id: "d2",
    label: "cursor-agent CLI",
    status: "ok",
    message: version ? `Found ${bin} (${version})` : `Found ${bin}`,
  };
}

function checkCursorAgentLogin(): HealthDimension {
  const bin = resolveCliBin("cursor-agent", cursorAgentFallbacks());
  if (!bin) {
    return {
      id: "d3",
      label: "cursor-agent login",
      status: "missing",
      message: "cursor-agent not installed; cannot verify login.",
    };
  }
  try {
    execFileSync(bin, ["status"], { encoding: "utf-8", timeout: 8000 });
    return {
      id: "d3",
      label: "cursor-agent login",
      status: "ok",
      message: "cursor-agent is logged in.",
    };
  } catch (err: unknown) {
    const execErr = err as { status?: number; code?: string; message?: string };
    if (execErr.code === "ENOENT") {
      return {
        id: "d3",
        label: "cursor-agent login",
        status: "missing",
        message: "cursor-agent binary disappeared between detection and status check.",
      };
    }
    const exitCode = typeof execErr.status === "number" ? execErr.status : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    const loggedOut =
      exitCode === 401 ||
      exitCode === 403 ||
      /not logged/i.test(msg) ||
      /login required/i.test(msg);
    return {
      id: "d3",
      label: "cursor-agent login",
      status: loggedOut ? "logged_out" : "error",
      message: loggedOut
        ? "cursor-agent is installed but logged out. Summaries will silently fail until you log in."
        : `Could not verify cursor-agent login: ${msg}`,
      remediation: "Run `cursor-agent login` in a terminal or use Hivemind onboarding.",
    };
  }
}

function checkHooksWired(bundleVersion: string | undefined): {
  dimension: HealthDimension;
  wiredVersion?: string;
} {
  const hooksPath = cursorHooksPath();
  const existing = readJson<{ hooks?: Record<string, unknown[]>; [key: string]: unknown }>(hooksPath);
  if (!existing?.hooks) {
    return {
      dimension: {
        id: "d4",
        label: "Hooks wired",
        status: "not_wired",
        message: "Hivemind hooks are not wired in ~/.cursor/hooks.json.",
        remediation: "Use Wire / Refresh Hooks to install lifecycle hooks.",
      },
    };
  }

  const events = ["sessionStart", "beforeSubmitPrompt", "preToolUse", "postToolUse", "afterAgentResponse", "stop", "sessionEnd"];
  const missing: string[] = [];
  for (const ev of events) {
    const entries = existing.hooks[ev];
    if (!Array.isArray(entries) || !entries.some(isHivemindEntry)) {
      missing.push(ev);
    }
  }

  const marker = existing[HIVEMIND_MARKER_KEY] as { version?: string } | undefined;
  const wiredVersion = marker?.version;

  if (missing.length > 0) {
    return {
      dimension: {
        id: "d4",
        label: "Hooks wired",
        status: "not_wired",
        message: `Missing Hivemind hooks for: ${missing.join(", ")}`,
        remediation: "Use Wire / Refresh Hooks to complete wiring.",
      },
      wiredVersion,
    };
  }

  if (bundleVersion && wiredVersion && wiredVersion !== bundleVersion) {
    return {
      dimension: {
        id: "d4",
        label: "Hooks wired",
        status: "stale",
        message: `Hooks wired at v${wiredVersion}; current bundle is v${bundleVersion}.`,
        remediation: "Refresh hooks to update to the current bundle version.",
      },
      wiredVersion,
    };
  }

  return {
    dimension: {
      id: "d4",
      label: "Hooks wired",
      status: "ok",
      message: wiredVersion ? `All seven hooks wired (v${wiredVersion}).` : "All seven hooks wired.",
    },
    wiredVersion,
  };
}

export async function runHealthCheck(): Promise<HealthResult> {
  const bundlePresent = existsSync(cursorBundleDir()) && existsSync(join(cursorBundleDir(), "capture.js"));
  const bundleVersion = readBundleVersion() ?? readExtensionVersion();
  const srcBundle = hivemindCursorBundleSrc();
  const srcPresent = existsSync(join(srcBundle, "capture.js"));
  const provisionedPresent = bundlePresent;

  const d1 = checkHivemindCli();
  const d2 = checkCursorAgentCli();
  const d3 = checkCursorAgentLogin();
  const { dimension: d4, wiredVersion } = checkHooksWired(bundlePresent ? bundleVersion : undefined);

  if (!provisionedPresent && !srcPresent) {
    d4.status = "error";
    d4.message = "Hook bundle missing at ~/.cursor/hivemind/bundle/. Run hivemind cursor install or Wire Hooks after building.";
  }

  const dimensions = [d1, d2, d3, d4];
  const summariesDisabled = d2.status !== "ok" || d3.status !== "ok";
  const allHealthy = dimensions.every((d) => d.status === "ok") && provisionedPresent;

  return {
    checkedAt: new Date().toISOString(),
    dimensions,
    bundlePresent: provisionedPresent,
    bundleVersion,
    wiredVersion,
    allHealthy,
    summariesDisabled,
  };
}

export function getHivemindInstallCommand(): string {
  return "npm install -g @deeplake/hivemind";
}
