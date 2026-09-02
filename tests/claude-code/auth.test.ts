import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Source-level tests for src/commands/auth.ts after the PR #76 split. The
 * fs-touching credential helpers moved to src/commands/auth-creds.ts (covered
 * by auth-creds.test.ts); what remains in auth.ts is the network surface
 * (apiGet/apiPost/apiDelete + device-flow + org/workspace ops) plus the JWT
 * decoder and a few small helpers. These tests exercise that surface with
 * mocked fetch + mocked auth-creds saveCredentials, asserting BOTH shape
 * (URL, method, headers, body) AND count (one call, not two), per the
 * testing rules in CLAUDE.md.
 */

const fetchMock = vi.fn();
const saveCredentialsMock = vi.fn();
const loadCredentialsMock = vi.fn();
const installIDHeaderMock = vi.fn();
const osHeaderMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);
vi.mock("../../src/commands/auth-creds.js", () => ({
  loadCredentials: () => loadCredentialsMock(),
  saveCredentials: (creds: unknown) => saveCredentialsMock(creds),
  deleteCredentials: vi.fn(),
}));
vi.mock("../../src/utils/client-header.js", () => ({
  deeplakeClientHeader: () => ({ "X-Deeplake-Client": "hivemind/test" }),
}));
// Mock install-id so device-flow tests neither touch the test runner's
// real $HOME (which would create ~/.deeplake/install-id) nor depend on
// the actual UUID generation. installIDHeaderMock controls what
// hivemindInstallIDHeader() returns per test case.
vi.mock("../../src/commands/install-id.js", () => ({
  hivemindInstallIDHeader: () => installIDHeaderMock(),
}));
// Mock the OS header for the same reason as install-id: the real helper reads
// process.platform, so without this every assertion below would depend on which
// machine CI runs on. client-os.test.ts covers the real mapping.
vi.mock("../../src/utils/client-os.js", () => ({
  hivemindOsHeader: () => osHeaderMock(),
}));

async function importAuth() {
  vi.resetModules();
  return await import("../../src/commands/auth.js");
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  saveCredentialsMock.mockReset();
  loadCredentialsMock.mockReset();
  installIDHeaderMock.mockReset();
  osHeaderMock.mockReset();
  osHeaderMock.mockReturnValue({});
  // Default: install-id helper returns the empty object, so the header
  // is omitted (matches the graceful-degradation path). Individual tests
  // override this to assert the happy path.
  installIDHeaderMock.mockReturnValue({});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decodeJwtPayload", () => {
  it("decodes a 3-part JWT and returns the payload object", async () => {
    const { decodeJwtPayload } = await importAuth();
    // header.{"sub":"alice","exp":99}.signature  (base64url)
    const payload = Buffer.from(JSON.stringify({ sub: "alice", exp: 99 })).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const token = `header.${payload}.sig`;
    const decoded = decodeJwtPayload(token);
    expect(decoded).toEqual({ sub: "alice", exp: 99 });
  });

  it("returns null when the token is not 3 parts", async () => {
    const { decodeJwtPayload } = await importAuth();
    expect(decodeJwtPayload("not.jwt")).toBeNull();
    expect(decodeJwtPayload("just-one-part")).toBeNull();
  });

  it("returns null when the payload is not valid JSON", async () => {
    const { decodeJwtPayload } = await importAuth();
    const garbage = Buffer.from("not-json").toString("base64").replace(/=+$/, "");
    expect(decodeJwtPayload(`h.${garbage}.s`)).toBeNull();
  });
});

