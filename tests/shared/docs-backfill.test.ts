import { describe, expect, it, vi } from "vitest";
import { backfillDocEmbeddings } from "../../src/docs/backfill.js";

describe("backfillDocEmbeddings", () => {
  it("embeds only docs missing a vector, one UPDATE each", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT")) return [
        { id: "1", content: "doc one", dims: null },   // missing → embed
        { id: "2", content: "doc two", dims: 0 },        // empty  → embed
        { id: "3", content: "doc three", dims: 768 },    // has vector → skip
      ];
      return [];
    });
    const embed = vi.fn(async () => [0.1, 0.2, 0.3]);
    const report = await backfillDocEmbeddings(query, "hivemind_docs", embed, 1);
    expect(report).toEqual({ scanned: 3, embedded: 2, skipped: 1 });
    expect(embed).toHaveBeenCalledTimes(2);
    const updates = calls.filter(c => c.startsWith("UPDATE"));
    expect(updates).toHaveLength(2);
    expect(updates[0]).toContain("content_embedding = ");
    expect(updates.some(u => u.includes("WHERE id = '1'"))).toBe(true);
    expect(updates.some(u => u.includes("WHERE id = '3'"))).toBe(false); // skipped
  });

  it("leaves the column NULL when the embedder is off (returns null)", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      return sql.startsWith("SELECT") ? [{ id: "1", content: "x", dims: null }] : [];
    });
    const report = await backfillDocEmbeddings(query, "hivemind_docs", async () => null, 1);
    expect(report.embedded).toBe(0);
    expect(calls.filter(c => c.startsWith("UPDATE"))).toHaveLength(0);
  });
});
