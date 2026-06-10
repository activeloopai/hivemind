/**
 * `hivemind serve-mcp` — runs the HTTP MCP server.
 *
 * This is the entry point used in production hosting (one small container)
 * to serve the three Hivemind tools to remote MCP clients like the ChatGPT
 * App Directory. Local agents (Hermes, Cursor, etc.) keep using the
 * existing stdio MCP server.
 *
 * Configuration is via env vars so the container manifest is simple:
 *
 *   HIVEMIND_MCP_PORT          — listen port (default 8787)
 *   HIVEMIND_MCP_HOST          — bind host (default 0.0.0.0)
 *   HIVEMIND_MCP_AUTH_ISSUER   — Auth0 issuer advertised in WWW-Authenticate
 *                                (required; e.g. https://auth-beta.deeplake.ai/)
 *   HIVEMIND_API_URL           — Deeplake API base (default https://api.deeplake.ai)
 *
 *   Optional org/workspace pinning (skip the per-session /organizations lookup):
 *   HIVEMIND_MCP_ORG_ID            — pin to this org id
 *   HIVEMIND_MCP_WORKSPACE         — workspace id (default "default")
 *   HIVEMIND_MCP_TABLE             — memory table name (default "memory")
 *   HIVEMIND_MCP_SESSIONS_TABLE    — sessions table name (default "sessions")
 */

import { startHttpMcpServer } from "../mcp/http-server.js";
import { log, warn } from "./util.js";

export async function runServeMcp(_args: string[]): Promise<number> {
  const authIssuer = process.env.HIVEMIND_MCP_AUTH_ISSUER ?? "";
  if (!authIssuer) {
    warn(
      "HIVEMIND_MCP_AUTH_ISSUER is required. Set it to your Auth0 issuer URL " +
        "(e.g. https://auth-beta.deeplake.ai/) so 401 responses can tell ChatGPT " +
        "where to send the user to sign in.",
    );
    return 1;
  }

  const port = Number.parseInt(process.env.HIVEMIND_MCP_PORT ?? "8787", 10);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    warn(`Invalid HIVEMIND_MCP_PORT: ${process.env.HIVEMIND_MCP_PORT}`);
    return 1;
  }

  const host = process.env.HIVEMIND_MCP_HOST ?? "0.0.0.0";
  const apiUrl = process.env.HIVEMIND_API_URL ?? "https://api.deeplake.ai";
  const orgId = process.env.HIVEMIND_MCP_ORG_ID || undefined;
  const workspaceId = process.env.HIVEMIND_MCP_WORKSPACE || undefined;
  const memoryTable = process.env.HIVEMIND_MCP_TABLE || undefined;
  const sessionsTable = process.env.HIVEMIND_MCP_SESSIONS_TABLE || undefined;

  try {
    const { close } = await startHttpMcpServer({
      port, host, authIssuer, apiUrl,
      orgId, workspaceId, memoryTable, sessionsTable,
    });
    log(`hivemind serve-mcp ready on http://${host}:${port}/mcp`);

    const shutdown = async (signal: string): Promise<void> => {
      log(`received ${signal}, shutting down`);
      await close();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));

    // Block forever (until signaled).
    await new Promise<void>(() => {});
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`hivemind serve-mcp failed to start: ${msg}`);
    return 1;
  }
}