describe("requestDeviceCode", () => {
  it("POSTs to /auth/device/code and returns the body on 200", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      device_code: "dc1", user_code: "ABCD", verification_uri: "u", verification_uri_complete: "uc",
      expires_in: 600, interval: 5,
    }));
    const { requestDeviceCode } = await importAuth();
    const r = await requestDeviceCode("https://api.example");
    expect(r.user_code).toBe("ABCD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/auth/device/code");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-Deeplake-Client"]).toBe("hivemind/test");
  });

  it("includes X-Hivemind-Install-Id header when install-id helper returns one", async () => {
    installIDHeaderMock.mockReturnValueOnce({ "X-Hivemind-Install-Id": "uuid-from-helper" });
    fetchMock.mockResolvedValueOnce(ok({
      device_code: "dc1", user_code: "ABCD", verification_uri: "u", verification_uri_complete: "uc",
      expires_in: 600, interval: 5,
    }));
    const { requestDeviceCode } = await importAuth();
    await requestDeviceCode("https://api.example");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Hivemind-Install-Id"]).toBe("uuid-from-helper");
  });

  it("includes X-Hivemind-OS header on the device-code request", async () => {
    osHeaderMock.mockReturnValueOnce({ "X-Hivemind-OS": "windows" });
    fetchMock.mockResolvedValueOnce(
      ok({ device_code: "d", user_code: "u", verification_uri: "v", verification_uri_complete: "vc", expires_in: 1, interval: 1 }),
    );
    const { requestDeviceCode } = await importAuth();
    await requestDeviceCode("https://api.example");
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["X-Hivemind-OS"]).toBe("windows");
  });

  it("omits X-Hivemind-OS on an unsupported platform without dropping the other headers", async () => {
    osHeaderMock.mockReturnValueOnce({});
    installIDHeaderMock.mockReturnValueOnce({ "X-Hivemind-Install-Id": "uuid-x" });
    fetchMock.mockResolvedValueOnce(
      ok({ device_code: "d", user_code: "u", verification_uri: "v", verification_uri_complete: "vc", expires_in: 1, interval: 1 }),
    );
    const { requestDeviceCode } = await importAuth();
    await requestDeviceCode("https://api.example");
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["X-Hivemind-OS"]).toBeUndefined();
    expect(init.headers["X-Hivemind-Install-Id"]).toBe("uuid-x");
    expect(init.headers["X-Deeplake-Client"]).toBe("hivemind/test");
  });

  it("omits X-Hivemind-Install-Id header when install-id helper returns empty (graceful-degrade path)", async () => {
    // beforeEach default already sets installIDHeaderMock to return {} — make it explicit here for clarity.
    installIDHeaderMock.mockReturnValueOnce({});
    fetchMock.mockResolvedValueOnce(ok({
      device_code: "dc1", user_code: "ABCD", verification_uri: "u", verification_uri_complete: "uc",
      expires_in: 600, interval: 5,
    }));
    const { requestDeviceCode } = await importAuth();
    await requestDeviceCode("https://api.example");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Hivemind-Install-Id"]).toBeUndefined();
    // Other headers must still be present — the missing install-id must not nuke them.
    expect(init.headers["X-Deeplake-Client"]).toBe("hivemind/test");
  });

  it("throws on non-200 response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 503 }));
    const { requestDeviceCode } = await importAuth();
    await expect(requestDeviceCode("https://api.example")).rejects.toThrow(/Device flow unavailable/);
  });
});

describe("pollForToken", () => {
  it("returns the token body on 200", async () => {
    fetchMock.mockResolvedValueOnce(ok({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }));
    const { pollForToken } = await importAuth();
    const r = await pollForToken("dc1", "https://api.example");
    expect(r?.access_token).toBe("tok");
  });

  it("includes X-Hivemind-Install-Id header when install-id helper returns one", async () => {
    installIDHeaderMock.mockReturnValueOnce({ "X-Hivemind-Install-Id": "uuid-poll" });
    fetchMock.mockResolvedValueOnce(ok({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }));
    const { pollForToken } = await importAuth();
    await pollForToken("dc1", "https://api.example");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/auth/device/token");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Hivemind-Install-Id"]).toBe("uuid-poll");
    expect(init.headers["X-Deeplake-Client"]).toBe("hivemind/test");
    // device_code must be in the body, not the headers — sanity that we
    // didn't break the request shape while adding the header.
    expect(JSON.parse(init.body)).toEqual({ device_code: "dc1" });
  });

  it("omits X-Hivemind-Install-Id header when install-id helper returns empty", async () => {
    installIDHeaderMock.mockReturnValueOnce({});
    fetchMock.mockResolvedValueOnce(ok({ access_token: "tok", token_type: "Bearer", expires_in: 3600 }));
    const { pollForToken } = await importAuth();
    await pollForToken("dc1", "https://api.example");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Hivemind-Install-Id"]).toBeUndefined();
    expect(init.headers["X-Deeplake-Client"]).toBe("hivemind/test");
  });

  it("returns null on authorization_pending (still waiting)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 }));
    const { pollForToken } = await importAuth();
    const r = await pollForToken("dc1", "https://api.example");
    expect(r).toBeNull();
  });

  it("returns null on slow_down (caller must back off)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "slow_down" }), { status: 400 }));
    const { pollForToken } = await importAuth();
    const r = await pollForToken("dc1", "https://api.example");
    expect(r).toBeNull();
  });

  it("throws on access_denied", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "access_denied" }), { status: 400 }));
    const { pollForToken } = await importAuth();
    await expect(pollForToken("dc1", "https://api.example")).rejects.toThrow(/denied/);
  });

  it("throws on expired_token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "expired_token" }), { status: 400 }));
    const { pollForToken } = await importAuth();
    await expect(pollForToken("dc1", "https://api.example")).rejects.toThrow(/expired/i);
  });

  it("throws 'Token polling failed: HTTP <code>' on non-200 with no recognized error code", async () => {
    fetchMock.mockResolvedValueOnce(new Response("server error", { status: 500 }));
    const { pollForToken } = await importAuth();
    await expect(pollForToken("dc1", "https://api.example")).rejects.toThrow(/Token polling failed: HTTP 500/);
  });
});

