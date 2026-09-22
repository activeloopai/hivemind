import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsFault = vi.hoisted(() => ({
  path: "",
  error: null as NodeJS.ErrnoException | null,
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (path: unknown, ...args: unknown[]) => {
      if (path === fsFault.path && fsFault.error) throw fsFault.error;
      return (actual.readFileSync as (...inner: unknown[]) => unknown)(path, ...args);
    },
    writeFileSync: (...args: unknown[]) => {
      fsFault.writeFileSync(...args);
      return (actual.writeFileSync as (...inner: unknown[]) => unknown)(...args);
    },
    renameSync: (...args: unknown[]) => {
      fsFault.renameSync(...args);
      return (actual.renameSync as (...inner: unknown[]) => unknown)(...args);
    },
  };
});

import {
  _resetUserConfigForTesting,
  _setConfigPathForTesting,
  getEmbeddingsEnabled,
  readUserConfig,
  setEmbeddingsEnabled,
} from "../../src/user-config.js";

const originalEnv = process.env.HIVEMIND_EMBEDDINGS;

beforeEach(() => {
  fsFault.path = "/tmp/hivemind-injected-io-error/config.json";
  fsFault.error = Object.assign(new Error("injected config read failure"), { code: "EIO" });
  fsFault.writeFileSync.mockClear();
  fsFault.renameSync.mockClear();
  _setConfigPathForTesting(() => fsFault.path);
  process.env.HIVEMIND_EMBEDDINGS = "true";
});

afterEach(() => {
  _resetUserConfigForTesting();
  if (originalEnv === undefined) delete process.env.HIVEMIND_EMBEDDINGS;
  else process.env.HIVEMIND_EMBEDDINGS = originalEnv;
});

describe("user config I/O failures", () => {
  it("keeps passive getters safe but never migrates or explicitly writes over an unreadable config", () => {
    expect(readUserConfig()).toEqual({});
    expect(getEmbeddingsEnabled()).toBe(true);
    expect(() => setEmbeddingsEnabled(false)).toThrow(/could not be read.*injected config read failure/);
    expect(fsFault.writeFileSync).not.toHaveBeenCalled();
    expect(fsFault.renameSync).not.toHaveBeenCalled();
  });
});
