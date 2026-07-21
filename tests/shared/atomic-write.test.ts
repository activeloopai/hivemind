/**
 * Unit tests for the shared notifications atomic-write helper. The fs rename
 * and the backoff are injected so the Windows-only EPERM/EBUSY retry path and
 * the containment edge cases are fully exercised on any platform.
 */

import { describe, it, expect, vi } from "vitest";
import { join, sep } from "node:path";
import { isPathInsideHome, renameAtomic } from "../../src/utils/atomic-write.js";

describe("isPathInsideHome", () => {
  const home = join(sep + "home", "u");
  it("true for a path inside home", () => {
    expect(isPathInsideHome(join(home, ".deeplake", "q.json"), home)).toBe(true);
  });
  it("true when path equals home", () => {
    expect(isPathInsideHome(home, home)).toBe(true);
  });
  it("false for an upward escape (..)", () => {
    expect(isPathInsideHome(join(home, "..", "evil", "q.json"), home)).toBe(false);
  });
  it("false for an absolute path elsewhere", () => {
    expect(isPathInsideHome(join(sep + "etc", "passwd"), home)).toBe(false);
  });
  it("false for a sibling whose name merely shares the home prefix", () => {
    // home=/home/u, path=/home/user2 — a naive startsWith(home) would wrongly
    // accept this; relative() yields '../user2' so it's correctly rejected.
    expect(isPathInsideHome(join(sep + "home", "user2", "q.json"), home)).toBe(false);
  });
});

describe("renameAtomic", () => {
  it("renames once on success, no cleanup", () => {
    const rename = vi.fn();
    const cleanup = vi.fn();
    renameAtomic("a.tmp", "a.json", { rename, cleanup, backoff: () => {} });
    expect(rename).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith("a.tmp", "a.json");
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("retries a retryable error (EPERM/EBUSY/EACCES) then succeeds", () => {
    for (const code of ["EPERM", "EBUSY", "EACCES"]) {
      let calls = 0;
      const rename = vi.fn(() => {
        if (++calls < 3) { const e: NodeJS.ErrnoException = new Error(code); e.code = code; throw e; }
      });
      const backoff = vi.fn();
      renameAtomic("a.tmp", "a.json", { rename, backoff, maxAttempts: 10 });
      expect(rename).toHaveBeenCalledTimes(3);
      expect(backoff).toHaveBeenCalledTimes(2); // two failures before the win
    }
  });

  it("does NOT retry a non-retryable error; cleans up and rethrows", () => {
    const e: NodeJS.ErrnoException = new Error("ENOENT"); e.code = "ENOENT";
    const rename = vi.fn(() => { throw e; });
    const cleanup = vi.fn();
    expect(() => renameAtomic("a.tmp", "a.json", { rename, cleanup, backoff: () => {} })).toThrow("ENOENT");
    expect(rename).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith("a.tmp");
  });

  it("gives up after maxAttempts on a persistent retryable error", () => {
    const e: NodeJS.ErrnoException = new Error("EBUSY"); e.code = "EBUSY";
    const rename = vi.fn(() => { throw e; });
    const cleanup = vi.fn();
    const backoff = vi.fn();
    expect(() => renameAtomic("a.tmp", "a.json", { rename, cleanup, backoff, maxAttempts: 4 })).toThrow("EBUSY");
    expect(rename).toHaveBeenCalledTimes(4);
    expect(backoff).toHaveBeenCalledTimes(3); // backoff between attempts, not after the last
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("default cleanup path runs (no injected cleanup) and swallows its own unlink error", () => {
    const e: NodeJS.ErrnoException = new Error("ENOENT"); e.code = "ENOENT";
    const rename = vi.fn(() => { throw e; });
    // No cleanup injected → exercises defaultCleanup, which unlinks the
    // (nonexistent) tmp and swallows the resulting error.
    expect(() => renameAtomic("does-not-exist.tmp", "a.json", { rename, backoff: () => {} })).toThrow("ENOENT");
  });

  it("default backoff path runs (no injected backoff) and still succeeds after a retry", () => {
    let calls = 0;
    const rename = vi.fn(() => {
      if (++calls < 2) { const e: NodeJS.ErrnoException = new Error("EBUSY"); e.code = "EBUSY"; throw e; }
    });
    // No backoff injected → exercises the real synchronous spin (one short ~10ms wait).
    renameAtomic("a.tmp", "a.json", { rename, maxAttempts: 3 });
    expect(rename).toHaveBeenCalledTimes(2);
  });
});
