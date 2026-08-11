import { existsSync } from "node:fs";
import { join } from "node:path";
import { HOME, pkgRoot, ensureDir, copyDir, writeVersionStamp, log } from "./util.js";
import { getVersion } from "./version.js";
import { homedir } from "node:os";

// Shared installer logic for the hivemind MCP server.
//
// All Tier B consumers (Cline, Roo Code, Kilo Code) share one MCP server
// binary at ~/.hivemind/mcp/server.js. Per-consumer installers register
// that absolute path in their own MCP config file.

export const HIVEMIND_DIR = join(HOME, ".hivemind");
export const MCP_DIR = join(HIVEMIND_DIR, "mcp");
export const MCP_SERVER_PATH = join(MCP_DIR, "server.js");
export const MCP_PACKAGE_JSON = join(MCP_DIR, "package.json");

function paths(home = homedir()): { hivemindDir: string; mcpDir: string; serverPath: string } {
  const hivemindDir = join(home, ".hivemind");
  const mcpDir = join(hivemindDir, "mcp");
  return { hivemindDir, mcpDir, serverPath: join(mcpDir, "server.js") };
}

/** Copy the bundled MCP server into ~/.hivemind/mcp/ if missing or out of date. */
export function ensureMcpServerInstalled(): void {
  const active = paths();
  const srcDir = join(pkgRoot(), "mcp", "bundle");
  if (!existsSync(srcDir)) {
    throw new Error(
      `MCP server bundle missing at ${srcDir}. Run 'npm run build' to produce it before installing Tier B consumers.`,
    );
  }
  ensureDir(active.mcpDir);
  copyDir(srcDir, active.mcpDir);
  writeVersionStamp(active.hivemindDir, getVersion());
  log(`  hivemind-mcp   server installed -> ${active.serverPath}`);
}

/** Standard MCP server descriptor for stdio transport. */
export function buildMcpServerEntry(): Record<string, unknown> {
  return {
    command: "node",
    args: [paths().serverPath],
  };
}
