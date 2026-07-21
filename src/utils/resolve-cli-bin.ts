import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve an agent CLI binary (e.g. "claude", "codex") cross-platform.
 *
 * The original resolver shelled out to `which <cli> 2>/dev/null` and fell
 * back to `~/.claude/local/<cli>`. Both are Unix-only: `which` does not exist
 * on Windows (it's `where`), and an extensionless path is not a runnable
 * Windows program. On Windows the wiki-worker's `execFileSync(claudeBin, ...)`
 * therefore always threw ENOENT — caught and swallowed — so the summary file
 * was never written and every memory row stayed an empty placeholder.
 * (Confirmed against an all-placeholder memory table on a Windows user.)
 *
 * Windows specifics:
 *  - `where` prints EVERY match (e.g. `claude`, `claude.cmd`, `claude.ps1`),
 *    one per line. We prefer a directly-spawnable image: `.exe` (no shell
 *    needed) over `.cmd`/`.bat` (shell required — see {@link binNeedsShell}).
 *  - The per-user fallback is `claude.cmd` (the npm-style shim shape).
 *
 * @param cli       the executable name to look up (e.g. "claude", "codex").
 * @param fallback  what to return when the lookup finds nothing. Defaults to
 *                  the claude native-install location `~/.claude/local/<cli>`
 *                  (`.cmd` on Windows). Agents installed elsewhere pass their
 *                  own fallback (typically the literal CLI name, so PATH
 *                  resolution is retried at spawn time).
 */
export function resolveCliBin(cli: string, fallback?: string): string {
  const isWin = process.platform === "win32";
  try {
    const out = execFileSync(isWin ? "where" : "which", [cli], { encoding: "utf-8" });
    const matches = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (matches.length > 0) {
      if (!isWin) return matches[0];
      return (
        matches.find((m) => m.toLowerCase().endsWith(".exe")) ??
        matches.find((m) => /\.(cmd|bat)$/i.test(m)) ??
        matches[0]
      );
    }
  } catch {
    /* not on PATH — fall through to the fallback */
  }
  if (fallback !== undefined) return fallback;
  const local = join(homedir(), ".claude", "local", cli);
  return isWin ? `${local}.cmd` : local;
}

/**
 * True when a resolved binary must be spawned through a shell. Only Windows
 * `.cmd`/`.bat` shims need this — Node's `execFile`/`execFileSync` cannot
 * launch them directly (they require a terminal/shell), whereas `.exe` and
 * every Unix binary spawn directly.
 */
export function binNeedsShell(bin: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
}
