/**
 * Cross-platform fake-home helper for tests.
 *
 * `os.homedir()` does NOT read `$HOME` on Windows — it reads `%USERPROFILE%`
 * (falling back to `%HOMEDRIVE%%HOMEPATH%`). Tests that fake the home dir by
 * setting only `process.env.HOME` therefore have no effect on Windows: the
 * production code resolves the real `C:\Users\<runner>\...`, so path
 * assertions mismatch and files written under the intended temp home ENOENT.
 *
 * `setFakeHome(dir)` sets every variable `os.homedir()` consults on any
 * platform; `clearFakeHome()` restores the real environment captured at
 * module load. On POSIX the extra vars are harmless (homedir reads `$HOME`),
 * so adopting this never changes Linux/macOS behavior.
 */

const REAL_HOME_ENV = snapshot();

const HOME_KEYS = ["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"] as const;
type HomeKey = (typeof HOME_KEYS)[number];

function snapshot(): Record<HomeKey, string | undefined> {
  return {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    HOMEDRIVE: process.env.HOMEDRIVE,
    HOMEPATH: process.env.HOMEPATH,
  };
}

/**
 * Point `os.homedir()` at `dir` on every platform.
 *
 * Sets `HOME` (POSIX) and `USERPROFILE` (Windows). When `dir` is a Windows
 * absolute path (`C:\...`) the drive/path pair is also set so the
 * `%HOMEDRIVE%%HOMEPATH%` fallback resolves to `dir` too; otherwise that pair
 * is cleared so a stale value can't win.
 */
export function setFakeHome(dir: string): void {
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  if (/^[A-Za-z]:/.test(dir)) {
    process.env.HOMEDRIVE = dir.slice(0, 2);
    process.env.HOMEPATH = dir.slice(2);
  } else {
    delete process.env.HOMEDRIVE;
    delete process.env.HOMEPATH;
  }
}

/** Restore the home-related env vars to their real values (captured at load). */
export function clearFakeHome(): void {
  for (const k of HOME_KEYS) {
    const v = REAL_HOME_ENV[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
