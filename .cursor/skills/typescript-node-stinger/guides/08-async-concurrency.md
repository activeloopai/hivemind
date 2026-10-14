# 08 - Async & Concurrency

Hivemind is I/O-bound: nearly every operation is a Deep Lake round-trip. Getting async and concurrency right is the difference between a snappy hook and one that gets the org rate-limited.

## The Semaphore is the concurrency model

`src/deeplake-api.ts` owns a module-level `Semaphore(5)` (`MAX_CONCURRENCY`). Every `query()` acquires a slot before its `fetch` and releases it after. This bounds the number of in-flight requests so a burst of hook activity does not hammer the endpoint into 429s.

The rule: **all Deep Lake traffic flows through the client, so it is automatically bounded.** A hand-rolled `fetch` escapes the Semaphore and is a **must-fix** (`guides/03`). If you genuinely need a second concurrency pool for a different resource, copy the `Semaphore` pattern - do not raise `MAX_CONCURRENCY`.

```ts
class Semaphore {
  // acquire() returns a release fn; queue waiters; release the next on completion.
}
```

## Batch, don't loop-await

`await` inside a loop serializes. For independent reads, either batch into one SQL statement (`guides/03`) or fan out with `Promise.all` (the Semaphore still caps real concurrency at 5):

```ts
// Serial - each await blocks the next, latency = sum
for (const id of ids) results.push(await fetchOne(id));

// Concurrent - bounded by the Semaphore, latency ~= max
const results = await Promise.all(ids.map(fetchOne));
```

Prefer the single batched SQL statement when the reads hit the same table; use `Promise.all` when they are genuinely heterogeneous. An `await`-in-loop over independent work is a **should-refactor** (a **must-fix** on a hot hook path).

## await correctness

- **Never drop a promise.** A bare `someAsync()` with no `await` and no `.catch()` is a floating promise - if it rejects, you get an unhandled rejection. Either `await` it or, if it is deliberately fire-and-forget (a detached worker), document the intent and attach a `.catch()`.
- **Detached workers are the one sanctioned fire-and-forget.** The graph builder and SkillOpt worker are spawned detached on purpose (`nohup`-style) so SessionStart returns fast. That is intentional and documented in `esbuild.config.mjs` comments - it is not a floating promise.
- **`Promise.all` fails fast; `Promise.allSettled` when partial success is acceptable.** A batch of Deep Lake writes where one failure should not abort the rest uses `allSettled` and inspects results.

## Common findings

- A hand-rolled `fetch` to Deep Lake that escapes the Semaphore - **must-fix**.
- `await` inside a loop over independent reads - **should-refactor** / **must-fix** on a hot path.
- A floating promise (no `await`, no `.catch()`, not a documented detached worker) - **must-fix**.
- Raising `MAX_CONCURRENCY` to "go faster" - **must-fix** (the 5 is a rate-limit budget, not a tuning knob).

## Sources

- `src/deeplake-api.ts` (`Semaphore`, `MAX_CONCURRENCY`).
- `esbuild.config.mjs` (detached-worker comments).
- `research/2026-06-16-deeplake-sql-api.md`.
