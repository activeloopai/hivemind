import { describe, it, expect, afterEach } from "vitest";
import { hivemindOsValue, hivemindOsHeader, HIVEMIND_OS_HEADER } from "../../src/utils/client-os.js";

/**
 * Source-level tests for src/utils/client-os.ts.
 *
 * process.platform is a read-only accessor, so each case redefines it and the
 * afterEach restores the real descriptor. The module reads process.platform
 * per call (no module-level capture), which is what makes this work against a
 * single static import — same reason install-id.ts resolves its paths lazily.
 */

const REAL_PLATFORM = Object.getOwnPropertyDescriptor(process, "platform")!;
// Captured before any stubbing, so the real-platform test below cannot be
// fooled by a leaked redefinition from an earlier case.
const REAL_PLATFORM_NAME = process.platform;

function setPlatform(value: string): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterEach(() => {
  Object.defineProperty(process, "platform", REAL_PLATFORM);
});

describe("hivemindOsValue", () => {
  it("maps the three platforms we publish an installer for", () => {
    setPlatform("darwin");
    expect(hivemindOsValue()).toBe("macos");
    setPlatform("win32");
    expect(hivemindOsValue()).toBe("windows");
    setPlatform("linux");
    expect(hivemindOsValue()).toBe("linux");
  });

  it("returns empty on a platform we do not ship for, rather than inventing a bucket", () => {
    setPlatform("freebsd");
    expect(hivemindOsValue()).toBe("");
    setPlatform("aix");
    expect(hivemindOsValue()).toBe("");
  });

  // The backend allowlists exactly these three; a value outside them would be
  // dropped there, so a mismatch here would silently cost us the property.
  it("never returns a value outside the backend allowlist", () => {
    for (const p of ["darwin", "win32", "linux", "freebsd", "sunos", "android"]) {
      setPlatform(p);
      const v = hivemindOsValue();
      expect(v === "" || ["macos", "windows", "linux"].includes(v)).toBe(true);
    }
  });
});

// The only assertion here that runs against a REAL machine rather than a
// redefined property. It is why this file is in ci.yaml's windows-smoke suite
// list: on windows-latest it proves win32 -> "windows" on genuine Windows,
// which is the CLI half of what PLA-498's acceptance asks for and what we
// otherwise had no machine to check.
describe("the platform this process actually runs on", () => {
  it("maps the real platform, unstubbed", () => {
    const expected: Record<string, string> = { darwin: "macos", win32: "windows", linux: "linux" };
    expect(hivemindOsValue()).toBe(expected[REAL_PLATFORM_NAME] ?? "");
  });

  it("emits a header on the three platforms we publish an installer for", () => {
    if (!["darwin", "win32", "linux"].includes(REAL_PLATFORM_NAME)) return;
    expect(hivemindOsHeader()[HIVEMIND_OS_HEADER]).toBeTruthy();
  });
});

describe("hivemindOsHeader", () => {
  it("returns a spreadable single-entry object on a supported platform", () => {
    setPlatform("win32");
    expect(hivemindOsHeader()).toEqual({ [HIVEMIND_OS_HEADER]: "windows" });
  });

  it("returns {} on an unsupported platform so spreading omits the header entirely", () => {
    setPlatform("freebsd");
    expect(hivemindOsHeader()).toEqual({});
    // Spreading {} must leave a headers object untouched — the graceful-degrade
    // contract the install-id header follows.
    expect({ "Content-Type": "application/json", ...hivemindOsHeader() }).toEqual({
      "Content-Type": "application/json",
    });
  });
});
