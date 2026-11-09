# 07 - Testing MCP Servers with Vitest

How Hivemind tests `src/mcp/server.ts`, and the pattern to require of any new tool.

---

## The boundary-mock pattern

You cannot easily drive a real stdio handshake in a unit test, and you should not need to. The tool *handlers* are the logic worth testing; the transport and the SDK plumbing are not. Hivemind's test (`tests/claude-code/mcp-server.test.ts`, Vitest ^4) **captures the handler callbacks at registration time** by stubbing `McpServer`, then invokes each handler directly.

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
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));
```

Now a test can do `registeredTools.get("hivemind_search")!.handler({ query: "x" })` and assert on the result. The transport never opens; the SDK is a stub.

---

## Mock at the boundary, keep the load-bearing logic real

Hivemind mocks the *external* dependencies (auth, config, the Deeplake API, version) but keeps the security-critical helpers **real**:

```typescript
vi.mock("../../src/utils/sql.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/sql.js")>();
  return actual; // use real sqlStr / sqlLike for fidelity
});
```

Using the real `sqlStr` / `sqlLike` is what lets the suite assert the injection guard actually escapes wildcards:

```typescript
expect(sql).toMatch(/WHERE path LIKE '\/summaries\/alice\/.*%' ESCAPE '\\'/);
```

Stubbing those would test the mock, not the protection.

---

## What every tool's tests must cover

The Hivemind suite is the template. For each tool, prove:

1. **Registration shape.** Exactly the expected tools register, each with a non-trivial description:
   ```typescript
   expect(Array.from(registeredTools.keys()).sort()).toEqual([
     "hivemind_index", "hivemind_read", "hivemind_search",
   ]);
   ```
2. **The unauthenticated branch.** Missing credentials short-circuits to the auth message *before* any backend call (`expect(queryMock).not.toHaveBeenCalled()`).
3. **The invalid-config branch.** Creds present but config null returns the config error.
4. **The empty-result branch.** Zero rows returns the honest "No matches / No content / No summaries" text - a domain outcome, not a thrown error.
5. **The happy path.** Hits return the expected content shape and the handler called the backend with the right options (e.g. `buildGrepSearchOptions` called with `{ pattern, ignoreCase: true, fixedString: true }`).
6. **Defaults and bounds.** `limit` defaults to 10 when omitted; the explicit limit is respected.
7. **The failure branch.** A rejected backend promise becomes `"<Op> failed: <msg>"`, including the **non-Error rejection** path (`String(err)`), proving the handler never returns `[object Object]`.
8. **Domain-specific classification.** The fresh-org (issue #252) tests prove a missing-TABLE 400 becomes the empty-memory hint, while a missing-COLUMN error still surfaces raw.
9. **Output-format guarantees.** `hivemind_index` renders tab-separated rows and replaces null fields with `?`/empty, never the strings `"null"`/`"undefined"` (this output feeds the agent verbatim).
10. **Input guards.** `hivemind_read` rejects a path that does not start with `/`; the wildcard-injection test proves `ESCAPE` + escaped wildcards are present.

---

## Running

```bash
npm test            # vitest run (whole suite)
npx vitest run tests/claude-code/mcp-server.test.ts
npm run typecheck   # tsc --noEmit
```

`npm run ci` runs `typecheck` + duplication check + the full suite.

---

## Audit checklist (testing)

- [ ] Tool handlers are captured via a stubbed `McpServer.registerTool` and invoked directly.
- [ ] Transport (`StdioServerTransport`) is stubbed; no real handshake.
- [ ] External deps mocked; SQL-escaping / security helpers kept real.
- [ ] Every tool has unauth, empty, happy, and failure-branch tests.
- [ ] Non-Error rejection path is exercised.
- [ ] Output-format and input-guard invariants are asserted.
- [ ] Registration-shape test pins the exact tool set and names (catches accidental rename/removal = contract drift).

---

*Sources: `research/2026-06-16-vitest-mcp-testing.md`, `research/2026-06-16-mcp-sdk-typescript.md`*