describe("authLog default", () => {
  it("default authLog writes to stderr (covers the body of the exported binding)", async () => {
    const { authLog } = await importAuth();
    const captured: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((s: string) => {
      captured.push(s);
      return true;
    }) as typeof process.stderr.write);
    try {
      authLog("hello");
      expect(captured.join("")).toContain("hello");
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe("listOrgs / listWorkspaces", () => {
  it("listOrgs GETs /organizations and forwards Bearer + client header", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }, { id: "o2", name: "globex" }]));
    const { listOrgs } = await importAuth();
    const orgs = await listOrgs("tok", "https://api.example");
    expect(orgs).toEqual([{ id: "o1", name: "acme" }, { id: "o2", name: "globex" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/organizations");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["X-Deeplake-Client"]).toBe("hivemind/test");
    // listOrgs is a GET — no method override means default GET (no method key).
    expect(init.method).toBeUndefined();
  });

  // Regression guard for why the OS header rides the authenticated helpers at
  // all. signup_completed fires from whichever request provisions the user: if
  // that is not /auth/device/token, it is the CLI's first authenticated call,
  // which is GET /me inside saveCredentialsFromToken (listOrgs follows it).
  // Both go through apiGet, so asserting on listOrgs covers the shared helper —
  // but if /me ever moves to its own fetch, it must carry the header too, or it
  // consumes the one-time signup capture without an OS and nothing later can
  // repair it.
  it("apiGet forwards X-Hivemind-OS so a middleware-path signup still sees it", async () => {
    osHeaderMock.mockReturnValueOnce({ "X-Hivemind-OS": "macos" });
    fetchMock.mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }]));
    const { listOrgs } = await importAuth();
    await listOrgs("tok", "https://api.example");
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["X-Hivemind-OS"]).toBe("macos");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("listOrgs returns [] when API gives a non-array body", async () => {
    fetchMock.mockResolvedValueOnce(ok({ unexpected: true }));
    const { listOrgs } = await importAuth();
    expect(await listOrgs("tok", "https://api.example")).toEqual([]);
  });

  it("listWorkspaces accepts the {data: [...]} envelope shape", async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [{ id: "ws1", name: "default" }] }));
    const { listWorkspaces } = await importAuth();
    const ws = await listWorkspaces("tok", "https://api.example", "o1");
    expect(ws).toEqual([{ id: "ws1", name: "default" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/workspaces");
    expect(init.headers["X-Activeloop-Org-Id"]).toBe("o1");
  });

  it("listWorkspaces returns [] for a non-array, non-envelope body", async () => {
    fetchMock.mockResolvedValueOnce(ok({ something: "else" })); // no data, not an array
    const { listWorkspaces } = await importAuth();
    expect(await listWorkspaces("tok", "https://api.example", "o1")).toEqual([]);
  });

  it("listWorkspaces accepts a bare array body", async () => {
    fetchMock.mockResolvedValueOnce(ok([{ id: "ws1", name: "default" }]));
    const { listWorkspaces } = await importAuth();
    const ws = await listWorkspaces("tok", "https://api.example", "o1");
    expect(ws).toEqual([{ id: "ws1", name: "default" }]);
  });
});

