import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, mkdirSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  getOrCreateInstallID,
  hivemindInstallIDHeader,
} from "../../src/commands/install-id.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Source-level tests for src/commands/install-id.ts.
 *
 * Same static-import + process.env.HOME override pattern as auth-creds.test.ts
 * — see that file for the rationale (vi.resetModules + reimport caused a
 * V8 coverage-merge flake on CI). The lazy homedir() inside install-id.ts
 * lets us flip HOME between tests against a single module instance.
 */

let TEMP_HOME = "";
let ORIGINAL_HOME: string | undefined;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function installIDFile(): string {
  return join(TEMP_HOME, ".deeplake", "install-id");
}

beforeEach(() => {
  TEMP_HOME = mkdtempSync(join(tmpdir(), "hivemind-install-id-test-"));
  ORIGINAL_HOME = process.env.HOME;
  setFakeHome(TEMP_HOME);
});

afterEach(() => {
  clearFakeHome();
  rmSync(TEMP_HOME, { recursive: true, force: true });
});

describe("install-id — generate + persist", () => {
  it("creates a UUID on first call and persists it to ~/.deeplake/install-id", () => {
    expect(existsSync(installIDFile())).toBe(false);

    const id = getOrCreateInstallID();

    expect(id).toMatch(UUID_RE);
    expect(existsSync(installIDFile())).toBe(true);
    expect(readFileSync(installIDFile(), "utf-8")).toBe(id);
  });

  it("returns the same ID across calls (stable across the same process)", () => {
    const first = getOrCreateInstallID();
    const second = getOrCreateInstallID();
    const third = getOrCreateInstallID();

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("reuses an existing valid ID on disk without regenerating", () => {
    const preexisting = "11111111-2222-3333-4444-555555555555";
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(installIDFile(), preexisting);

    expect(getOrCreateInstallID()).toBe(preexisting);
  });

  it("rotates a corrupt on-disk value (not a UUID) to a fresh one", () => {
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(installIDFile(), "not-a-uuid-just-garbage");

    const id = getOrCreateInstallID();

    expect(id).toMatch(UUID_RE);
    expect(id).not.toBe("not-a-uuid-just-garbage");
    expect(readFileSync(installIDFile(), "utf-8")).toBe(id);
  });

  it("trims surrounding whitespace from existing valid IDs", () => {
    const preexisting = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true });
    writeFileSync(installIDFile(), `  ${preexisting}\n`);

    expect(getOrCreateInstallID()).toBe(preexisting);
  });

  it("writes the file with mode 0600 (owner-only read/write)", () => {
    // Skip on Windows where POSIX modes don't apply meaningfully.
    if (process.platform === "win32") return;

    getOrCreateInstallID();
    const mode = statSync(installIDFile()).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe("install-id — hivemindInstallIDHeader", () => {
  it("returns { X-Hivemind-Install-Id: <uuid> } when an ID is available", () => {
    const header = hivemindInstallIDHeader();
    expect(Object.keys(header)).toEqual(["X-Hivemind-Install-Id"]);
    expect(header["X-Hivemind-Install-Id"]).toMatch(UUID_RE);
  });

  it("returns the SAME header value as getOrCreateInstallID() — they share state", () => {
    const id = getOrCreateInstallID();
    expect(hivemindInstallIDHeader()).toEqual({ "X-Hivemind-Install-Id": id });
  });
});

describe("install-id — graceful degradation", () => {
  it("returns empty string + empty header when ~/.deeplake is unwritable", () => {
    // Pre-create the config dir as read-only so writeFileSync(install-id) fails.
    if (process.platform === "win32") return; // POSIX-only test
    if (process.getuid && process.getuid() === 0) return; // root bypasses mode checks
    mkdirSync(join(TEMP_HOME, ".deeplake"), { recursive: true, mode: 0o500 });

    const id = getOrCreateInstallID();
    expect(id).toBe("");
    expect(hivemindInstallIDHeader()).toEqual({});

    // Restore so afterEach cleanup can rm the dir.
    chmodSync(join(TEMP_HOME, ".deeplake"), 0o700);
  });
});
