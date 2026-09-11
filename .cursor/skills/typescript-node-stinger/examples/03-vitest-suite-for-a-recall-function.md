# Example 03 - A Vitest suite for a recall function

Goal: a full Vitest suite for `readSummariesByIds` from `examples/02`. Shows the Hivemind testing pattern: async, inject a fake client, assert behavior and the guarded SQL, no real network.

## The test file

`tests/shared/read-summaries.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DeeplakeApi } from "../../src/deeplake-api.js";
import { readSummariesByIds } from "../../src/recall/read-summaries.js";

function makeFakeApi(rows: Array<Record<string, unknown>>): DeeplakeApi {
  return {
    query: vi.fn(async (_sql: string) => rows),
    listTables: vi.fn(async () => ["memory_table"]),
  } as unknown as DeeplakeApi;
}

describe("readSummariesByIds", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns nothing for an empty id list without querying", async () => {
    const api = makeFakeApi([]);
    const out = await readSummariesByIds(api, "memory_table", []);
    expect(out).toEqual([]);
    expect(api.query).not.toHaveBeenCalled();   // short-circuit, no round-trip
  });

  it("batches all ids into one IN(...) query", async () => {
    const api = makeFakeApi([
      { id: "a", summary: "alpha" },
      { id: "b", summary: "beta" },
    ]);
    const out = await readSummariesByIds(api, "memory_table", ["a", "b"]);
    expect(out).toEqual([
      { id: "a", summary: "alpha" },
      { id: "b", summary: "beta" },
    ]);
    expect(api.query).toHaveBeenCalledTimes(1);                 // one round-trip
    expect(api.query).toHaveBeenCalledWith(expect.stringContaining("IN ('a', 'b')"));
  });

  it("escapes a single quote in an id (guarded SQL)", async () => {
    const api = makeFakeApi([]);
    await readSummariesByIds(api, "memory_table", ["a'b"]);
    // sqlStr doubles the quote: a'b -> 'a''b'
    expect(api.query).toHaveBeenCalledWith(expect.stringContaining("'a''b'"));
  });

  it("rejects an invalid table identifier", async () => {
    const api = makeFakeApi([]);
    await expect(readSummariesByIds(api, "bad name", ["a"])).rejects.toThrow(/Invalid SQL identifier/);
  });
});
```

## What this demonstrates

- **Inject the client, mock `query`** - no real network, no real org polluted (`guides/11`).
- **Assert behavior AND the SQL shape** - one round-trip (batching), the quote-escaping (guarded SQL), the identifier rejection.
- **`vi.restoreAllMocks()` in `beforeEach`** - keeps tests order-independent (`guides/10`).
- **`.rejects.toThrow`** for the `sqlIdent` throw - validate-and-throw on programmer error is correct (`guides/09`).
- **`.js` extension on the relative imports** even in a test (`guides/02`).

## Run it

```bash
npm test                 # vitest run
npx vitest run --coverage   # see coverage on the recall path
```

## See also

- `guides/10-vitest-discipline.md`, `guides/11-vitest-async-fixtures.md`.
- `templates/example.test.ts`, `examples/02`.