describe("switchOrg / switchWorkspace", () => {
  it("switchOrg mints a new token bound to the destination org and persists it", async () => {
    loadCredentialsMock.mockReturnValue({
      token: "old-tok", orgId: "old", apiUrl: "https://api.example", savedAt: "x",
    });
    fetchMock.mockResolvedValueOnce(ok({ token: { token: "fresh-tok-for-new-org" } }));
    const { switchOrg } = await importAuth();
    await switchOrg("new-org", "Activeloop");

    // Exactly one mint call, no extras.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/users/me/tokens");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer old-tok");
    const body = JSON.parse(init.body);
    expect(body.organization_id).toBe("new-org");
    expect(body.duration).toBe(365 * 24 * 3600);

    // Exactly one save, with rotated token + new org.
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    const written = saveCredentialsMock.mock.calls[0][0];
    expect(written.orgId).toBe("new-org");
    expect(written.orgName).toBe("Activeloop");
    expect(written.token).toBe("fresh-tok-for-new-org"); // rotated, not preserved
  });

  it("switchOrg does NOT persist credentials when the mint call fails", async () => {
    loadCredentialsMock.mockReturnValue({
      token: "old-tok", orgId: "old", apiUrl: "https://api.example", savedAt: "x",
    });
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const { switchOrg } = await importAuth();
    await expect(switchOrg("new-org", "Activeloop")).rejects.toThrow(/API 403/);
    expect(saveCredentialsMock).not.toHaveBeenCalled();
  });

  it("switchOrg throws if not logged in and never hits the network", async () => {
    loadCredentialsMock.mockReturnValue(null);
    const { switchOrg } = await importAuth();
    await expect(switchOrg("new-org", "Activeloop")).rejects.toThrow(/Not logged in/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveCredentialsMock).not.toHaveBeenCalled();
  });

  it("switchWorkspace writes the new workspaceId", async () => {
    loadCredentialsMock.mockReturnValue({ token: "tok", orgId: "o", savedAt: "x" });
    const { switchWorkspace } = await importAuth();
    await switchWorkspace("ws2");
    const written = saveCredentialsMock.mock.calls[0][0];
    expect(written.workspaceId).toBe("ws2");
  });

  it("switchWorkspace throws if not logged in", async () => {
    loadCredentialsMock.mockReturnValue(null);
    const { switchWorkspace } = await importAuth();
    await expect(switchWorkspace("ws2")).rejects.toThrow(/Not logged in/);
  });
});

// Tiny helper to forge a 3-part JWT with a given payload (no signature
// verification on our side — decodeJwtPayload only base64-decodes part 2).
function fakeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256" })}.${enc(payload)}.sig`;
}

