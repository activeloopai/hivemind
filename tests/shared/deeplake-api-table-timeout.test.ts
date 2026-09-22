import { afterEach, describe, expect, it, vi } from "vitest";
import { DeeplakeApi } from "../../src/deeplake-api.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const nativeAbortTimeout = AbortSignal.timeout.bind(AbortSignal);

function makeApi(): DeeplakeApi {
  return new DeeplakeApi("tok", "https://api.test", "org", "ws", "memory");
}

function tablesResponse(...tables: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tables: tables.map(table_name => ({ table_name })) }),
  };
}

async function withWatchdog<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("test watchdog expired")), 500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  delete process.env.HIVEMIND_QUERY_TIMEOUT_MS;
});

describe("DeeplakeApi table discovery timeout", () => {
  it.each([
    ["empty", "", 10_000],
    ["spaces", "   ", 10_000],
    ["blank whitespace", "\t\r\n", 10_000],
    ["non-numeric", "abc", 10_000],
    ["negative", "-1", 10_000],
    ["fractional", "12.75", 12],
    ["above the signed timer range", "2147483648", 2_147_483_647],
    ["infinite", "Infinity", 10_000],
  ])("normalizes a %s configured timeout and still performs a fast fetch", async (_label, configured, expected) => {
    process.env.HIVEMIND_QUERY_TIMEOUT_MS = configured;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
      .mockImplementation(delay => nativeAbortTimeout(delay));
    fetchMock.mockResolvedValueOnce(tablesResponse("memory"));

    await expect(makeApi().knownTablesOrNull()).resolves.toEqual(["memory"]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(timeoutSpy).toHaveBeenCalledWith(expected);
  });

  it.each([
    ["the documented default", undefined, 10_000],
    ["zero", "0", 0],
  ])("preserves %s while a valid fast metadata fetch succeeds", async (_label, configured, expected) => {
    if (configured !== undefined) process.env.HIVEMIND_QUERY_TIMEOUT_MS = configured;
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
      .mockImplementation(delay => nativeAbortTimeout(delay));
    fetchMock.mockResolvedValueOnce(tablesResponse("memory", "sessions"));

    await expect(makeApi().knownTablesOrNull()).resolves.toEqual(["memory", "sessions"]);

    expect(timeoutSpy).toHaveBeenCalledWith(expected);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a native abort signal to stop a metadata fetch that never returns headers", async () => {
    process.env.HIVEMIND_QUERY_TIMEOUT_MS = "15";
    let abortReason: unknown;
    fetchMock.mockImplementation((_url: string, opts: { signal: AbortSignal }) =>
      new Promise<never>((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          abortReason = opts.signal.reason;
          reject(opts.signal.reason);
        }, { once: true });
      }));

    await expect(withWatchdog(makeApi().knownTablesOrNull())).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(abortReason).toMatchObject({ name: "TimeoutError" });
  });

  it("keeps the native signal active while consuming the response body", async () => {
    process.env.HIVEMIND_QUERY_TIMEOUT_MS = "15";
    let bodyAbortReason: unknown;
    fetchMock.mockImplementation((_url: string, opts: { signal: AbortSignal }) => ({
      ok: true,
      status: 200,
      json: () => new Promise<never>((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          bodyAbortReason = opts.signal.reason;
          reject(opts.signal.reason);
        }, { once: true });
      }),
    }));

    await expect(withWatchdog(makeApi().knownTablesOrNull())).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(bodyAbortReason).toMatchObject({ name: "TimeoutError" });
  });
});
