import { describe, expect, it, vi } from "vitest";
import { runPool, isRateLimitError, withRateLimitRetry } from "../../src/docs/pool.js";

describe("runPool", () => {
  it("processes every item and never exceeds the concurrency cap", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const done: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await runPool(items, 4, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      done.push(n);
      inFlight--;
    });
    expect(done.sort((a, b) => a - b)).toEqual(items);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1); // actually ran in parallel
  });

  it("passes the index and tolerates an empty list", async () => {
    const seen: Array<[number, number]> = [];
    await runPool(["a", "b"], 2, async (_v, i) => { seen.push([i, i]); });
    expect(seen.map(([i]) => i).sort()).toEqual([0, 1]);
    await expect(runPool([], 4, async () => {})).resolves.toBeUndefined();
  });
});

describe("isRateLimitError", () => {
  it("matches rate-limit / 429 / overloaded / quota messages", () => {
    for (const m of ["rate limit exceeded", "HTTP 429", "model overloaded", "quota exceeded", "Too Many Requests"]) {
      expect(isRateLimitError(new Error(m))).toBe(true);
    }
  });
  it("does not match unrelated errors", () => {
    expect(isRateLimitError(new Error("connection refused"))).toBe(false);
    expect(isRateLimitError("not an error")).toBe(false);
  });
});

describe("withRateLimitRetry", () => {
  const noSleep = async () => {};

  it("retries a rate-limited call and then succeeds", async () => {
    let n = 0;
    const out = await withRateLimitRetry(async () => {
      if (n++ < 2) throw new Error("429 rate limit");
      return "ok";
    }, { sleep: noSleep });
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });

  it("surfaces a non-rate-limit error immediately", async () => {
    let n = 0;
    await expect(
      withRateLimitRetry(async () => { n++; throw new Error("bad prompt"); }, { sleep: noSleep }),
    ).rejects.toThrow(/bad prompt/);
    expect(n).toBe(1);
  });

  it("gives up after the retry budget", async () => {
    let n = 0;
    await expect(
      withRateLimitRetry(async () => { n++; throw new Error("overloaded"); }, { retries: 2, sleep: noSleep }),
    ).rejects.toThrow(/overloaded/);
    expect(n).toBe(3); // initial + 2 retries
  });
});