describe("healDriftedOrgToken", () => {
  it("is a no-op when JWT org_id matches creds.orgId", async () => {
    const token = fakeJwt({ user_id: "u", org_id: "match", type: "api_token" });
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token, orgId: "match", apiUrl: "https://api.example", savedAt: "x" } as any,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveCredentialsMock).not.toHaveBeenCalled();
    expect(out.token).toBe(token);
  });

  it("is a no-op when the token has no org_id claim", async () => {
    const token = fakeJwt({ user_id: "u", type: "api_token" });
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token, orgId: "anything", apiUrl: "https://api.example", savedAt: "x" } as any,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveCredentialsMock).not.toHaveBeenCalled();
    expect(out.orgId).toBe("anything");
  });

  it("is a no-op when creds.orgId is missing (legacy creds)", async () => {
    const token = fakeJwt({ user_id: "u", org_id: "anything", type: "api_token" });
    const { healDriftedOrgToken } = await importAuth();
    await healDriftedOrgToken({ token, apiUrl: "https://api.example", savedAt: "x" } as any);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveCredentialsMock).not.toHaveBeenCalled();
  });

  it("re-mints, realigns orgName, and persists when JWT org_id differs from creds.orgId", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    // 1: token re-mint. 2: listOrgs (orgName realign). Default workspace → no
    // listWorkspaces call, so exactly two fetches.
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "target-name" }, { id: "stale-org", name: "stale-name" }]));
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "stale-name", apiUrl: "https://api.example", savedAt: "x" } as any,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/users/me/tokens");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${stale}`);
    expect(JSON.parse(init.body).organization_id).toBe("target-org");
    // listOrgs runs with the freshly-minted token, not the stale one.
    const [orgsUrl, orgsInit] = fetchMock.mock.calls[1];
    expect(orgsUrl).toBe("https://api.example/organizations");
    expect(orgsInit.headers.Authorization).toBe("Bearer fresh-tok");

    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    const written = saveCredentialsMock.mock.calls[0][0];
    expect(written.token).toBe("fresh-tok");
    expect(written.orgName).toBe("target-name"); // realigned away from "stale-name"
    expect(out.token).toBe("fresh-tok");
    expect(out.orgName).toBe("target-name");
  });

  it("resets a stale concrete workspace that is absent from the new org", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "target-name" }]))
      .mockResolvedValueOnce(ok({ data: [{ id: "ws-of-target", name: "prod" }] }));
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "target-name", workspaceId: "ws-of-old-org", apiUrl: "https://api.example", savedAt: "x" } as any,
    );

    // mint + listOrgs + listWorkspaces = three fetches (non-default workspace).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.example/workspaces");
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    expect(out.workspaceId).toBe("default"); // old-org workspace dropped
  });

  it("normalizes a stale workspace NAME to its canonical id in the new org", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "target-name" }]))
      .mockResolvedValueOnce(ok({ data: [{ id: "ws-of-target", name: "prod" }] }));
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "target-name", workspaceId: "prod", apiUrl: "https://api.example", savedAt: "x" } as any,
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    // The name "prod" exists in the target org → resolved to its canonical id.
    expect(saveCredentialsMock.mock.calls[0][0].workspaceId).toBe("ws-of-target");
    expect(out.workspaceId).toBe("ws-of-target");
  });

  it("persists the token heal even when the orgName realign fails (best-effort)", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const logged: string[] = [];
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "stale-name", apiUrl: "https://api.example", savedAt: "x" } as any,
      (m) => logged.push(m),
    );

    // The token heal still lands; only the realign was skipped.
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    expect(out.token).toBe("fresh-tok");
    expect(out.orgName).toBe("stale-name"); // unchanged — realign couldn't run
    expect(logged).toContain("orgName realign skipped: API 500: boom");
  });

  it("still repairs the workspace when the orgName lookup fails (independent blocks)", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 })) // listOrgs fails
      .mockResolvedValueOnce(ok({ data: [{ id: "ws-of-target", name: "prod" }] })); // listWorkspaces ok
    const logged: string[] = [];
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "stale-name", workspaceId: "ws-of-old-org", apiUrl: "https://api.example", savedAt: "x" } as any,
      (m) => logged.push(m),
    );

    // listWorkspaces runs even though listOrgs threw → workspace gets reset.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(out.orgName).toBe("stale-name"); // org block failed, left as-is
    expect(out.workspaceId).toBe("default"); // workspace block still ran
    expect(logged).toContain("orgName realign skipped: API 500: boom");
  });

  it("falls back to DEFAULT_API_URL when creds.apiUrl is missing", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "target-name" }]));
    const { healDriftedOrgToken } = await importAuth();
    // apiUrl is absent → must use DEFAULT_API_URL without throwing.
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "old-name" } as any,
    );
    expect(out.token).toBe("fresh-tok");
    // /users/me/tokens was called against the default API URL (not undefined).
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\//);
  });

  it("skips orgName update when target org is not found in the listOrgs response", async () => {
    // matchedOrg is undefined → the if(matchedOrg && ...) is false → no update.
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "other-org", name: "other" }])); // target-org absent
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "old-name", apiUrl: "https://api.example", savedAt: "x" } as any,
    );
    expect(out.orgName).toBe("old-name"); // not updated — org not found
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
  });

  it("skips orgName update when the name is already correct", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "already-correct" }]));
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "already-correct", apiUrl: "https://api.example", savedAt: "x" } as any,
    );
    // orgName unchanged — no realign log, no extra save field change.
    expect(out.orgName).toBe("already-correct");
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    expect(saveCredentialsMock.mock.calls[0][0].orgName).toBe("already-correct");
  });

  it("skips workspace update when canonical id already matches", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "target-name" }]))
      .mockResolvedValueOnce(ok({ data: [{ id: "ws-canonical", name: "prod" }] }));
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      // workspaceId is already the canonical id → wsMatch.id === currentWs → no update
      { token: stale, orgId: "target-org", orgName: "target-name", workspaceId: "ws-canonical", apiUrl: "https://api.example", savedAt: "x" } as any,
    );
    expect(out.workspaceId).toBe("ws-canonical"); // unchanged
    expect(saveCredentialsMock.mock.calls[0][0].workspaceId).toBe("ws-canonical");
  });

  it("swallows workspace realign failure and still persists the token heal", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock
      .mockResolvedValueOnce(ok({ token: { token: "fresh-tok" } }))
      .mockResolvedValueOnce(ok([{ id: "target-org", name: "target-name" }])) // listOrgs ok
      .mockResolvedValueOnce(new Response("service error", { status: 503 }));  // listWorkspaces fails
    const logged: string[] = [];
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", orgName: "target-name", workspaceId: "ws-stale", apiUrl: "https://api.example", savedAt: "x" } as any,
      (m) => logged.push(m),
    );

    // Token heal + orgName realign landed; only workspace was skipped.
    expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    expect(out.token).toBe("fresh-tok");
    expect(out.orgName).toBe("target-name"); // org block succeeded
    expect(out.workspaceId).toBe("ws-stale"); // workspace block failed → unchanged
    expect(logged).toContain("workspace realign skipped: API 503: service error");
  });

  it("returns the original creds and does NOT persist when the mint call fails", async () => {
    const stale = fakeJwt({ user_id: "u", org_id: "stale-org", type: "api_token" });
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const logged: string[] = [];
    const { healDriftedOrgToken } = await importAuth();
    const out = await healDriftedOrgToken(
      { token: stale, orgId: "target-org", apiUrl: "https://api.example", savedAt: "x" } as any,
      (m) => logged.push(m),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(saveCredentialsMock).not.toHaveBeenCalled();
    expect(out.token).toBe(stale); // unchanged
    expect(logged.some(m => /re-mint failed/.test(m))).toBe(true);
  });
});

