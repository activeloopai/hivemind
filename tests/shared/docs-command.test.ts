import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/docs/embed.js", () => ({ makeDocEmbedder: () => async () => null, makeQueryEmbedder: () => async () => null }));
import { tryDocsRead } from "../../src/docs/docs-command.js";

// query mock: docs-table SELECT returns one hit; anything else empty.
const query = async (sql: string) => (/FROM "docs"/.test(sql) ? [{ path: "src/utils/sql.ts", content: "# sql.ts\nescaping" }] : []);

describe("tryDocsRead", () => {
  it("dispatches cat /docs/find/<q> to the docs table and renders hits", async () => {
    const out = await tryDocsRead(`cat /docs/find/injection`, query, "docs");
    expect(out).toContain("src/utils/sql.ts");
  });
  it("ls /docs → the rendered docs index (same root view as the Claude hook)", async () => {
    const out = await tryDocsRead(`ls /docs`, query, "docs");
    expect(out).toContain("# Docs Index");
  });
  it("returns null for a non-/docs read (caller falls through)", async () => {
    expect(await tryDocsRead(`cat /summaries/alice/x.md`, query, "docs")).toBeNull();
    expect(await tryDocsRead(`grep foo /`, query, "docs")).toBeNull();
  });
  it("refuses path traversal out of /docs", async () => {
    expect(await tryDocsRead(`cat /docs/../secret`, query, "docs")).toBeNull();
  });
});
