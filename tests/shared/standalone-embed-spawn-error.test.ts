import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { _setSpawnImpl, tryEmbedStandalone } from "../../src/embeddings/standalone-embed-client.js";
import { pidPathFor } from "../../src/embeddings/protocol.js";

let dir: string | undefined;
afterEach(() => {
  _setSpawnImpl(null);
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe.skipIf(process.platform === "win32")("standalone daemon asynchronous spawn failure", () => {
  it("contains an asynchronous child error instead of letting it escape into the host", async () => {
    dir = mkdtempSync(join(tmpdir(), "hivemind-spawn-error-"));
    const entry = join(dir, "daemon.js");
    writeFileSync(entry, "// Installed entry, but the OS refuses to spawn it.\n");
    let emitted = false;
    let escaped: unknown;
    _setSpawnImpl(() => {
      const child = Object.assign(new EventEmitter(), { unref() {} });
      setImmediate(() => {
        emitted = true;
        // Node's ChildProcess reports EAGAIN/EACCES through this EventEmitter
        // channel after spawn() returns, outside the surrounding try/catch.
        // Catch only in the test so the unfixed behavior fails an assertion
        // instead of crashing the Vitest worker.
        try { child.emit("error", new Error("spawn EAGAIN")); }
        catch (error) { escaped = error; }
      });
      return child as unknown as ChildProcess;
    });
    const result = await tryEmbedStandalone("document", "document", {
      socketDir: dir, daemonEntry: entry, requestTimeoutMs: 50, spawnWaitMs: 40,
    });
    expect(emitted).toBe(true);
    expect(escaped).toBeUndefined();
    expect(result).toBeNull();
    expect(existsSync(pidPathFor(process.getuid?.() ?? "default", dir))).toBe(false);
  });
});
