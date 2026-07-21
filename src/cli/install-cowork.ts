import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeDesktopConfigDir, ensureDir, log } from "./util.js";
import { ensureMcpServerInstalled, buildMcpServerEntry } from "./install-mcp-shared.js";

// Claude Cowork integration.
//
// Cowork is Anthropic's agentic desktop assistant, hosted inside the
// Claude Desktop app. It reads MCP connectors from the SAME file as
// Claude Desktop chat — claude_desktop_config.json, `mcpServers` key
// (https://support.claude.com/en/articles/11503834). Local stdio servers
// are supported, so we register the shared hivemind MCP server (the one
// already installed at ~/.hivemind/mcp/server.js) and Cowork gains the
// hivemind_search / read / index tools with zero manual setup.
//
// Note: this is the Claude DESKTOP config dir, NOT ~/.claude (that's the
// Claude Code CLI, handled by install-claude.ts).

const CONFIG_DIR = claudeDesktopConfigDir();
const CONFIG_PATH = join(CONFIG_DIR, "claude_desktop_config.json");
const SERVER_KEY = "hivemind";

type Config = Record<string, unknown>;

function readConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return {};
  const txt = readFileSync(CONFIG_PATH, "utf-8").trim();
  if (!txt) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(txt);
  } catch {
    // Malformed config — never clobber the user's file. Surface it so they
    // can fix it rather than silently overwriting hand-edited connectors.
    throw new Error(
      `claude_desktop_config.json at ${CONFIG_PATH} is not valid JSON. Fix or remove it, then rerun.`,
    );
  }
  return parsed && typeof parsed === "object" ? (parsed as Config) : {};
}

function writeConfig(cfg: Config): void {
  ensureDir(CONFIG_DIR);
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

export function installCowork(): void {
  // 1. Shared stdio MCP server binary at ~/.hivemind/mcp/server.js.
  ensureMcpServerInstalled();

  // 2. Register it in Claude Desktop's connector config (shared by Cowork).
  //    Non-destructive merge: preserve any servers the user already added.
  const cfg = readConfig();
  const servers =
    cfg.mcpServers && typeof cfg.mcpServers === "object"
      ? (cfg.mcpServers as Record<string, unknown>)
      : {};
  servers[SERVER_KEY] = buildMcpServerEntry();
  cfg.mcpServers = servers;
  writeConfig(cfg);
  log(`  Claude Cowork  config updated -> ${CONFIG_PATH} (mcpServers.${SERVER_KEY})`);
}

export function uninstallCowork(): void {
  if (!existsSync(CONFIG_PATH)) return;
  let cfg: Config;
  try {
    cfg = readConfig();
  } catch {
    // Malformed file — leave it alone rather than fail the uninstall.
    return;
  }
  const servers = cfg.mcpServers;
  if (!servers || typeof servers !== "object" || !(SERVER_KEY in servers)) return;

  delete (servers as Record<string, unknown>)[SERVER_KEY];
  if (Object.keys(servers as Record<string, unknown>).length === 0) delete cfg.mcpServers;

  if (Object.keys(cfg).length === 0) {
    unlinkSync(CONFIG_PATH);
  } else {
    writeConfig(cfg);
  }
  log(`  Claude Cowork  hivemind entry removed from ${CONFIG_PATH}`);
}
