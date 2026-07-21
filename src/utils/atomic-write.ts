/**
 * Shared atomic-write primitives for the notifications queue + state files.
 *
 * Both writers (queue.ts, state.ts) persist via write-temp-then-rename and
 * guard the destination against escaping `$HOME`. The logic is identical, so
 * it lives here once — and with injectable seams so the Windows-only retry
 * and the containment edge cases are unit-testable on any platform.
 */

import { renameSync as fsRenameSync, unlinkSync as fsUnlinkSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

/**
 * Defense-in-depth containment check: is `path` inside `home`?
 *
 * `relative(h, r)` is the cross-platform way to ask this. A path inside `h`
 * yields a relative path that neither escapes upward (`..`) nor re-anchors to
 * an absolute root. The earlier `r.startsWith(h + "/")` broke on Windows,
 * where `resolve` emits backslash separators (`C:\Users\u\...`) so the
 * hardcoded forward slash never matched and every write was blocked.
 */
export function isPathInsideHome(path: string, home: string): boolean {
  const r = resolve(path);
  const h = resolve(home);
  if (r === h) return true;
  const rel = relative(h, r);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Injectable seams for {@link renameAtomic} (defaults hit the real fs). */
export interface RenameAtomicOptions {
  rename?: (from: string, to: string) => void;
  /** Remove the temp file when giving up. */
  cleanup?: (tmp: string) => void;
  maxAttempts?: number;
  /** Backoff between attempts; injected in tests to avoid real waits. */
  backoff?: (attempt: number) => void;
}

/**
 * `renameSync` is atomic on POSIX, but on Windows it raises EPERM/EBUSY/EACCES
 * when the destination is transiently open (a concurrent reader, AV scanner,
 * or indexer holding the file). Retry a few times with a short backoff before
 * giving up. POSIX takes the first-try path, so Linux/macOS behavior is
 * unchanged.
 */
export function renameAtomic(tmp: string, dest: string, opts: RenameAtomicOptions = {}): void {
  const rename = opts.rename ?? fsRenameSync;
  const cleanup = opts.cleanup ?? defaultCleanup;
  const maxAttempts = opts.maxAttempts ?? 10;
  const backoff = opts.backoff ?? defaultBackoff;
  for (let attempt = 0; ; attempt++) {
    try {
      rename(tmp, dest);
      return;
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      const retryable = code === "EPERM" || code === "EBUSY" || code === "EACCES";
      if (!retryable || attempt >= maxAttempts - 1) {
        cleanup(tmp);
        throw e;
      }
      backoff(attempt);
    }
  }
}

function defaultCleanup(tmp: string): void {
  try { fsUnlinkSync(tmp); } catch { /* best-effort */ }
}

function defaultBackoff(attempt: number): void {
  // rename is a sync API, so yield with a short synchronous spin.
  const until = Date.now() + 10 * (attempt + 1);
  while (Date.now() < until) { /* spin */ }
}
