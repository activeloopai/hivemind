/**
 * Hivemind MCP server — HTTP (Streamable) transport.
 *
 * Reachable over the network at POST /mcp + GET /mcp (SSE). Used by the
 * ChatGPT App Directory and any other Apps SDK / MCP HTTP client.
 *
 * Auth: the user's Auth0 JWT arrives in `Authorization: Bearer <token>`.
 * We don't validate it locally — `DeeplakeApi` forwards it to deeplake-api,
 * which validates it via the existing `internal/auth/jwt.go`. Missing or
 * malformed → 401 with `WWW-Authenticate` pointing at the Auth0 issuer.
 *
 * Org resolution: on first tool call per session we call
 * `GET https://api.deeplake.ai/organizations` with the user's token and
 * pick their primary org. Workspace + table names mirror the CLI defaults
 * (workspaceId="default", tableName="memory", sessionsTableName="sessions"),
 * per src/config.ts.
 */

import http from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { DeeplakeApi } from "../deeplake-api.js";
import { deeplakeClientHeader } from "../utils/client-header.js";
import { getVersion } from "../cli/version.js";
import { registerHivemindTools, type ContextResult } from "./tools.js";

const DEFAULT_API_URL = "https://api.deeplake.ai";
const DEFAULT_WORKSPACE = "default";
const DEFAULT_MEMORY_TABLE = "memory";
const DEFAULT_SESSIONS_TABLE = "sessions";

/** Per-session resources. One MCP server + transport per ChatGPT session. */
interface SessionState {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  token: string;
  apiUrl: string;
  /**
   * Resolved org id. Either pre-set from `pinnedOrgId` at server boot, or
   * populated on first tool call via `GET /organizations`. `null` = not
   * yet resolved.
   */
  resolvedOrgId: string | null;
  workspaceId: string;
  memoryTable: string;
  sessionsTable: string;
}

export interface HttpMcpServerOptions {
  /** Port to listen on. Default 8787. */
  port?: number;
  /** Host to bind. Default '0.0.0.0' (container-friendly). */
  host?: string;
  /** Auth0 issuer URL advertised in WWW-Authenticate on 401. */
  authIssuer: string;
  /** Deeplake API base URL. Default https://api.deeplake.ai. */
  apiUrl?: string;
  /**
   * Optional pinned org id. When set, skips the `/organizations` lookup and
   * uses this org for every authenticated request. Useful for:
   *   - single-tenant deployments
   *   - smoke testing without picking the wrong org from a multi-org user
   *   - self-hosted Hivemind instances pinned to one workspace
   * Set via env `HIVEMIND_MCP_ORG_ID`.
   */
  orgId?: string;
  /** Workspace id. Default "default". Set via env `HIVEMIND_MCP_WORKSPACE`. */
  workspaceId?: string;
  /** Memory table name. Default "memory". Set via env `HIVEMIND_MCP_TABLE`. */
  memoryTable?: string;
  /** Sessions table name. Default "sessions". Set via env `HIVEMIND_MCP_SESSIONS_TABLE`. */
  sessionsTable?: string;
  /** Quiet log output (used by tests). */
  silent?: boolean;
}

interface ResolvedOptions {
  port: number;
  host: string;
  authIssuer: string;
  apiUrl: string;
  pinnedOrgId: string | null;
  workspaceId: string;
  memoryTable: string;
  sessionsTable: string;
  silent: boolean;
}

interface ServerState {
  server: http.Server;
  sessions: Map<string, SessionState>;
  options: ResolvedOptions;
}

