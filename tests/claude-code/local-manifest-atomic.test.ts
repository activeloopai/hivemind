import { afterAll, describe, expect, it, vi } from "vitest";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const writeFileSyncMock = vi.hoisted(() => vi.fn());
const randomUUIDMock = vi.hoisted(() => vi.fn(() => "fixed-test-uuid"));

vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return { ...actual, randomUUID: randomUUIDMock };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  writeFileSyncMock.mockImplementation(actual.writeFileSync);
  return { ...actual, writeFileSync: writeFileSyncMock };
});

const { readLocalManifest, writeLocalManifest } = await import("../../src/skillify/local-manifest.js");

const tmpDir = mkdtempSync(join(tmpdir(), "local-manifest-atomic-test-"));
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

function manifestPath(name: string): string {
  return join(tmpDir, `${name}.json`);
}

function manifest(count: number) {
  return {
    created_at: "2026-09-22T00:00:00.000Z",
    entries: Array.from({ length: count }, (_, i) => ({
      skill_name: `skill-${i}`,
      canonical_path: `/tmp/skill-${i}`,
      symlinks: [],
      source_session_ids: [`session-${i}`],
      source_session_paths: [`/tmp/session-${i}.jsonl`],
      source_agent: "claude_code",
      gate_agent: "claude_code",
      created_at: "2026-09-22T00:00:00.000Z",
      uploaded: false,
    })),
  };
}

describe("writeLocalManifest publication", () => {
  it("keeps the previous manifest when replacement fails after truncating the target", () => {
    const path = manifestPath("failure");
    const original = manifest(1);
    writeLocalManifest(original, path);
    const originalBytes = readFileSync(path);

    const realWriteFileSync = writeFileSyncMock.getMockImplementation()!;
    writeFileSyncMock.mockImplementation((file: unknown, data: unknown, options: unknown) => {
      if (String(file).startsWith(path)) {
        realWriteFileSync(file as never, "{\"created_at\":");
        throw new Error("simulated disk-full during manifest publication");
      }
      return realWriteFileSync(file as never, data as never, options as never);
    });

    try {
      expect(() => writeLocalManifest(manifest(2), path)).toThrow(/disk-full/);
    } finally {
      writeFileSyncMock.mockImplementation(realWriteFileSync);
    }

    expect(readLocalManifest(path)).toEqual(original);
    expect(readFileSync(path)).toEqual(originalBytes);
    expect(readdirSync(tmpDir).filter(name => name.startsWith("failure.json."))).toEqual([]);
  });

  it("preserves a restrictive mode while replacing the manifest", () => {
    const path = manifestPath("mode");
    writeLocalManifest(manifest(1), path);
    chmodSync(path, 0o600);

    writeLocalManifest(manifest(2), path);

    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readLocalManifest(path)?.entries).toHaveLength(2);
  });

  it.skipIf(process.platform === "win32")("preserves an existing symlink and private target mode", () => {
    const target = manifestPath("existing-target");
    const link = manifestPath("existing-link");
    writeLocalManifest(manifest(1), target);
    chmodSync(target, 0o600);
    symlinkSync(target, link);

    writeLocalManifest(manifest(2), link);

    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(statSync(target).mode & 0o777).toBe(0o600);
    expect(readLocalManifest(link)?.entries).toHaveLength(2);
    expect(readLocalManifest(target)?.entries).toHaveLength(2);
  });

  it.skipIf(process.platform === "win32")("retains existing owner access under a restrictive umask", () => {
    const path = manifestPath("restrictive-mask");
    writeLocalManifest(manifest(1), path);
    chmodSync(path, 0o600);
    const previous = process.umask(0o777);
    try {
      writeLocalManifest(manifest(2), path);
      expect(statSync(path).mode & 0o777).toBe(0o600);
    } finally {
      process.umask(previous);
      chmodSync(path, 0o600);
    }
    expect(readLocalManifest(path)?.entries).toHaveLength(2);
  });

  it("does not alter an existing parent directory mode", () => {
    const parent = join(tmpDir, "parent-mode");
    const path = join(parent, "manifest.json");
    const originalMode = 0o750;
    // The parent is deliberately created before the manifest write; the
    // writer must not chmod it as part of preserving the file mode.
    mkdirSync(parent);
    chmodSync(parent, originalMode);
    writeLocalManifest(manifest(1), path);

    if (process.platform !== "win32") expect(statSync(parent).mode & 0o777).toBe(originalMode);
    expect(readLocalManifest(path)?.entries).toHaveLength(1);
  });

  it("does not follow a pre-created staging symlink", () => {
    const path = manifestPath("symlink");
    const target = join(tmpDir, "symlink-target");
    const tmp = `${path}.${process.pid}.fixed-test-uuid.tmp`;
    const originalTarget = "must remain untouched";
    writeFileSync(target, originalTarget);
    symlinkSync(target, tmp);

    expect(() => writeLocalManifest(manifest(1), path)).toThrow();
    expect(readFileSync(target, "utf8")).toBe(originalTarget);
    expect(lstatSync(tmp).isSymbolicLink()).toBe(true);
    expect(readLocalManifest(path)).toBeNull();
  });

  it("creates a fresh manifest and cleans up its staging file", () => {
    const path = manifestPath("fresh");

    writeLocalManifest(manifest(1), path);

    expect(readLocalManifest(path)?.entries).toHaveLength(1);
    expect(readdirSync(tmpDir).filter(name => name.startsWith("fresh.json."))).toEqual([]);
  });
});
