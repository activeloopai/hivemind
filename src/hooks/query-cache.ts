import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { log as _log } from "../utils/debug.js";

const log = (msg: string) => _log("query-cache", msg);
const DEFAULT_CACHE_ROOT = join(homedir(), ".deeplake", "query-cache");
const INDEX_CACHE_FILE = "index.md";

interface QueryCacheDeps {
  cacheRoot?: string;
  logFn?: (msg: string) => void;
}

export function getSessionQueryCacheDir(sessionId: string, deps: QueryCacheDeps = {}): string {
  const { cacheRoot = DEFAULT_CACHE_ROOT } = deps;
  // Sanitize the harness-supplied session id before using it as a path
  // segment: an id containing `..` or `/` would otherwise let `join` resolve
  // the cache dir outside cacheRoot. Mirrors writeReadCacheFile's guard.
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
  return join(cacheRoot, safeSessionId);
}

export function clearSessionQueryCache(sessionId: string, deps: QueryCacheDeps = {}): void {
  const { logFn = log } = deps;
  try {
    rmSync(getSessionQueryCacheDir(sessionId, deps), { recursive: true, force: true });
  } catch (e: any) {
    logFn(`clear failed for session=${sessionId}: ${e.message}`);
  }
}

export function readCachedIndexContent(sessionId: string, deps: QueryCacheDeps = {}): string | null {
  const { logFn = log } = deps;
  try {
    return readFileSync(join(getSessionQueryCacheDir(sessionId, deps), INDEX_CACHE_FILE), "utf-8");
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    logFn(`read failed for session=${sessionId}: ${e.message}`);
    return null;
  }
}

export function writeCachedIndexContent(sessionId: string, content: string, deps: QueryCacheDeps = {}): void {
  const { logFn = log } = deps;
  try {
    const dir = getSessionQueryCacheDir(sessionId, deps);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, INDEX_CACHE_FILE), content, "utf-8");
  } catch (e: any) {
    logFn(`write failed for session=${sessionId}: ${e.message}`);
  }
}