describe("inviteMember / listMembers / removeMember", () => {
  it("inviteMember POSTs to /organizations/<id>/members/invite with the right body", async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    const { inviteMember } = await importAuth();
    await inviteMember("alice@example.com", "ADMIN", "tok", "o1", "https://api.example");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/organizations/o1/members/invite");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Activeloop-Org-Id"]).toBe("o1");
    expect(JSON.parse(init.body)).toEqual({ username: "alice@example.com", access_mode: "ADMIN" });
  });

  it("listMembers extracts members[] from the response", async () => {
    fetchMock.mockResolvedValueOnce(ok({
      members: [{ user_id: "u1", name: "Alice", email: "a@x", role: "admin" }],
    }));
    const { listMembers } = await importAuth();
    const m = await listMembers("tok", "o1", "https://api.example");
    expect(m).toEqual([{ user_id: "u1", name: "Alice", email: "a@x", role: "admin" }]);
  });

  it("listMembers returns [] when members field is missing", async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    const { listMembers } = await importAuth();
    expect(await listMembers("tok", "o1", "https://api.example")).toEqual([]);
  });

  it("removeMember DELETEs to /organizations/<id>/members/<userId>", async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    const { removeMember } = await importAuth();
    await removeMember("u1", "tok", "o1", "https://api.example");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example/organizations/o1/members/u1");
    expect(init.method).toBe("DELETE");
  });
});

// Stub setTimeout so the polling loop in deviceFlowLogin runs synchronously
// (calls callback immediately). Faster than fake timers + works with awaits.
function stubInstantTimers() {
  return vi.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
}

describe("deviceFlowLogin", () => {
  it("polls until pollForToken returns a token, then resolves with it", async () => {
    // Sequence: requestDeviceCode (ok), poll #1 (pending → null), poll #2 (token).
    fetchMock
      .mockResolvedValueOnce(ok({
        device_code: "dc1", user_code: "U", verification_uri: "u",
        verification_uri_complete: "uc", expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 }))
      .mockResolvedValueOnce(ok({ access_token: "tok-final", token_type: "Bearer", expires_in: 3600 }));
    const restore = stubInstantTimers();
    try {
      const { deviceFlowLogin } = await importAuth();
      const result = await deviceFlowLogin("https://api.example");
      expect(result.token).toBe("tok-final");
      expect(result.expiresIn).toBe(3600);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      restore.mockRestore();
    }
  });

  it("throws 'Device code expired' if the deadline passes with no token", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({
        device_code: "dc1", user_code: "U", verification_uri: "u",
        verification_uri_complete: "uc", expires_in: 1, interval: 5,
      }))
      .mockResolvedValue(new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 }));

    // For this case Date.now() must advance beyond the 1-second deadline.
    // Since we stub setTimeout to fire instantly, the loop body runs but
    // Date.now() doesn't change between iterations — we'd loop forever
    // unless we patch Date.now to return increasing values.
    const realDateNow = Date.now;
    let fakeNow = realDateNow();
    vi.spyOn(Date, "now").mockImplementation(() => {
      fakeNow += 2_000; // advance 2s per call so the deadline (1s out) passes
      return fakeNow;
    });
    const restore = stubInstantTimers();
    try {
      const { deviceFlowLogin } = await importAuth();
      await expect(deviceFlowLogin("https://api.example")).rejects.toThrow(/Device code expired/);
    } finally {
      restore.mockRestore();
      vi.restoreAllMocks();
    }
  });
});

