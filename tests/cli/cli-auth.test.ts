import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests for src/cli/auth.ts — the thin login/orgs surface used by the
 * unified installer.
 *
 * Important: we do NOT vi.mock("node:fs") here. cli/auth.ts → commands/
 * auth.js → commands/auth-creds.ts share the same node:fs imports, and
 * mocking the module would shadow auth-creds.ts's existsSync inside this
 * worker too — when v8 coverage from this worker merges with the dedicated
 * auth-creds.test.ts worker, the auth-creds branch coverage collapses to
 * 66.66% (the exact regression the comment at the top of auth-creds.test.ts
 * documents).
 *
 * Instead we redirect HOME to a tmp dir and drop / remove a real
 * credentials.json to drive isLoggedIn. login() and listOrgs() are still
 * mocked at the commands/auth.js boundary because they hit the network.
 */

const loginMock = vi.fn();
const listOrgsMock = vi.fn();
const saveCredentialsFromTokenMock = vi.fn();
const stdoutWriteMock = vi.fn();
const stderrWriteMock = vi.fn();

let TEMP_HOME = "";

// Mirrors auth-creds.test.ts: redirect homedir() so every module that
// captures it at load time (cli/util.ts, commands/auth-creds.ts) points
// into a fresh temp dir. node:fs stays REAL — see the file-level comment
// for the v8 branch-coverage reason.
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => TEMP_HOME };
});

function credsPath(): string {
  return join(TEMP_HOME, ".deeplake", "credentials.json");
}

function writeCreds(creds: Record<string, unknown>): void {
  mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true, mode: 0o700 });
  writeFileSync(credsPath(), JSON.stringify(creds), { mode: 0o600 });
}

function removeCreds(): void {
  rmSync(credsPath(), { force: true });
}

async function importFresh(): Promise<typeof import("../../src/cli/auth.js")> {
  vi.resetModules();
  // doMock re-evaluates the factory on each module-cache reset, so the
  // partial mock of commands/auth.js (with the live loadCredentials and
  // mocked login/listOrgs) picks up the new TEMP_HOME via auth-creds.ts's
  // homedir() at import time.
  vi.doMock("../../src/commands/auth.js", async () => {
    const actual = await vi.importActual<typeof import("../../src/commands/auth.js")>("../../src/commands/auth.js");
    return {
      ...actual,
      login: (...a: unknown[]) => loginMock(...a),
      listOrgs: (...a: unknown[]) => listOrgsMock(...a),
      saveCredentialsFromToken: (...a: unknown[]) => saveCredentialsFromTokenMock(...a),
    };
  });
  return await import("../../src/cli/auth.js");
}

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-cli-auth-"));
  loginMock.mockReset().mockResolvedValue(undefined);
  listOrgsMock.mockReset().mockResolvedValue([]);
  saveCredentialsFromTokenMock.mockReset().mockResolvedValue(undefined);
  stdoutWriteMock.mockReset();
  stderrWriteMock.mockReset();
  delete process.env.DEEPLAKE_API_TOKEN;
  delete process.env.HIVEMIND_TOKEN;
  vi.spyOn(process.stdout, "write").mockImplementation(((...a: unknown[]) => { stdoutWriteMock(...a); return true; }) as any);
  vi.spyOn(process.stderr, "write").mockImplementation(((...a: unknown[]) => { stderrWriteMock(...a); return true; }) as any);
  delete process.env.HIVEMIND_API_URL;
  delete process.env.DEEPLAKE_API_URL;
});

