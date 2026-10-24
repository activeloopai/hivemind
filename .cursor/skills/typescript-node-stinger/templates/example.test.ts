// Canonical Hivemind Vitest test template.
// - Lives under tests/<harness>/ or tests/shared/, mirroring src/ (guides/10).
// - Async, mocks the injected Deep Lake client (never hits the network).
// - Note the .js extension on the relative import - the ESM rule applies in
//   tests too (guides/02).
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DeeplakeApi } from "../../src/deeplake-api.js";
// import { searchDeeplakeTables } from "../../src/mcp/server.js";

/** A fake client returning canned rows; query() is a spy so you can assert SQL. */
function makeFakeApi(rows: Array<Record<string, unknown>>): DeeplakeApi {
  return {
    query: vi.fn(async (_sql: string) => rows),
    listTables: vi.fn(async () => ["memory_table", "sessions_table"]),
  } as unknown as DeeplakeApi;
}

describe("recall (example)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns matching rows", async () => {
    const api = makeFakeApi([{ path: "/summaries/alice/1.md", content: "a hit" }]);
    // const rows = await searchDeeplakeTables(api, "memory_table", "sessions_table", opts, { truncated: false });
    const rows = await api.query("SELECT 1");
    expect(rows).toHaveLength(1);
  });

  it("escapes a user-supplied prefix into the LIKE pattern", async () => {
    const api = makeFakeApi([]);
    // Drive the unit, then assert the SQL it built was guarded:
    await api.query("WHERE path LIKE '%' ESCAPE '\\\\'");
    expect(api.query).toHaveBeenCalledWith(expect.stringContaining("ESCAPE '\\\\'"));
  });

  it("rejects an invalid identifier", async () => {
    // sqlIdent throws on a bad identifier - that is correct (programmer error).
    // await expect(async () => readTable("bad name")).rejects.toThrow(/Invalid SQL identifier/);
    expect(() => {
      throw new Error("Invalid SQL identifier");
    }).toThrow(/Invalid SQL identifier/);
  });
});
