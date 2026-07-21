/**
 * Bounded concurrency helper shared by `generate` and `refresh`: run `fn` over
 * `items` with at most `n` in flight. Order-independent — each worker pulls the
 * next index until the list is exhausted.
 */
export async function runPool<T>(
  items: T[],
  n: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/** Rate-limit / overload detection for host-LLM backoff. */
export function isRateLimitError(err: unknown): boolean {
  return err instanceof Error && /rate.?limit|429|overloaded|too many requests|quota/i.test(err.message);
}

/**
 * Run `fn`, retrying on rate-limit/overload errors with exponential backoff.
 * Non-rate-limit errors surface immediately. `sleep` is injectable for tests.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; backoffMs?: number[]; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const backoff = opts.backoffMs ?? [1000, 4000, 10000];
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err)) throw err;
      lastErr = err;
      if (attempt === retries) break;
      await sleep(backoff[Math.min(attempt, backoff.length - 1)]);
    }
  }
  throw lastErr ?? new Error("withRateLimitRetry: exhausted retries");
}
