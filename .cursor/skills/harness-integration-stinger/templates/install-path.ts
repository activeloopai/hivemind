/**
 * Annotated install-<host>.ts skeleton for a new Hivemind harness adapter.
 *
 * An installer does three things, in order:
 *   1. DETECT  - is the host present? Cheap, side-effect free.
 *   2. WIRE    - lay down the bundle, write the host config.
 *   3. CONVERGE - re-running install must be idempotent.
 *
 * Replace all TODO markers. See guides/01-capability-detection-install.md.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// For MCP-capable hosts, reuse the shared helper instead of hand-rolling:
// import { ensureMcpServerInstalled, MCP_SERVER_PATH } from "./install-mcp-shared.js";

// ---------------------------------------------------------------------------
// Paths - resolve everything from the host's own home dir. Never hardcode.
// ---------------------------------------------------------------------------

const HOST_HOME = join(homedir(), ".TODO_HOST");           // e.g. ~/.acme
const CONFIG_PATH = join(HOST_HOME, "TODO_config_file");   // e.g. hooks.json / config.yaml
const HIVEMIND_DIR = join(HOST_HOME, "hivemind");
const BUNDLE_DIR = join(HIVEMIND_DIR, "bundle");           // forked entries live here

// ---------------------------------------------------------------------------
// 1. DETECTION - cheap, side-effect free. Runs on every `hivemind install`.
// ---------------------------------------------------------------------------

export function isHostInstalled(): boolean {
  // Probe ONLY the filesystem. Do NOT write, do NOT spawn.
  return existsSync(HOST_HOME);
}

// ---------------------------------------------------------------------------
// 2 + 3. WIRE (idempotently).
// ---------------------------------------------------------------------------

export async function installHost(): Promise<void> {
  if (!isHostInstalled()) return; // host absent - skip silently

  // (a) Lay down the esbuild bundle output into BUNDLE_DIR.
  await layDownBundle(BUNDLE_DIR);

  // (b) Wire the host using its mechanism. Pick ONE primary (most hosts combine two):

  // --- HOOKS ---------------------------------------------------------------
  // Fork node "<bundle>/<entry>.js" per event. Capture = async; recall = on path.
  await upsertHooks(CONFIG_PATH, [
    { event: "SessionStart", entry: "session-start.js", timeout: 10 },
    { event: "UserPromptSubmit", entry: "capture.js", timeout: 10, async: true },
    { event: "PostToolUse", entry: "capture.js", timeout: 15, async: true },
    { event: "Stop", entry: "capture.js", timeout: 30, async: true },
    // ... add the events this host supports
  ]);

  // --- MCP (MCP-capable hosts only, e.g. hermes) ---------------------------
  // await ensureMcpServerInstalled(BUNDLE_DIR);
  // upsertConfigKey(CONFIG_PATH, "mcp_servers.hivemind", {
  //   command: "node",
  //   args: [join(BUNDLE_DIR, "mcp-server.js")],
  // });

  // --- NATIVE EXTENSION (Cursor / pi / OpenClaw) ---------------------------
  // pi: drop the RAW .ts - pi compiles at load. Do NOT pre-compile.
  // OpenClaw: write openclaw.plugin.json with contracts.tools + contracts.commands.

  // --- AGENTS.md MARKER (pi) -----------------------------------------------
  // replaceMarkerBlock(join(HOST_HOME, "agent", "AGENTS.md"), HIVEMIND_MARKER, markerText());
}

// ---------------------------------------------------------------------------
// Idempotency helpers - recognize prior hivemind entries by bundle path.
// ---------------------------------------------------------------------------

function isHivemindEntry(command: string): boolean {
  // Re-install must not duplicate. Filter prior hivemind entries, then re-add.
  return command.includes(`/.TODO_HOST/hivemind/bundle/`);
}

// ---------------------------------------------------------------------------
// Stubs - replace with real implementations.
// ---------------------------------------------------------------------------

async function layDownBundle(_dir: string): Promise<void> {
  // TODO: copy esbuild output from harnesses/<host>/ into _dir
}

async function upsertHooks(
  _configPath: string,
  _events: Array<{ event: string; entry: string; timeout: number; async?: boolean }>,
): Promise<void> {
  // TODO: read config, filter out prior hivemind hooks (isHivemindEntry),
  // append the current set, write back. Idempotent.
}