describe("login (full flow)", () => {
  it("orchestrates device-flow + /me + listOrgs + /users/me/tokens, saves credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({
        device_code: "dc", user_code: "U", verification_uri: "u",
        verification_uri_complete: "uc", expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(ok({ access_token: "short-lived-tok", token_type: "Bearer", expires_in: 600 }))
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice", email: "a@example.com" }))
      .mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }]))
      .mockResolvedValueOnce(ok({ token: { token: "long-lived-tok" } }));

    const restore = stubInstantTimers();
    try {
      const { login } = await importAuth();
      const creds = await login("https://api.example");
      expect(creds.token).toBe("long-lived-tok");
      expect(creds.orgId).toBe("o1");
      expect(creds.orgName).toBe("acme");
      expect(creds.userName).toBe("Alice");
      expect(creds.workspaceId).toBe("default");
      expect(creds.apiUrl).toBe("https://api.example");
      expect(saveCredentialsMock).toHaveBeenCalledTimes(1);
    } finally {
      restore.mockRestore();
    }
  });

  it("with multiple orgs picks the first and announces selection", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({
        device_code: "dc", user_code: "U", verification_uri: "u",
        verification_uri_complete: "uc", expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(ok({ access_token: "t", token_type: "Bearer", expires_in: 600 }))
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([
        { id: "o1", name: "acme" },
        { id: "o2", name: "globex" },
      ]))
      .mockResolvedValueOnce(ok({ token: { token: "long" } }));
    const restore = stubInstantTimers();
    try {
      const { login } = await importAuth();
      const creds = await login("https://api.example");
      expect(creds.orgId).toBe("o1"); // first one
    } finally {
      restore.mockRestore();
    }
  });

  it("falls back to email-prefix when /me has no name", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({
        device_code: "dc", user_code: "U", verification_uri: "u",
        verification_uri_complete: "uc", expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(ok({ access_token: "t", token_type: "Bearer", expires_in: 600 }))
      .mockResolvedValueOnce(ok({ id: "u1", email: "alice@example.com" }))
      .mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }]))
      .mockResolvedValueOnce(ok({ token: { token: "long" } }));
    const restore = stubInstantTimers();
    try {
      const { login } = await importAuth();
      const creds = await login("https://api.example");
      expect(creds.userName).toBe("alice");
    } finally {
      restore.mockRestore();
    }
  });
});

