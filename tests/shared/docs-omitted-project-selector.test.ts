import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/docs/stable-read.js", () => ({
  stableUnionRows: (query: (sql: string) => unknown, sql: string) => query(sql),
}));
import { archiveDoc, editDoc } from "../../src/docs/write.js";

function fixture(project: string) {
  const row: Record<string, unknown> = {
    id: `${project}|main|src/manual.ts`, doc_id: "src/manual.ts",
    path: "/docs/manual.md", content: "durable document", anchors: "[]",
    tier: "fast", status: "active", project, scope: "main", version: 4,
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
    agent: "manual", plugin_version: "test",
  };
  const statements: string[] = [];
  const query = async (sql: string): Promise<Record<string, unknown>[]> => {
    statements.push(sql);
    if (sql.startsWith("SELECT")) {
      const selectedProject = sql.match(/AND project = '([^']*)'/)?.[1];
      const selectedScope = sql.match(/AND scope = '([^']*)'/)?.[1];
      if (selectedProject !== undefined && selectedProject !== row.project) return [];
      if (selectedScope !== undefined && selectedScope !== row.scope) return [];
      // Match the actual SELECT projection, which omits scope.
      const { scope: _scope, ...projected } = row;
      return [projected];
    }
    if (sql.startsWith("DELETE")) {
      // The selected source row must be excluded from duplicate cleanup.
      expect(sql).toContain(`id <> '${row.id}'`);
      return [];
    }
    if (sql.startsWith("UPDATE")) {
      const where = sql.slice(sql.lastIndexOf(" WHERE "));
      const selectedId = where.match(/id = '([^']*)'/)?.[1];
      const selectedProject = where.match(/AND project = '([^']*)'/)?.[1];
      const selectedScope = where.match(/AND scope = '([^']*)'/)?.[1];
      if (selectedId === row.id && selectedProject === row.project && selectedScope === row.scope) {
        row.status = sql.match(/status = '([^']*)'/)?.[1];
        row.version = Number(sql.match(/version = (\d+)/)?.[1]);
      }
      return [];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  return { query, row, statements };
}

describe("optional project selectors on existing document writes", () => {
  it.each(["archive", "edit"] as const)("preserves an omitted selector for a project-stamped %s", async (operation) => {
    const { query, row, statements } = fixture("selected-project");
    const input = { doc_id: "src/manual.ts" };
    const result = operation === "archive"
      ? await archiveDoc(query, "hivemind_docs", input, { project: undefined })
      : await editDoc(query, "hivemind_docs", { ...input, status: "archived" });
    expect(result.version).toBe(5);
    expect(row.status).toBe("archived");
    expect(row.version).toBe(5);
    expect(row.project).toBe("selected-project");
    expect(statements[0]).not.toContain("AND project =");
    expect(statements.find(sql => sql.startsWith("UPDATE"))).toContain("AND project = 'selected-project'");
  });

  it("retains an explicit empty-project selector rather than treating it as omitted", async () => {
    const { query, row, statements } = fixture("foreign-project");
    await expect(archiveDoc(query, "hivemind_docs", { doc_id: "src/manual.ts" }, { project: "" }))
      .rejects.toThrow("Doc not found");
    expect(row.status).toBe("active");
    expect(statements.some(sql => sql.startsWith("UPDATE") || sql.startsWith("DELETE"))).toBe(false);
  });

  it("continues archiving explicitly selected legacy rows", async () => {
    const { query, row } = fixture("");
    await archiveDoc(query, "hivemind_docs", { doc_id: "src/manual.ts" }, { project: "" });
    expect(row.status).toBe("archived");
    expect(row.version).toBe(5);
  });
});
