# 11 - Vitest Async & Fixtures

Most Hivemind code is async I/O against Deep Lake, so most tests are async and most of them mock the client. This guide is the mocking + fixture playbook.

## Async tests

Vitest awaits a returned promise; just make the test `async` and `await` the unit:

```ts
it("reads content at a path", async () => {
  const api = makeFakeApi([{ path: "/index.md", content: "hello" }]);
  const text = await readPath(api, "/index.md");
  expect(text).toContain("hello");
});
```

Use `await expect(fn()).rejects.toThrow(...)` for the throwing paths (e.g. `sqlIdent` on a bad identifier).

## Mock the Deep Lake client, not `fetch`

The unit under test should accept the client (or a context holding it) so the test can pass a fake. Prefer dependency injection over mocking global `fetch`:

```ts
function makeFakeApi(rows: Array<Record<string, unknown>>) {
  return {
    query: vi.fn(async (_sql: string) => rows),
    listTables: vi.fn(async () => ["mem", "sess"]),
  } as unknown as DeeplakeApi;
}
```

Assert on the SQL the unit built when the SQL shape matters (e.g. that a prefix was `sqlLike`-escaped):

```ts
expect(api.query).toHaveBeenCalledWith(expect.stringContaining("ESCAPE '\\\\'"));
```

When you must mock the network layer, `vi.spyOn(globalThis, "fetch")` and return a `Response` - but only for tests of the client itself (retry/backoff behavior), not for tests of code that should be using the client.

## Testing the retry / Semaphore behavior

To test `deeplake-api.ts` directly: spy on `fetch`, return a 429 then a 200, and assert the call was retried and that backoff was applied (fake timers help):

```ts
vi.useFakeTimers();
const fetchSpy = vi.spyOn(globalThis, "fetch")
  .mockResolvedValueOnce(new Response("", { status: 429 }))
  .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
// advance timers across the backoff, await, assert two calls
```

## Fixtures and temp dirs

- **In-memory fixtures** for Deep Lake rows - plain arrays of objects matching the column names in `deeplake-schema.ts`.
- **Temp dirs** for filesystem units: `mkdtempSync(join(tmpdir(), "hivemind-"))` in `beforeEach`, `rmSync(dir, { recursive: true, force: true })` in `afterEach`. Never write into the repo tree.
- **`vi.restoreAllMocks()` in `beforeEach`** so mocks do not leak between tests (the source of order dependence).

## Common findings

- A test mocking global `fetch` to test code that should accept the injected client - **should-refactor**.
- A fixture whose keys do not match `deeplake-schema.ts` column names - **should-refactor** (drifts from reality).
- A temp dir not cleaned up in `afterEach` - **should-refactor**.
- Mocks not reset between tests, producing order dependence - **must-fix**.

## Sources

- `tests/` (real mocking patterns), `src/deeplake-api.ts`, `src/deeplake-schema.ts`.
- `research/2026-06-16-vitest-esm-discipline.md`.