afterEach(() => {
  rmSync(TEMP_HOME, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("isLoggedIn", () => {
  it("false when no credentials file exists", async () => {
    const { isLoggedIn } = await importFresh();
    expect(isLoggedIn()).toBe(false);
  });

  it("false when file exists but is not valid JSON", async () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(credsPath(), "{ not json");
    const { isLoggedIn } = await importFresh();
    expect(isLoggedIn()).toBe(false);
  });

  it("true when credentials file is present and parses cleanly", async () => {
    writeCreds({ token: "t", orgId: "o", savedAt: "2026-04-26" });
    const { isLoggedIn } = await importFresh();
    expect(isLoggedIn()).toBe(true);
  });
});

describe("ensureLoggedIn", () => {
  it("returns true immediately when already logged in (no login() call)", async () => {
    writeCreds({ token: "t", orgId: "o", savedAt: "" });
    const { ensureLoggedIn } = await importFresh();
    expect(await ensureLoggedIn()).toBe(true);
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("calls login() with the default api when no env override is set", async () => {
    // Cold start: simulate login() persisting a fresh credentials.json
    // so the post-login isLoggedIn() returns true.
    loginMock.mockImplementation(async () => {
      writeCreds({ token: "t", orgId: "o", savedAt: "" });
    });
    const { ensureLoggedIn } = await importFresh();
    expect(await ensureLoggedIn()).toBe(true);
    expect(loginMock).toHaveBeenCalledTimes(1);
    // Second arg is the affiliate --ref code, undefined when none was passed.
    expect(loginMock).toHaveBeenCalledWith("https://api.deeplake.ai", undefined);
  });

  it("HIVEMIND_API_URL is used when set, otherwise default", async () => {
    process.env.HIVEMIND_API_URL = "https://hm.example";
    loginMock.mockImplementation(async () => {
      writeCreds({ token: "t", orgId: "o", savedAt: "" });
    });
    const { ensureLoggedIn } = await importFresh();
    await ensureLoggedIn();
    expect(loginMock).toHaveBeenCalledWith("https://hm.example", undefined);
  });

  it("DEEPLAKE_API_URL env is NOT honored (legacy name removed)", async () => {
    process.env.DEEPLAKE_API_URL = "https://dl.example";
    loginMock.mockImplementation(async () => {
      writeCreds({ token: "t", orgId: "o", savedAt: "" });
    });
    const { ensureLoggedIn } = await importFresh();
    await ensureLoggedIn();
    expect(loginMock).toHaveBeenCalledWith("https://api.deeplake.ai", undefined);
  });

  it("threads the affiliate --ref code through to login()", async () => {
    loginMock.mockImplementation(async () => {
      writeCreds({ token: "t", orgId: "o", savedAt: "" });
    });
    const { ensureLoggedIn } = await importFresh();
    await ensureLoggedIn("mario");
    expect(loginMock).toHaveBeenCalledWith("https://api.deeplake.ai", "mario");
  });

  it("returns false (and writes to stderr) when login() rejects", async () => {
    loginMock.mockRejectedValue(new Error("network down"));
    const { ensureLoggedIn } = await importFresh();
    expect(await ensureLoggedIn()).toBe(false);
    const stderrText = stderrWriteMock.mock.calls.map(c => c[0]).join("");
    expect(stderrText).toContain("Login failed: network down");
  });

  it("returns false when login() resolves but credentials are still missing", async () => {
    // login() is a no-op — writes nothing. ensureLoggedIn must report false.
    const { ensureLoggedIn } = await importFresh();
    expect(await ensureLoggedIn()).toBe(false);
  });

  it("emits the 'Starting login...' notice on cold start", async () => {
    const { ensureLoggedIn } = await importFresh();
    await ensureLoggedIn();
    const stdoutText = stdoutWriteMock.mock.calls.map(c => c[0]).join("");
    expect(stdoutText).toContain("No Deeplake credentials found. Starting login...");
  });
});

describe("maybeShowOrgChoice", () => {
  it("no-op when not logged in (loadCredentials null)", async () => {
    const { maybeShowOrgChoice } = await importFresh();
    await maybeShowOrgChoice();
    expect(listOrgsMock).not.toHaveBeenCalled();
    expect(stdoutWriteMock).not.toHaveBeenCalled();
  });

  it("no-op when user belongs to a single org (no choice to show)", async () => {
    writeCreds({ token: "t", orgId: "o", orgName: "acme", savedAt: "" });
    listOrgsMock.mockResolvedValue([{ id: "o", name: "acme" }]);
    const { maybeShowOrgChoice } = await importFresh();
    await maybeShowOrgChoice();
    expect(stdoutWriteMock).not.toHaveBeenCalled();
  });

  it("prints the active-org line and the switch hint when 2+ orgs are visible", async () => {
    writeCreds({ token: "t", orgId: "o1", orgName: "acme", savedAt: "" });
    listOrgsMock.mockResolvedValue([{ id: "o1", name: "acme" }, { id: "o2", name: "wayne" }]);
    const { maybeShowOrgChoice } = await importFresh();
    await maybeShowOrgChoice();
    const text = stdoutWriteMock.mock.calls.map(c => c[0]).join("");
    expect(text).toContain("You belong to 2 orgs. Active: acme");
    expect(text).toContain("hivemind org switch <name-or-id>");
  });

  it("falls back to orgId when orgName is missing in credentials", async () => {
    writeCreds({ token: "t", orgId: "o1", savedAt: "" });
    listOrgsMock.mockResolvedValue([{ id: "o1", name: "acme" }, { id: "o2", name: "wayne" }]);
    const { maybeShowOrgChoice } = await importFresh();
    await maybeShowOrgChoice();
    const text = stdoutWriteMock.mock.calls.map(c => c[0]).join("");
    expect(text).toContain("Active: o1");
  });

  it("calls listOrgs with the credentials' apiUrl when present", async () => {
    writeCreds({ token: "tok", orgId: "o1", apiUrl: "https://custom.example", savedAt: "" });
    listOrgsMock.mockResolvedValue([{ id: "o1", name: "a" }, { id: "o2", name: "b" }]);
    const { maybeShowOrgChoice } = await importFresh();
    await maybeShowOrgChoice();
    expect(listOrgsMock).toHaveBeenCalledWith("tok", "https://custom.example");
  });

  it("falls back to the default apiUrl when none is in credentials", async () => {
    writeCreds({ token: "tok", orgId: "o1", savedAt: "" });
    listOrgsMock.mockResolvedValue([{ id: "o1", name: "a" }, { id: "o2", name: "b" }]);
    const { maybeShowOrgChoice } = await importFresh();
    await maybeShowOrgChoice();
    expect(listOrgsMock).toHaveBeenCalledWith("tok", "https://api.deeplake.ai");
  });

  it("swallows network errors silently (best-effort post-install hint)", async () => {
    writeCreds({ token: "tok", orgId: "o1", savedAt: "" });
    listOrgsMock.mockRejectedValue(new Error("ETIMEDOUT"));
    const { maybeShowOrgChoice } = await importFresh();
    await expect(maybeShowOrgChoice()).resolves.toBeUndefined();
    expect(stdoutWriteMock).not.toHaveBeenCalled();
    expect(stderrWriteMock).not.toHaveBeenCalled();
  });
});

describe("loginWithProvidedToken", () => {
  it("returns false (no-op) when no token in env or flag", async () => {
    const { loginWithProvidedToken } = await importFresh();
    const ok = await loginWithProvidedToken();
    expect(ok).toBe(false);
    expect(saveCredentialsFromTokenMock).not.toHaveBeenCalled();
  });

  it("uses --token flag value, skipTokenMint=true, logs '--token flag'", async () => {
    saveCredentialsFromTokenMock.mockResolvedValue(undefined);
    const { loginWithProvidedToken } = await importFresh();
    const ok = await loginWithProvidedToken("flag-tok");
    expect(ok).toBe(true);
    expect(saveCredentialsFromTokenMock).toHaveBeenCalledTimes(1);
    expect(saveCredentialsFromTokenMock).toHaveBeenCalledWith("flag-tok", "https://api.deeplake.ai", { skipTokenMint: true });
    expect(stdoutWriteMock.mock.calls.map(c => c[0]).join("")).toContain("Signed in via --token flag.");
  });

  it("falls back to HIVEMIND_TOKEN when no flag, logs 'HIVEMIND_TOKEN'", async () => {
    process.env.HIVEMIND_TOKEN = "env-tok";
    saveCredentialsFromTokenMock.mockResolvedValue(undefined);
    const { loginWithProvidedToken } = await importFresh();
    const ok = await loginWithProvidedToken();
    expect(ok).toBe(true);
    expect(saveCredentialsFromTokenMock).toHaveBeenCalledWith("env-tok", "https://api.deeplake.ai", { skipTokenMint: true });
    expect(stdoutWriteMock.mock.calls.map(c => c[0]).join("")).toContain("Signed in via HIVEMIND_TOKEN.");
  });

  it("flag value beats env value (priority)", async () => {
    process.env.HIVEMIND_TOKEN = "env-tok";
    saveCredentialsFromTokenMock.mockResolvedValue(undefined);
    const { loginWithProvidedToken } = await importFresh();
    await loginWithProvidedToken("flag-tok");
    expect(saveCredentialsFromTokenMock).toHaveBeenCalledWith("flag-tok", "https://api.deeplake.ai", { skipTokenMint: true });
  });

  it("DEEPLAKE_API_TOKEN env is NOT recognized (legacy name removed)", async () => {
    process.env.DEEPLAKE_API_TOKEN = "should-be-ignored";
    saveCredentialsFromTokenMock.mockResolvedValue(undefined);
    const { loginWithProvidedToken } = await importFresh();
    const ok = await loginWithProvidedToken();
    expect(ok).toBe(false);
    expect(saveCredentialsFromTokenMock).not.toHaveBeenCalled();
  });

  it("HIVEMIND_API_URL takes precedence over default", async () => {
    process.env.HIVEMIND_API_URL = "https://hm.example";
    saveCredentialsFromTokenMock.mockResolvedValue(undefined);
    const { loginWithProvidedToken } = await importFresh();
    await loginWithProvidedToken("tok");
    expect(saveCredentialsFromTokenMock).toHaveBeenCalledWith("tok", "https://hm.example", { skipTokenMint: true });
  });

  it("returns false + warns when saveCredentialsFromToken rejects", async () => {
    saveCredentialsFromTokenMock.mockRejectedValue(new Error("API 401: invalid"));
    const { loginWithProvidedToken } = await importFresh();
    const ok = await loginWithProvidedToken("bad-tok");
    expect(ok).toBe(false);
    const stderrText = stderrWriteMock.mock.calls.map(c => c[0]).join("");
    expect(stderrText).toContain("Token authentication failed: API 401: invalid");
  });
});
