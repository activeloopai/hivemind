import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// safe-url.ts does `import * as vscode from "vscode"`, which isn't resolvable
// in a plain Node test run. The functions under test don't touch vscode (only
// openExternalUrl does), so a minimal mock is enough to let the module load.
vi.mock("vscode", () => ({
  env: { openExternal: vi.fn(async () => true) },
  Uri: { parse: (s: string) => ({ toString: () => s }) },
}));

import {
  assertSafeExternalUrl,
  sanitizeApiUrl,
  assertSafeCredentialFields,
} from "../src/auth/safe-url";
import { sanitizeApiUrl as sanitizeApiUrlMjs } from "../scripts/lib/deeplake.mjs";
import { resolveSnapshot } from "../src/webview/data-bridge";

// ── safe-url.ts: device-flow URL validation ────────────────────────────────

describe("assertSafeExternalUrl", () => {
  it("accepts an https URL on an allowed auth host", () => {
    const u = assertSafeExternalUrl("https://api.deeplake.ai/auth/device?code=abc");
    expect(u.hostname).toBe("api.deeplake.ai");
  });

  it("rejects non-https schemes", () => {
    expect(() => assertSafeExternalUrl("http://api.deeplake.ai/x")).toThrow("Verification URL must use HTTPS.");
  });

  it("rejects userinfo-spoofed hosts (api.deeplake.ai@evil.com)", () => {
    // The real host is evil.com; only the userinfo says api.deeplake.ai.
    expect(() => assertSafeExternalUrl("https://api.deeplake.ai@evil.com/x")).toThrow(/Unexpected auth host/);
  });

  it("rejects look-alike subdomains (api.deeplake.ai.evil.com)", () => {
    expect(() => assertSafeExternalUrl("https://api.deeplake.ai.evil.com/x")).toThrow(/Unexpected auth host/);
  });

  it("rejects malformed input", () => {
    expect(() => assertSafeExternalUrl("not a url")).toThrow("Invalid verification URL from auth server.");
  });
});

describe("sanitizeApiUrl (extension)", () => {
  it("returns the origin for an allowed host, dropping a trailing slash", () => {
    expect(sanitizeApiUrl("https://api.deeplake.ai/", "https://api.deeplake.ai")).toBe("https://api.deeplake.ai");
  });

  it("throws on a spoofed host rather than echoing it back", () => {
    expect(() => sanitizeApiUrl("https://api.deeplake.ai@evil.com", "https://api.deeplake.ai")).toThrow(/Unexpected auth host/);
  });
});

describe("assertSafeCredentialFields", () => {
  it("accepts well-formed fields", () => {
    expect(() =>
      assertSafeCredentialFields({ token: "x".repeat(20), orgId: "org_123", userName: "alice", apiUrl: "https://api.deeplake.ai" }),
    ).not.toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() => assertSafeCredentialFields({ token: "short", orgId: "org_123" })).toThrow(/Invalid token shape/);
  });

  it("rejects a malformed org id", () => {
    expect(() => assertSafeCredentialFields({ token: "x".repeat(20), orgId: "bad id!" })).toThrow(/Invalid org id/);
  });
});

// ── scripts/lib/deeplake.mjs: bearer-token host gate ────────────────────────

describe("sanitizeApiUrl (deeplake.mjs)", () => {
  it("returns the origin for an allowed host", () => {
    expect(sanitizeApiUrlMjs("https://api.deeplake.ai/workspaces")).toBe("https://api.deeplake.ai");
  });

  it("falls back to the default on a userinfo-spoofed host", () => {
    expect(sanitizeApiUrlMjs("https://api.deeplake.ai@evil.com")).toBe("https://api.deeplake.ai");
  });

  it("falls back to the default on a look-alike subdomain", () => {
    expect(sanitizeApiUrlMjs("https://api.deeplake.ai.evil.com")).toBe("https://api.deeplake.ai");
  });

  it("falls back to the default on a non-https scheme", () => {
    expect(sanitizeApiUrlMjs("http://api.deeplake.ai")).toBe("https://api.deeplake.ai");
  });

  it("falls back to the default on non-string / malformed input", () => {
    expect(sanitizeApiUrlMjs(undefined)).toBe("https://api.deeplake.ai");
    expect(sanitizeApiUrlMjs("::::")).toBe("https://api.deeplake.ai");
  });
});

// ── data-bridge.ts resolveSnapshot: snapshot-path traversal guard ───────────

describe("resolveSnapshot snapshot-sha guard", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function setup(): { repoDir: string; snapshotsDir: string } {
    root = mkdtempSync(join(tmpdir(), "hm-snap-"));
    const repoDir = join(root, "repo");
    const snapshotsDir = join(repoDir, "snapshots");
    mkdirSync(snapshotsDir, { recursive: true });
    return { repoDir, snapshotsDir };
  }

  const validSnapshot = JSON.stringify({ nodes: [{ id: "a" }], links: [], graph: { commit_sha: "cafe1234" } });

  it("resolves the snapshot named by a valid hex pointer", () => {
    const { repoDir, snapshotsDir } = setup();
    writeFileSync(join(snapshotsDir, "cafe1234.json"), validSnapshot);
    writeFileSync(join(repoDir, "latest-commit.txt"), "cafe1234");
    const result = resolveSnapshot(repoDir);
    expect(result).not.toBeNull();
    expect(result!.snapshotPath).toBe(join(snapshotsDir, "cafe1234.json"));
    expect(result!.nodeCount).toBe(1);
  });

  it("ignores a traversal pointer and never resolves a path outside snapshots/", () => {
    const { repoDir, snapshotsDir } = setup();
    // A valid snapshot lives inside snapshots/ ...
    writeFileSync(join(snapshotsDir, "abcdef0.json"), validSnapshot);
    // ... and a malicious file one level up that a traversal sha would hit.
    writeFileSync(join(repoDir, "evil.json"), validSnapshot);
    writeFileSync(join(repoDir, "latest-commit.txt"), "../evil");
    const result = resolveSnapshot(repoDir);
    // The guard rejects the traversal pointer; the newest-file scan only looks
    // inside snapshots/, so the result must never be the out-of-tree evil.json.
    expect(result).not.toBeNull();
    expect(result!.snapshotPath.startsWith(snapshotsDir)).toBe(true);
    expect(result!.snapshotPath).not.toContain("evil.json");
  });
});
