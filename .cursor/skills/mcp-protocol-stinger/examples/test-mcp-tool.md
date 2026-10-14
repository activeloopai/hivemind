# Example: Test an MCP tool

A full Vitest test for the `hivemind_recent` tool from `examples/add-hivemind-tool.md`, following the boundary-mock pattern in `guides/07-testing-mcp.md`.

---

## Setup (shared with the existing suite)

The existing `tests/claude-code/mcp-server.test.ts` already stubs `McpServer`, `StdioServerTransport`, auth, config, the Deeplake API, grep-core, and version, and captures handlers into `registeredTools`. New tool tests slot into that file and reuse `importServer()` / the `beforeEach` mock resets. The skeleton:

```typescript
const registeredTools = new Map<string, { config: any; handler: (args: any) => Promise<unknown> }>();

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor(_meta: unknown) {}
    registerTool(name: string, config: unknown, handler: (args: unknown) => Promise<unknown>) {
      registeredTools.set(name, { config: config as any, handler: handler as any });
    }
    async connect(_transport: unknown) {}
  },
}));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));
// real sqlStr/sqlLike kept via importOriginal; queryMock drives ctx.api.query
```

---

## Tests for hivemind_recent

```typescript
describe("hivemind_recent", () => {
  it("appears in the registration set", async () => {
    await importServer();
    expect(registeredTools.has("hivemind_recent")).toBe(true);
    const cfg = registeredTools.get("hivemind_recent")!.config;
    expect(typeof cfg.description).toBe("string");
    expect(cfg.description.length).toBeGreaterThan(20);
  });

  it("not authenticated -> auth message, no query", async () => {
    loadCredentialsMock.mockReturnValue(null);
    await importServer();
    const out = await registeredTools.get("hivemind_recent")!.handler({});
    expect(JSON.stringify(out)).toContain("Not authenticated");
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("default limit = 20 when omitted", async () => {
    queryMock.mockResolvedValue([
      { path: "/summaries/alice/a.md", description: "d", project: "p", last_update_date: "2026-06-01" },
    ]);
    await importServer();
    await registeredTools.get("hivemind_recent")!.handler({});
    expect((queryMock.mock.calls[0][0] as string)).toContain("LIMIT 20");
  });

  it("respects explicit limit", async () => {
    await importServer();
    await registeredTools.get("hivemind_recent")!.handler({ limit: 5 });
    expect((queryMock.mock.calls[0][0] as string)).toContain("LIMIT 5");
  });

  it("zero rows -> 'No summaries found.'", async () => {
    queryMock.mockResolvedValue([]);
    await importServer();
    const out = await registeredTools.get("hivemind_recent")!.handler({});
    expect(JSON.stringify(out)).toContain("No summaries found.");
  });

  it("renders tab-separated rows with the header line", async () => {
    queryMock.mockResolvedValue([
      { path: "/summaries/alice/a.md", description: "first", project: "ml", last_update_date: "2026-06-10" },
    ]);
    await importServer();
    const out = await registeredTools.get("hivemind_recent")!.handler({}) as { content: { text: string }[] };
    expect(out.content[0].text.startsWith("path\tlast_updated\tproject\tdescription\n")).toBe(true);
    expect(out.content[0].text).toContain("/summaries/alice/a.md\t2026-06-10\tml\tfirst");
  });

  it("null fields render as placeholders, never the strings 'null'/'undefined'", async () => {
    queryMock.mockResolvedValue([{ description: null, project: null, last_update_date: null }]);
    await importServer();
    const out = await registeredTools.get("hivemind_recent")!.handler({}) as { content: { text: string }[] };
    expect(out.content[0].text).toBe("path\tlast_updated\tproject\tdescription\n?\t\t\t");
  });

  it("missing table -> 'No summaries found.' + fresh-org hint, no raw 400", async () => {
    queryMock.mockRejectedValue(new Error('relation "memory" does not exist'));
    await importServer();
    const out = await registeredTools.get("hivemind_recent")!.handler({}) as { content: { text: string }[] };
    expect(out.content[0].text).toContain("Hivemind memory is empty");
    expect(out.content[0].text).not.toContain("400");
  });

  it("non-Error rejection -> 'Recent failed: <string>'", async () => {
    queryMock.mockRejectedValue("boom");
    await importServer();
    const out = await registeredTools.get("hivemind_recent")!.handler({}) as { content: { text: string }[] };
    expect(out.content[0].text).toContain("Recent failed: boom");
  });
});
```

---

## Why each test exists (maps to `guides/07`)

| Test | Proves |
|---|---|
| registration set | the tool registers under the exact name (contract / no accidental drift) |
| not authenticated | domain failure short-circuits to the tool-result channel before any backend call |
| default / explicit limit | schema describes shape, handler owns the default |
| zero rows | empty result is an honest message, not a thrown JSON-RPC error |
| tab-separated render | the parseable output contract is intact |
| null placeholders | the agent never reads literal `"null"`/`"undefined"` |
| missing table | fresh-org classification (issue #252), no raw 400 leak |
| non-Error rejection | the `String(err)` branch never returns `[object Object]` |

---

## Run

```bash
npx vitest run tests/claude-code/mcp-server.test.ts
npm run typecheck
```
