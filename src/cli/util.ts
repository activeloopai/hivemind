import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, symlinkSync, unlinkSync, lstatSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

export const HOME = homedir();

// Walk up from this module's location to the package root. Robust across
// three layouts:
//   - source (src/cli/util.ts) → project root
//   - local bundle (bundle/cli.js)              → project root
//   - npm-installed (node_modules/@deeplake/hivemind/bundle/cli.js)
//                                               → install dir
// Without the walk-up, the source path resolved to `src/` (one dir up
// from src/cli/util.ts), so unit tests importing the installers couldn't
// find the per-agent bundles at project_root/harnesses/<agent>/bundle/.
export function pkgRoot(): string {
  let dir = fileURLToPath(new URL(".", import.meta.url));
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
      if (pkg.name === "@deeplake/hivemind" || pkg.name === "hivemind") return dir;
    } catch { /* not here, keep walking */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: previous one-level-up behavior. Preserves backwards compat
  // if package.json is unreachable for any reason (sandbox, packed asar, ...).
  return fileURLToPath(new URL("..", import.meta.url));
}

export function ensureDir(path: string, mode: number = 0o755): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode });
}

export function copyDir(src: string, dst: string): void {
  cpSync(src, dst, { recursive: true, force: true, dereference: false });
}

export function symlinkForce(target: string, link: string): void {
  ensureDir(dirname(link));
  if (existsSync(link) || isLink(link)) unlinkSync(link);
  symlinkSync(target, link);
}

export function isLink(path: string): boolean {
  try { return lstatSync(path).isSymbolicLink(); } catch { return false; }
}

export function readJson<T = unknown>(path: string): T | null {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")) as T; } catch { return null; }
}

export function writeJson(path: string, obj: unknown): void {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

/**
 * Write JSON only if the serialized result differs from what's already on
 * disk. Returns true if it wrote, false if the file already matched.
 *
 * Why: Codex fingerprints each hook *definition* and re-prompts the user to
 * "review & trust" whenever a hook it sees has changed. Our installer used to
 * rewrite hooks.json unconditionally on every install/update — even when the
 * merged result was byte-identical — which re-triggered that trust prompt for
 * no reason. Skipping the write when nothing changed keeps the file (and its
 * fingerprint) stable, so Codex stops re-asking after the first trust.
 */
export function writeJsonIfChanged(path: string, obj: unknown): boolean {
  const next = JSON.stringify(obj, null, 2) + "\n";
  if (existsSync(path)) {
    try {
      if (readFileSync(path, "utf-8") === next) return false; // unchanged → no write
    } catch { /* unreadable → fall through and rewrite */ }
  }
  ensureDir(dirname(path));
  writeFileSync(path, next);
  return true;
}

export function writeVersionStamp(dir: string, version: string): void {
  ensureDir(dir);
  writeFileSync(join(dir, ".hivemind_version"), version);
}

export function readVersionStamp(dir: string): string | null {
  const p = join(dir, ".hivemind_version");
  if (!existsSync(p)) return null;
  try { return readFileSync(p, "utf-8").trim(); } catch { return null; }
}

export type PlatformId = "claude" | "codex" | "claw" | "cursor" | "hermes" | "pi" | "claude_cowork";

export interface DetectedPlatform {
  id: PlatformId;
  markerDir: string;
}

// Claude Desktop — host app for Claude Cowork — stores its connector config
// in an OS-specific application-support dir, NOT in ~/.claude (that's the
// Claude Code CLI). Cowork reads MCP servers from claude_desktop_config.json
// inside this dir, shared with Claude Desktop chat.
export function claudeDesktopConfigDir(): string {
  if (process.platform === "darwin") return join(HOME, "Library", "Application Support", "Claude");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(HOME, "AppData", "Roaming"), "Claude");
  return join(HOME, ".config", "Claude");
}

// Hivemind's value is bidirectional shared memory — every supported agent
// must capture (write) AND recall (read). Cline / Roo Code / Kilo Code were
// dropped because their public API (src/exports/cline.d.ts) is control-only
// (startNewTask / sendMessage / pressPrimary/SecondaryButton). No event
// subscription, no listener, no observation API. Auto-capture would require
// a fragile filesystem watcher on Cline's task storage. See the project
// memory for the investigation that arrived at this decision.
const PLATFORM_MARKERS: DetectedPlatform[] = [
  { id: "claude", markerDir: join(HOME, ".claude") },
  { id: "codex", markerDir: join(HOME, ".codex") },
  { id: "claw", markerDir: join(HOME, ".openclaw") },
  { id: "cursor", markerDir: join(HOME, ".cursor") },
  { id: "hermes", markerDir: join(HOME, ".hermes") },
  // pi (badlogic/pi-mono coding-agent) — config at ~/.pi/agent/. pi exposes
  // a rich extension event API (session_start / input / tool_call /
  // tool_result / message_end / session_shutdown / etc.) — Tier 1 capable.
  { id: "pi", markerDir: join(HOME, ".pi") },
  // claude_cowork — Anthropic's agentic desktop assistant, hosted in the
  // Claude Desktop app. Registers the shared hivemind MCP server into
  // claude_desktop_config.json (recall-only; capture is the desktop app's
  // own concern). Marker is the OS-specific Claude Desktop config dir.
  { id: "claude_cowork", markerDir: claudeDesktopConfigDir() },
];

export function detectPlatforms(): DetectedPlatform[] {
  return PLATFORM_MARKERS.filter(p => existsSync(p.markerDir));
}

export function allPlatformIds(): PlatformId[] {
  return PLATFORM_MARKERS.map(p => p.id);
}

export function log(msg: string): void {
  process.stdout.write(msg + "\n");
}

export function warn(msg: string): void {
  process.stderr.write(msg + "\n");
}

// Interactive y/n prompt. Renders the hint based on the default so a bare
// Enter is unambiguous. Writes the question to stderr (same channel as warn)
// so log piping stays clean. Callers must check process.stdin.isTTY first —
// readline on closed stdin would hang the process.
export function confirm(message: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(`${message} ${hint} `, answer => {
      rl.close();
      const a = answer.trim().toLowerCase();
      if (a === "") resolve(defaultYes);
      else resolve(a === "y" || a === "yes");
    });
  });
}

// Free-text prompt. Returns the trimmed answer, or "" if the user just
// pressed Enter. Same TTY caveat as confirm() — readline hangs on closed
// stdin, so callers must gate on process.stdin.isTTY.
export function promptLine(message: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
