import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isHivemindPluginEnabled } from "../../src/utils/plugin-state.js";
import { setFakeHome, clearFakeHome } from "./fake-home.js";

// isHivemindPluginEnabled reads homedir() at call time, so patching
// process.env.HOME redirects it to a temp directory on each invocation.

function writeSettings(dir: string, content: object) {
  const claudeDir = join(dir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "settings.json"), JSON.stringify(content));
}

describe("isHivemindPluginEnabled", () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "plugin-state-test-"));
    originalHome = process.env.HOME;
    setFakeHome(tmpDir);
  });

  afterEach(() => {
    clearFakeHome();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when settings.json does not exist", () => {
    expect(isHivemindPluginEnabled()).toBe(true);
  });

  it("returns true when enabledPlugins does not mention hivemind", () => {
    writeSettings(tmpDir, { enabledPlugins: { "other@plugin": true } });
    expect(isHivemindPluginEnabled()).toBe(true);
  });

  it("returns true when enabledPlugins[hivemind@hivemind] is true", () => {
    writeSettings(tmpDir, { enabledPlugins: { "hivemind@hivemind": true } });
    expect(isHivemindPluginEnabled()).toBe(true);
  });

  it("returns false when enabledPlugins[hivemind@hivemind] is false", () => {
    writeSettings(tmpDir, { enabledPlugins: { "hivemind@hivemind": false } });
    expect(isHivemindPluginEnabled()).toBe(false);
  });

  it("returns true (fail-open) when settings.json is corrupt", () => {
    mkdirSync(join(tmpDir, ".claude"), { recursive: true });
    writeFileSync(join(tmpDir, ".claude", "settings.json"), "{ not valid json }");
    expect(isHivemindPluginEnabled()).toBe(true);
  });
});
