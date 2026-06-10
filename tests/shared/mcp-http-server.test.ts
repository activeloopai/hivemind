/**
 * Tests for the HTTP MCP server (src/mcp/http-server.ts).
 *
 * Focus: the contract that *we* own around the SDK transport — routing,
 * auth gating, 401 discovery shape. We don't re-test the SDK's JSON-RPC
 * machinery; that lives in @modelcontextprotocol/sdk.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startHttpMcpServer } from "../../src/mcp/http-server.js";

interface RunningServer {
  baseUrl: string;
  close: () => Promise<void>;
}

const AUTH_ISSUER = "https://auth-test.example.com/";

/** Boot the server on a fresh OS-assigned port so tests don't collide. */
async function boot(): Promise<RunningServer> {
  const { port, close } = await startHttpMcpServer({
    port: 0, // OS-assigned
    host: "127.0.0.1",
    authIssuer: AUTH_ISSUER,
    apiUrl: "https://api.test.invalid",
    silent: true,
  });
  return { baseUrl: `http://127.0.0.1:${port}`, close };
}

describe("HTTP MCP server", () => {
  let running: RunningServer;

  beforeEach(async () => {
    running = await boot();
  });

  afterEach(async () => {
    await running.close();
  });

  it("responds 200 on /health with status + version", async () => {
    const resp = await fetch(`${running.baseUrl}/health`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { status: string; version: string };
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });

  it("returns 401 + WWW-Authenticate on POST /mcp without Bearer token", async () => {
    const resp = await fetch(`${running.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);

    const wwwAuth = resp.headers.get("www-authenticate");
    expect(wwwAuth).toBeTruthy();
    // ChatGPT reads realm/auth_server from this header to discover where to
    // send the user to sign in. The presence of both fields and the issuer
    // URL is the contract we ship — assert all three, not just status.
    expect(wwwAuth).toContain(`realm="${AUTH_ISSUER}"`);
    expect(wwwAuth).toContain("invalid_token");

    const body = (await resp.json()) as { error: string; auth_server: string };
    expect(body.error).toBe("invalid_token");
    expect(body.auth_server).toBe(AUTH_ISSUER);
  });

  it("returns 401 (not 500) for malformed Authorization headers", async () => {
    const resp = await fetch(`${running.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "NotBearer something",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: {} }),
    });
    expect(resp.status).toBe(401);
    expect(resp.headers.get("www-authenticate")).toContain(`realm="${AUTH_ISSUER}"`);
  });

  it("returns 404 for unknown paths", async () => {
    const resp = await fetch(`${running.baseUrl}/something-else`);
    expect(resp.status).toBe(404);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("does NOT leak the auth issuer to /health", async () => {
    // Defense in depth: /health should be safe for unauthenticated probes
    // (k8s liveness, etc.) and must not advertise auth metadata in headers
    // or body, only the basic status payload.
    const resp = await fetch(`${running.baseUrl}/health`);
    expect(resp.headers.get("www-authenticate")).toBeNull();
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("auth_server");
  });
});
