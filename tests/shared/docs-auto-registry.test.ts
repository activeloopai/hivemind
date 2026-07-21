import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { isAutoEnabled, listEntries, readAutoRegistry, setAuto } from "../../src/docs/auto-registry.js";

describe("auto-registry (the only switch for automatic doc sync)", () => {
  let dir: string;
  let file: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "docs-auto-")); file = join(dir, "docs-auto.json"); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("enable → lookup true for the EXACT (org, project); anything else is OFF", () => {
    setAuto({ orgId: "org-a", project: "p1", path: "/repo", auto: true }, file);
    expect(isAutoEnabled("org-a", "p1", file)).toBe(true);
    expect(isAutoEnabled("org-b", "p1", file)).toBe(false); // org switch never leaks
    expect(isAutoEnabled("org-a", "p2", file)).toBe(false);
  });

  it("nested checkouts dedupe: same key upserts ONE entry, path refreshed", () => {
    setAuto({ orgId: "o", project: "p", path: "/work/repo/main", auto: true }, file);
    setAuto({ orgId: "o", project: "p", path: "/work/repo", auto: true }, file);
    const entries = listEntries(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe("/work/repo");
  });

  it("disable round-trip", () => {
    setAuto({ orgId: "o", project: "p", path: "/r", auto: true }, file);
    setAuto({ orgId: "o", project: "p", path: "/r", auto: false }, file);
    expect(isAutoEnabled("o", "p", file)).toBe(false);
  });

  it("FAIL-CLOSED: missing or corrupt file is an empty registry, never a throw", () => {
    expect(isAutoEnabled("o", "p", join(dir, "nope.json"))).toBe(false);
    writeFileSync(file, "{ not json !!!");
    expect(readAutoRegistry(file)).toEqual({ entries: [] });
    expect(isAutoEnabled("o", "p", file)).toBe(false);
  });

  it("an entry without path is dropped (listEntries sort must never throw)", () => {
    writeFileSync(file, JSON.stringify({ entries: [
      { orgId: "o", project: "p", auto: true, enabledAt: "t" }, // path missing
      { orgId: "o", project: "q", path: "/r", auto: true, enabledAt: "t" },
    ] }));
    expect(() => listEntries(file)).not.toThrow();
    expect(listEntries(file)).toHaveLength(1);
  });

  it("malformed entries are dropped, valid ones survive", () => {
    writeFileSync(file, JSON.stringify({ entries: [
      { orgId: "o", project: "p", path: "/r", auto: true, enabledAt: "t" },
      { garbage: true }, null, "x",
    ] }));
    expect(listEntries(file)).toHaveLength(1);
    expect(isAutoEnabled("o", "p", file)).toBe(true);
  });
});