describe("saveCredentialsFromToken — org-pinning", () => {
  // Build a minimal API-token JWT (header.payload.signature, base64url) with
  // an org_id claim so we can test that saveCredentialsFromToken honors it
  // instead of silently falling back to orgs[0].
  function makeToken(claims: Record<string, unknown>): string {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${b64({ alg: "HS256" })}.${b64(claims)}.signature`;
  }

  afterEach(() => {
    delete process.env.HIVEMIND_ORG_ID;
  });

  // Pins the request that actually matters. GET /me is the CLI's FIRST
  // authenticated call, so it is the one that can trigger the middleware's
  // one-time signup capture. If /me ever moves off apiGet to its own fetch
  // without the OS header, it consumes that capture with no OS and no later
  // request can repair it — this asserts on /me by URL, not on the helper.
  it("sends X-Hivemind-OS on the first authenticated call, GET /me", async () => {
    osHeaderMock.mockReturnValue({ "X-Hivemind-OS": "windows" });
    const token = makeToken({ org_id: "o1", user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }]));
    const { saveCredentialsFromToken } = await importAuth();
    await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });

    const [meUrl, meInit] = fetchMock.mock.calls[0];
    expect(meUrl).toBe("https://api.example/me");
    expect(meInit.headers["X-Hivemind-OS"]).toBe("windows");
  });

  it("skipTokenMint=true honors the org_id claim from the token JWT (multi-org user)", async () => {
    const token = makeToken({ org_id: "o2", user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([
        { id: "o1", name: "acme" },
        { id: "o2", name: "globex" },
      ]));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
    expect(creds.orgId).toBe("o2");
    expect(creds.orgName).toBe("globex");
    // No /users/me/tokens mint call should have been made.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HIVEMIND_ORG_ID env beats the JWT claim (explicit user override)", async () => {
    process.env.HIVEMIND_ORG_ID = "o1";
    const token = makeToken({ org_id: "o2", user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([
        { id: "o1", name: "acme" },
        { id: "o2", name: "globex" },
      ]));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
    expect(creds.orgId).toBe("o1");
    expect(creds.orgName).toBe("acme");
  });

  it("falls back to orgs[0] + warning when claim points at an org the user no longer belongs to", async () => {
    const token = makeToken({ org_id: "o-stale", user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([
        { id: "o1", name: "acme" },
        { id: "o2", name: "globex" },
      ]));
    let stderrText = "";
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(((s: string | Uint8Array) => {
      stderrText += typeof s === "string" ? s : Buffer.from(s).toString();
      return true;
    }) as typeof process.stderr.write);
    try {
      const { saveCredentialsFromToken } = await importAuth();
      const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
      expect(creds.orgId).toBe("o1");
      expect(stderrText).toContain("set HIVEMIND_ORG_ID to override");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("throws when the account has no organizations", async () => {
    const token = makeToken({ user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([])); // empty org list
    const { saveCredentialsFromToken } = await importAuth();
    await expect(saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true }))
      .rejects.toThrow("No organizations found");
  });

  it("uses the single org automatically when the account belongs to exactly one", async () => {
    const token = makeToken({ user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([{ id: "only-org", name: "solo" }]));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
    expect(creds.orgId).toBe("only-org");
    expect(creds.orgName).toBe("solo");
    expect(fetchMock).toHaveBeenCalledTimes(2); // /me + /organizations, no mint
  });

  it("falls back to orgs[0] silently when skipTokenMint=true and token has no org_id claim", async () => {
    // Token has NO org_id claim → claimOrg is undefined → preferredOrgId stays undefined
    // → matched is undefined + orgs.length > 1 → multi-org fallback (orgs[0]).
    const token = makeToken({ user_id: "u1" }); // no org_id
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }, { id: "o2", name: "globex" }]));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
    expect(creds.orgId).toBe("o1"); // orgs[0]
  });

  it("derives userName from email when user.name is empty", async () => {
    const token = makeToken({ user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "", email: "alice@example.com" }))
      .mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }]));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
    expect(creds.userName).toBe("alice"); // email prefix
  });

  it("falls back to 'unknown' when both user.name and user.email are absent", async () => {
    const token = makeToken({ user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "" })) // no email field
      .mockResolvedValueOnce(ok([{ id: "o1", name: "acme" }]));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: true });
    expect(creds.userName).toBe("unknown");
  });

  it("skipTokenMint=false (device flow) does NOT decode the token — picks orgs[0] as before", async () => {
    const token = makeToken({ org_id: "o2", user_id: "u1" });
    fetchMock
      .mockResolvedValueOnce(ok({ id: "u1", name: "Alice" }))
      .mockResolvedValueOnce(ok([
        { id: "o1", name: "acme" },
        { id: "o2", name: "globex" },
      ]))
      .mockResolvedValueOnce(ok({ token: { token: "minted-tok" } }));
    const { saveCredentialsFromToken } = await importAuth();
    const creds = await saveCredentialsFromToken(token, "https://api.example", { skipTokenMint: false });
    // Device flow mints the API token bound to orgs[0]; that ordering stays
    // identical to the pre-change behaviour for backwards compat.
    expect(creds.orgId).toBe("o1");
    expect(creds.token).toBe("minted-tok");
  });
});

describe("API helper error path", () => {
  it("apiGet throws with status code on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const { listOrgs } = await importAuth();
    await expect(listOrgs("tok", "https://api.example")).rejects.toThrow(/403/);
  });

  it("apiPost throws on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));
    const { inviteMember } = await importAuth();
    await expect(inviteMember("a@x", "READ", "tok", "o1", "https://api.example")).rejects.toThrow(/400/);
  });

  it("apiDelete throws on non-2xx", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    const { removeMember } = await importAuth();
    await expect(removeMember("u1", "tok", "o1", "https://api.example")).rejects.toThrow(/404/);
  });
});
