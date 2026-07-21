import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { syncVersions, SCALAR_TARGETS, MARKETPLACE_PATH } from "../../scripts/sync-versions.mjs";

let root: string;

function writeJson(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function seedFixture(version: string, targetVersions: Record<string, string> = {}): void {
  writeJson(resolve(root, "package.json"), { name: "fake", version });
  for (const target of SCALAR_TARGETS) {
    const v = targetVersions[target] ?? "0.0.0-stale";
    writeJson(resolve(root, target), { name: target, version: v });
  }
  writeJson(resolve(root, MARKETPLACE_PATH), {
    name: "hivemind",
    metadata: { description: "x", version: targetVersions[MARKETPLACE_PATH] ?? "0.0.0-stale" },
    plugins: [
      { name: "hivemind", version: targetVersions[MARKETPLACE_PATH] ?? "0.0.0-stale", source: "./claude-code" },
    ],
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sync-versions-test-"));
  return () => rmSync(root, { recursive: true, force: true });
});

describe("syncVersions", () => {
  it("writes version into every scalar target + both marketplace fields", () => {
    seedFixture("1.2.3");
    const result = syncVersions({ root, log: () => {} });
    expect(result.version).toBe("1.2.3");
    expect(result.writes).toBe(SCALAR_TARGETS.length + 1); // +1 for marketplace
    expect(result.skips).toBe(0);
    for (const target of SCALAR_TARGETS) {
      expect(readJson(resolve(root, target)).version).toBe("1.2.3");
    }
    const mp = readJson(resolve(root, MARKETPLACE_PATH));
    expect(mp.metadata.version).toBe("1.2.3");
    expect(mp.plugins[0].version).toBe("1.2.3");
  });

  it("is idempotent — second run writes nothing", () => {
    seedFixture("1.2.3");
    syncVersions({ root, log: () => {} });
    const result = syncVersions({ root, log: () => {} });
    expect(result.writes).toBe(0);
    expect(result.skips).toBe(SCALAR_TARGETS.length + 1);
  });

  it("partial-sync state: writes only the targets that drifted", () => {
    seedFixture("1.2.3", {
      ".claude-plugin/plugin.json": "1.2.3", // already synced
      "harnesses/codex/package.json": "0.5.0", // drifted
    });
    const result = syncVersions({ root, log: () => {} });
    expect(result.writes).toBeGreaterThan(0);
    expect(result.writes).toBeLessThan(SCALAR_TARGETS.length + 1);
  });

  it("updates EVERY plugins[].version in marketplace.json", () => {
    seedFixture("1.2.3");
    // Inject a second plugin entry to make sure we don't only update [0]
    const mpPath = resolve(root, MARKETPLACE_PATH);
    const mp = readJson(mpPath);
    mp.plugins.push({ name: "hivemind-extra", version: "0.0.0-stale", source: "./extra" });
    writeJson(mpPath, mp);

    syncVersions({ root, log: () => {} });
    const after = readJson(mpPath);
    expect(after.plugins[0].version).toBe("1.2.3");
    expect(after.plugins[1].version).toBe("1.2.3");
  });

  it("throws when a target file is missing", () => {
    seedFixture("1.2.3");
    rmSync(resolve(root, "harnesses/codex/package.json"));
    expect(() => syncVersions({ root, log: () => {} })).toThrow(/codex\/package\.json/);
  });

  it("throws when package.json has no version field", () => {
    writeJson(resolve(root, "package.json"), { name: "fake" });
    for (const target of SCALAR_TARGETS) {
      writeJson(resolve(root, target), { name: target, version: "0.0.0" });
    }
    writeJson(resolve(root, MARKETPLACE_PATH), {
      name: "x",
      metadata: { version: "0.0.0" },
      plugins: [{ name: "p", version: "0.0.0", source: "./x" }],
    });
    expect(() => syncVersions({ root, log: () => {} })).toThrow(/no string `version` field/);
  });
});