function extractBearer(req: http.IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (!header || typeof header !== "string") return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function send401(res: http.ServerResponse, authIssuer: string, errorDescription: string): void {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="${authIssuer}", error="invalid_token", error_description="${errorDescription}"`,
  );
  sendJson(res, 401, {
    error: "invalid_token",
    error_description: errorDescription,
    auth_server: authIssuer,
  });
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function resolvePrimaryOrgId(token: string, apiUrl: string): Promise<string | null> {
  const resp = await fetch(`${apiUrl}/organizations`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
    },
  });
  if (!resp.ok) return null;
  const body = (await resp.json().catch(() => null)) as unknown;
  // Tolerate both {organizations: [...]} and bare array shapes.
  const orgs = Array.isArray(body)
    ? body
    : Array.isArray((body as { organizations?: unknown[] } | null)?.organizations)
      ? (body as { organizations: unknown[] }).organizations
      : null;
  if (!orgs || orgs.length === 0) return null;
  const first = orgs[0] as { id?: string; org_id?: string };
  return first.id ?? first.org_id ?? null;
}

function buildGetContext(state: SessionState): () => Promise<ContextResult> {
  return async () => {
    if (!state.resolvedOrgId) {
      try {
        state.resolvedOrgId = await resolvePrimaryOrgId(state.token, state.apiUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: `Could not resolve your Hivemind organization: ${msg}` };
      }
    }
    if (!state.resolvedOrgId) {
      return {
        error:
          "Could not resolve your Hivemind organization. Make sure you have at least one org on Deeplake before connecting.",
      };
    }
    const api = new DeeplakeApi(
      state.token,
      state.apiUrl,
      state.resolvedOrgId,
      state.workspaceId,
      state.memoryTable,
    );
    return {
      api,
      memoryTable: state.memoryTable,
      sessionsTable: state.sessionsTable,
    };
  };
}

async function createSession(token: string, opts: ResolvedOptions): Promise<SessionState> {
  const sessionId = randomUUID();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });
  const server = new McpServer({
    name: "hivemind",
    version: getVersion(),
  });
  const state: SessionState = {
    server,
    transport,
    token,
    apiUrl: opts.apiUrl,
    resolvedOrgId: opts.pinnedOrgId,
    workspaceId: opts.workspaceId,
    memoryTable: opts.memoryTable,
    sessionsTable: opts.sessionsTable,
  };
  registerHivemindTools(server, buildGetContext(state));
  await server.connect(transport);
  return state;
}

async function handleMcpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  st: ServerState,
): Promise<void> {
  const token = extractBearer(req);
  if (!token) {
    send401(res, st.options.authIssuer, "Missing Bearer token. Sign in to Hivemind to connect.");
    return;
  }

  const sessionIdHeader = req.headers["mcp-session-id"];
  const existingId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

  let session = existingId ? st.sessions.get(existingId) : undefined;
  if (!session) {
    // New session — body must be the MCP `initialize` request.
    session = await createSession(token, st.options);
    // The transport assigns the session id on init; store under that id once known.
    // We use the transport's sessionId (set by the SDK after handleRequest).
  }

  const body = req.method === "POST" ? await readBody(req) : undefined;

  try {
    await session.transport.handleRequest(req, res, body);
  } catch (err) {
    if (!st.options.silent) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`mcp http error: ${msg}\n`);
    }
    if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
    return;
  }

  // After the SDK assigns sessionId, register under that id for subsequent lookups.
  const assignedId = session.transport.sessionId;
  if (assignedId && !st.sessions.has(assignedId)) {
    st.sessions.set(assignedId, session);
  }
}

function handleHealth(res: http.ServerResponse): void {
  sendJson(res, 200, { status: "ok", version: getVersion() });
}

function handleNotFound(res: http.ServerResponse): void {
  sendJson(res, 404, { error: "not_found" });
}

export async function startHttpMcpServer(opts: HttpMcpServerOptions): Promise<{
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}> {
  const options: ResolvedOptions = {
    port: opts.port ?? 8787,
    host: opts.host ?? "0.0.0.0",
    authIssuer: opts.authIssuer,
    apiUrl: opts.apiUrl ?? DEFAULT_API_URL,
    pinnedOrgId: opts.orgId ?? null,
    workspaceId: opts.workspaceId ?? DEFAULT_WORKSPACE,
    memoryTable: opts.memoryTable ?? DEFAULT_MEMORY_TABLE,
    sessionsTable: opts.sessionsTable ?? DEFAULT_SESSIONS_TABLE,
    silent: opts.silent ?? false,
  };
  const sessions = new Map<string, SessionState>();
  const state: ServerState = {
    server: undefined as unknown as http.Server,
    sessions,
    options,
  };

  const httpServer = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/health" && req.method === "GET") {
      handleHealth(res);
      return;
    }
    if (url === "/mcp" || url.startsWith("/mcp?")) {
      // POST = client → server, GET = SSE stream, DELETE = session teardown.
      void handleMcpRequest(req, res, state);
      return;
    }
    handleNotFound(res);
  });

  state.server = httpServer;

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(options.port, options.host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  // OS-assigned ports (options.port === 0) only resolve after listen()
  // succeeds. Read the actual port from the live socket so callers know
  // where the server is reachable.
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : options.port;

  if (!options.silent) {
    process.stderr.write(
      `hivemind-mcp http listening on http://${options.host}:${actualPort}/mcp (auth issuer: ${options.authIssuer})\n`,
    );
  }

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve, reject) =>
      httpServer.close(err => (err ? reject(err) : resolve())),
    );
    for (const session of sessions.values()) {
      await session.transport.close().catch(() => {});
    }
    sessions.clear();
  };

  return { server: httpServer, port: actualPort, close };
}
