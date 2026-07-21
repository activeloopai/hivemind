import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hivemindReferrerHeader, requestDeviceCode } from "../../src/commands/auth.js";

// The affiliate referral code (--ref) must reach the backend as the
// X-Hivemind-Referrer header on /auth/device/code. These tests pin both the
// pure header construction and the fact that requestDeviceCode actually puts it
// on the wire — that header is the entire CLI side of the attribution contract.

describe("hivemindReferrerHeader", () => {
  it("emits the header for a code", () => {
    expect(hivemindReferrerHeader("mario")).toEqual({ "X-Hivemind-Referrer": "mario" });
  });

  it("trims surrounding whitespace", () => {
    expect(hivemindReferrerHeader("  mario  ")).toEqual({ "X-Hivemind-Referrer": "mario" });
  });

  it("omits the header when there is no referral", () => {
    expect(hivemindReferrerHeader(undefined)).toEqual({});
    expect(hivemindReferrerHeader("")).toEqual({});
    expect(hivemindReferrerHeader("   ")).toEqual({});
  });
});

describe("requestDeviceCode referral header", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let prevHome: string | undefined;
  let tmpHome: string;

  beforeEach(() => {
    // Sandbox HOME so the install-id helper writes to throwaway state, not the
    // developer's real ~/.deeplake.
    prevHome = process.env.HOME;
    tmpHome = mkdtempSync(join(tmpdir(), "hivemind-ref-home-"));
    process.env.HOME = tmpHome;

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        device_code: "dc", user_code: "uc",
        verification_uri: "https://v", verification_uri_complete: "https://v?c=uc",
        expires_in: 600, interval: 5,
      }),
    });
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

  it("sends X-Hivemind-Referrer when a ref is given", async () => {
    await requestDeviceCode("https://api.example.com", "mario");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(sentHeaders()["X-Hivemind-Referrer"]).toBe("mario");
  });

  it("does not send the header when no ref is given", async () => {
    await requestDeviceCode("https://api.example.com");
    expect(sentHeaders()).not.toHaveProperty("X-Hivemind-Referrer");
  });
});
