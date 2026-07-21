import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signupFlowHeader, requestDeviceCode, pollForToken } from "../../src/commands/auth.js";

// The signup flow (X-Deeplake-Signup-Flow: hivemind) tags which product entry
// point a user signed up through. The backend reads it at user creation, which
// happens on the /auth/device/token poll (trackDeviceFlowAuth), so the header
// must ride on BOTH the device-code request and the token poll — the
// signup_flow_pending parking bridge was removed. These tests pin the pure
// header and that both requests actually put it on the wire.

describe("signupFlowHeader", () => {
  it("always emits the hivemind flow header", () => {
    expect(signupFlowHeader()).toEqual({ "X-Deeplake-Signup-Flow": "hivemind" });
  });
});

describe("device flow sends the signup-flow header", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let prevHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    // Sandbox HOME so the install-id helper writes to throwaway state.
    prevHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "hivemind-flow-home-"));
    process.env.HOME = tmpHome;

    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function sentHeaders(): Record<string, string> {
    return mockFetch.mock.calls[0][1].headers as Record<string, string>;
  }

  it("sends the header on /auth/device/code", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        device_code: "dc", user_code: "uc",
        verification_uri: "https://v", verification_uri_complete: "https://v?c=uc",
        expires_in: 600, interval: 5,
      }),
    });

    await requestDeviceCode("https://api.example.com");
    expect(sentHeaders()["X-Deeplake-Signup-Flow"]).toBe("hivemind");
  });

  it("sends the header on /auth/device/token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at", token_type: "Bearer", expires_in: 3600 }),
    });

    await pollForToken("dc", "https://api.example.com");
    expect(sentHeaders()["X-Deeplake-Signup-Flow"]).toBe("hivemind");
  });
});
