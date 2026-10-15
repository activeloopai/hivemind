import { describe, it, expect, vi, afterEach } from "vitest";

// Semantic gating for handleGrepDirect (the pre-tool-use fast path). The
// sibling grep-direct.test.ts pins embed() to null to keep its lexical
// assertions deterministic; this file stubs the embed client with a spy so
// it can assert *whether* a pattern is sent to the daemon at all.
const { mockEmbed } = vi.hoisted(() => ({ mockEmbed: vi.fn() }));
vi.mock("../../src/embeddings/client.js", () => ({
  EmbedClient: class {
    async embed(text: string, kind: string) { return mockEmbed(text, kind); }
    async warmup() { return false; }
  },
}));
vi.mock("../../src/embeddings/disable.js", () => ({
  embeddingsDisabled: () => false,
  embeddingsStatus: () => "enabled",
}));

import { handleGrepDirect, type GrepParams } from "../../src/hooks/grep-direct.js";

describe("handleGrepDirect: semantic pattern gating", () => {
  const baseParams: GrepParams = {
    pattern: "foo", targetPath: "/",
    ignoreCase: false, wordMatch: false, filesOnly: false, countOnly: false,
    lineNumber: false, invertMatch: false, fixedString: false,
  };

  function mockApi() {
    return { query: vi.fn().mockResolvedValue([]) } as any;
  }

  function sqlOf(api: { query: ReturnType<typeof vi.fn> }): string {
    return api.query.mock.calls.map(c => String(c[0])).join("\n");
  }

  afterEach(() => { mockEmbed.mockReset(); });

  it("embeds synonym alternations and runs the hybrid query (issue #86)", async () => {
    mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
    const api = mockApi();
    await handleGrepDirect(api, "memory", "sessions", {
      ...baseParams, pattern: "silent data loss|concurrent writer|race condition",
    });
    expect(mockEmbed).toHaveBeenCalledWith("silent data loss|concurrent writer|race condition", "query");
    expect(sqlOf(api)).toContain("<#>");
  });

  it("embeds plain patterns", async () => {
    mockEmbed.mockResolvedValue([0.1]);
    await handleGrepDirect(mockApi(), "memory", "sessions", { ...baseParams, pattern: "deploy failed" });
    expect(mockEmbed).toHaveBeenCalledWith("deploy failed", "query");
  });

  it("skips embedding for regex-heavy patterns even when they contain `|`", async () => {
    mockEmbed.mockResolvedValue([0.1]);
    const api = mockApi();
    await handleGrepDirect(api, "memory", "sessions", { ...baseParams, pattern: "(foo|bar)\\+" });
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(sqlOf(api)).not.toContain("<#>");
  });

  it("skips embedding for alternations with more than 8 alternatives", async () => {
    mockEmbed.mockResolvedValue([0.1]);
    await handleGrepDirect(mockApi(), "memory", "sessions", {
      ...baseParams, pattern: "a1|a2|a3|a4|a5|a6|a7|a8|a9",
    });
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("embeds an alternation at the 8-alternative limit", async () => {
    mockEmbed.mockResolvedValue([0.1]);
    await handleGrepDirect(mockApi(), "memory", "sessions", {
      ...baseParams, pattern: "a1|a2|a3|a4|a5|a6|a7|a8",
    });
    expect(mockEmbed).toHaveBeenCalled();
  });

  it("skips embedding for patterns shorter than 2 chars", async () => {
    await handleGrepDirect(mockApi(), "memory", "sessions", { ...baseParams, pattern: "|" });
    expect(mockEmbed).not.toHaveBeenCalled();
  });
});
