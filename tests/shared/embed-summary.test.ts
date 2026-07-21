import { describe, it, expect, vi } from "vitest";
import { embedSummaryWithWarmup, type SummaryEmbedder } from "../../src/embeddings/embed-summary.js";

/**
 * embedSummaryWithWarmup is the finalize-path embedder. Unlike the hot-path
 * EmbedClient.embed() (which returns null immediately on a cold daemon while
 * spawning in the background), this warms the daemon first and retries once,
 * so ENABLED users reliably get an embedding instead of a permanent NULL.
 *
 * These tests inject a fake SummaryEmbedder so no daemon / socket is touched.
 */

function fakeClient(opts: {
  warmup?: () => Promise<boolean>;
  embedResults: Array<number[] | null>;
}): SummaryEmbedder & { warmupCalls: number; embedCalls: number } {
  let i = 0;
  const state = {
    warmupCalls: 0,
    embedCalls: 0,
    async warmup() {
      state.warmupCalls++;
      return opts.warmup ? opts.warmup() : true;
    },
    async embed(_text: string) {
      state.embedCalls++;
      return opts.embedResults[i++] ?? null;
    },
  };
  return state;
}

describe("embedSummaryWithWarmup", () => {
  it("warms the daemon BEFORE embedding (cold-start fix)", async () => {
    const order: string[] = [];
    const client: SummaryEmbedder = {
      async warmup() { order.push("warmup"); return true; },
      async embed() { order.push("embed"); return [0.1, 0.2]; },
    };
    const vec = await embedSummaryWithWarmup("hello", "document", { client });
    expect(vec).toEqual([0.1, 0.2]);
    expect(order).toEqual(["warmup", "embed"]);
  });

  it("returns the vector on the first successful attempt without retrying", async () => {
    const client = fakeClient({ embedResults: [[0.5, 0.6]] });
    const vec = await embedSummaryWithWarmup("text", "document", { client });
    expect(vec).toEqual([0.5, 0.6]);
    expect(client.warmupCalls).toBe(1);
    expect(client.embedCalls).toBe(1);
  });

  it("retries once when the first embed attempt returns null (cold daemon race)", async () => {
    // Models the production failure: warmup spawned the daemon, but the first
    // connect raced the spawn and got null; the retry finds it ready.
    const client = fakeClient({ embedResults: [null, [0.7, 0.8, 0.9]] });
    const vec = await embedSummaryWithWarmup("text", "document", { client });
    expect(vec).toEqual([0.7, 0.8, 0.9]);
    expect(client.embedCalls).toBe(2);
  });

  it("returns null (graceful) when both attempts fail — finalize still writes NULL", async () => {
    const client = fakeClient({ embedResults: [null, null] });
    const vec = await embedSummaryWithWarmup("text", "document", { client });
    expect(vec).toBeNull();
    expect(client.embedCalls).toBe(2);
  });

  it("treats an empty-array embedding as a miss and retries", async () => {
    const client = fakeClient({ embedResults: [[], [1, 2]] });
    const vec = await embedSummaryWithWarmup("text", "document", { client });
    expect(vec).toEqual([1, 2]);
    expect(client.embedCalls).toBe(2);
  });

  it("attempts embedding even when warmup did not confirm ready", async () => {
    const log = vi.fn();
    const client = fakeClient({ warmup: async () => false, embedResults: [[3, 4]] });
    const vec = await embedSummaryWithWarmup("text", "document", { client, log });
    expect(vec).toEqual([3, 4]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("warmup did not confirm"));
  });

  it("never throws — a thrown client error degrades to null", async () => {
    const client: SummaryEmbedder = {
      async warmup() { return true; },
      async embed() { throw new Error("socket exploded"); },
    };
    const log = vi.fn();
    const vec = await embedSummaryWithWarmup("text", "document", { client, log });
    expect(vec).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("socket exploded"));
  });
});
