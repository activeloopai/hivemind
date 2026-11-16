import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeeplakeApi } from "../../src/deeplake-api.js";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function response(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ columns: ["value"], rows: [["ok"]] }),
    text: async () => "",
  } as Response;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
});

describe("DeeplakeApi queued query cancellation", () => {
  it("rejects a canceled waiter without taking a slot or bypassing FIFO", async () => {
    const api = new DeeplakeApi("token", "https://api.test", "org", "workspace", "table");
    const activeFetches: Deferred<Response>[] = [];
    fetchMock.mockImplementation(() => {
      const next = deferred<Response>();
      activeFetches.push(next);
      return next.promise;
    });

    const holders = Array.from({ length: 5 }, (_, i) => api.query(`SELECT ${i}`));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const canceledController = new AbortController();
    const canceled = api.query("SELECT canceled", canceledController.signal);
    const fifo = api.query("SELECT fifo");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    canceledController.abort();
    await expect(canceled).rejects.toThrow(/abort/i);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Free one real slot. The surviving waiter, which was queued after the
    // canceled one, must receive it; no timer or race is involved.
    activeFetches[0].resolve(response());
    for (let i = 0; i < 8 && fetchMock.mock.calls.length < 6; i++) await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(JSON.parse(fetchMock.mock.calls[5][1].body)).toEqual({ query: "SELECT fifo" });

    // Aborting the old signal again cannot affect the waiter that now owns the
    // slot, proving the canceled listener was removed when it was dequeued.
    canceledController.abort();
    for (const holder of activeFetches.slice(1, 5)) holder.resolve(response());
    activeFetches[5].resolve(response());
    await Promise.all([...holders, fifo]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("does not enqueue an already-aborted query or fetch it", async () => {
    const api = new DeeplakeApi("token", "https://api.test", "org", "workspace", "table");
    await expect(api.query("SELECT preaborted", AbortSignal.abort())).rejects.toThrow(/abort/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
