/**
 * Hivemind MCP server — stdio transport.
 *
 * Spawned as a subprocess by a local MCP client (Hermes, Cursor, etc.).
 * Loads credentials from ~/.deeplake/credentials.json and serves the
 * three Hivemind tools (search/read/index) over JSON-RPC on stdin/stdout.
 *
 * Tool registrations live in ./tools.ts and are shared with the HTTP
 * transport (./http-server.ts) used by remote clients like the ChatGPT
 * App Directory.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadCredentials } from "../commands/auth.js";
import { loadConfig } from "../config.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { getVersion } from "../cli/version.js";
import { registerHivemindTools, type ContextResult } from "./tools.js";

function getStdioContext(): ContextResult {
  const creds = loadCredentials();
  if (!creds?.token) {
    return { error: "Not authenticated. Run `hivemind login` to sign in to Deeplake." };
  }
  const config = loadConfig();
  if (!config) {
    return { error: "Hivemind config could not be loaded — credentials present but invalid." };
  }
  const api = new DeeplakeApi(config.token, config.apiUrl, config.orgId, config.workspaceId, config.tableName);
  return { api, memoryTable: config.tableName, sessionsTable: config.sessionsTableName };
}

const server = new McpServer({
  name: "hivemind",
  version: getVersion(),
});

registerHivemindTools(server, getStdioContext);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`hivemind-mcp fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
