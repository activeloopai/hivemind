/**
 * Per-file extraction cache (Phase 1.5).
 *
 * Phase 1's `runBuildCommand` re-parsed every source file on every invocation
 * (full rebuild, ~2.5s for 280 files on hivemind). With the cache, unchanged
 * files load their FileExtraction from disk in microseconds — full rebuild on
 * 1-file-changed drops to ~85ms (~30× faster).
 *
 * Cache layout:
 *   ~/.hivemind/graphs/<repo-key>/.cache/<content-sha256>.json
 *     where content-sha256 = sha256(utf8(file content)) — NOT path-derived.
 *     Same content across files / branches / users shares one entry.
 *
 * Invalidation: content-addressed by definition. Different content → different
 * key → no stale reads possible. Pruning is deferred to a later phase; the
 * cache grows but only by one entry per distinct file content ever seen.
 *
 * Schema versioning: cache entries embed `extractor_schema` so a bump in the
 * extractor output shape (e.g., adding a new edge relation) invalidates the
 * old entries automatically — readers ignore mismatched-schema entries and
 * fall through to re-extraction.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

import type { FileExtraction } from "./types.js";

/**
 * Bump when the FileExtraction shape changes in a way that makes existing
 * cache entries unsafe to reuse (new fields with defaults are fine; renamed
 * or removed fields are not).
 */
export const CACHE_SCHEMA_VERSION = 1;

interface CacheEntry {
  /** Bump invalidates all entries with the prior version. */
  schema: number;
  /** SHA-256 of the source file content (same as the cache filename). */
  content_sha256: string;
  /** The cached extraction. relativePath inside is the path used at write time;
   *  consumers MUST override with the current call's relativePath because the
   *  same content can live at different paths (renames, monorepo copies, etc.). */
  extraction: FileExtraction;
}

/** Compute the SHA-256 hex digest of file contents (cache key). */
export function fileContentHash(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

/** Per-repo cache directory: <baseDir>/.cache. */
export function cacheDir(baseDir: string): string {
  return join(baseDir, ".cache");
}

/** Path for a specific content hash. Doesn't touch the filesystem. */
export function cachePath(baseDir: string, contentSha256: string): string {
  return join(cacheDir(baseDir), `${contentSha256}.json`);
}

/**
 * Look up the cached extraction for a given content hash. Returns null on
 * cache miss, malformed entries, schema-version mismatch, or when the entry
 * was extracted under a different file extension. Errors during
 * read are swallowed — a corrupt cache entry must not block the build.
 *
 * The returned extraction's `source_file` is REWRITTEN to the supplied
 * `relativePath` so the same cached content can be reused across rename /
 * copy scenarios without leaking the original path back into the snapshot.
 */
export function readCache(
  baseDir: string,
  contentSha256: string,
  relativePath: string,
): FileExtraction | null {
  const path = cachePath(baseDir, contentSha256);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    (parsed as CacheEntry).schema !== CACHE_SCHEMA_VERSION ||
    (parsed as CacheEntry).content_sha256 !== contentSha256
  ) {
    return null;
  }
  const cached = (parsed as CacheEntry).extraction;
  if (
    cached === undefined ||
    typeof cached !== "object" ||
    !Array.isArray(cached.nodes) ||
    !Array.isArray(cached.edges) ||
    !Array.isArray(cached.parse_errors)
  ) {
    return null;
  }
  // Per-item field validation. Without this, a corrupt entry whose items
  // pass the array-typeof check (e.g., { nodes: [{ id: 1 }] }) would either
  // throw later when rewriteSourceFile calls .startsWith on a non-string,
  // or — worse, when path-rewrite is a no-op — silently return broken data
  // to the build pipeline. Returning null here falls through to re-extract,
  // which then writes a fresh well-formed entry. Self-healing.
  if (!validateItems(cached)) {
    return null;
  }
  // The key is content-only, but extractor dispatch and grammar choice depend
  // on the file extension (.js vs .ts, and .ts vs .tsx pick different
  // tree-sitter grammars). Identical bytes under a different extension must
  // re-extract rather than inherit the other language/dialect's result.
  // Compared case-sensitively: the TS extractor's grammar pick is itself
  // case-sensitive (.TSX parses with the plain TS grammar), so folding case
  // here could serve a tsx-grammar entry for a .TSX file.
  if (extname(cached.source_file) !== extname(relativePath)) {
    return null;
  }
  // Rewrite source_file on every node, every edge id reference, and every
  // parse_error to the caller's path. Wrapped in try/catch as belt-and-
  // suspenders against any unforeseen item shape that slipped past
  // validateItems.
  try {
    return rewriteSourceFile(cached, relativePath);
  } catch {
    return null;
  }
}

/**
 * Verify every required FileExtraction field has the right type. Returns
 * true when the extraction is safe to consume; false otherwise.
 *
 * Validation is structural — we DON'T constrain enum values (kind, relation,
 * confidence, language) to today's union members because adding a new
 * value should not silently fail the cache for future-extracted entries;
 * that's what CACHE_SCHEMA_VERSION is for. We DO verify the field is a
 * string (the only enum type we use) so downstream string ops are safe.
 *
 * Same-path early-return in rewriteSourceFile means corrupt items would
 * otherwise slip through and crash downstream consumers; validateItems
 * runs unconditionally so the no-op path is also guarded.
 */
function validateItems(ex: FileExtraction): boolean {
  if (typeof ex.source_file !== "string") return false;
  if (typeof ex.language !== "string") return false;
  for (const n of ex.nodes) {
    if (n === null || typeof n !== "object") return false;
    if (typeof n.id !== "string") return false;
    if (typeof n.label !== "string") return false;
    if (typeof n.kind !== "string") return false;
    if (typeof n.source_file !== "string") return false;
    if (typeof n.source_location !== "string") return false;
    if (typeof n.language !== "string") return false;
    if (typeof n.exported !== "boolean") return false;
  }
  for (const e of ex.edges) {
    if (e === null || typeof e !== "object") return false;
    if (typeof e.source !== "string") return false;
    if (typeof e.target !== "string") return false;
    if (typeof e.relation !== "string") return false;
    if (typeof e.confidence !== "string") return false;
    if (e.ord !== undefined && typeof e.ord !== "number") return false;
  }
  for (const p of ex.parse_errors) {
    if (p === null || typeof p !== "object") return false;
    if (typeof p.source_file !== "string") return false;
    if (typeof p.message !== "string") return false;
    if (p.location !== undefined && typeof p.location !== "string") return false;
  }
  return true;
}

/**
 * Write the extraction to the cache atomically (temp + rename in the same
 * directory). Errors are swallowed — a cache write must never block a build.
 */
export function writeCache(
  baseDir: string,
  contentSha256: string,
  extraction: FileExtraction,
): void {
  const entry: CacheEntry = {
    schema: CACHE_SCHEMA_VERSION,
    content_sha256: contentSha256,
    extraction,
  };
  const path = cachePath(baseDir, contentSha256);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(entry));
    renameSync(tmp, path);
  } catch {
    // Cache writes are best-effort.
  }
}

/**
 * Return a new FileExtraction with every `source_file` field (top-level + on
 * each node, edge `source`/`target` prefix, and parse_error) rewritten from
 * the cached path to `relativePath`. Pure: the input is not mutated.
 *
 * Edge source/target IDs encode the file path as their prefix
 * (`<source_file>:<symbol>:<kind>` or `<source_file>::module`), so any rename
 * of the file must rewrite these too. The unresolved target form
 * `unresolved:<originating-file>:<name>:<kind>` is also file-scoped per the
 * earlier codex fix and gets rewritten here.
 */
function rewriteSourceFile(cached: FileExtraction, newPath: string): FileExtraction {
  const oldPath = cached.source_file;
  if (oldPath === newPath) {
    return cached;
  }
  const swap = (id: string): string => {
    if (id.startsWith(`${oldPath}:`)) return `${newPath}${id.slice(oldPath.length)}`;
    if (id.startsWith(`unresolved:${oldPath}:`)) {
      return `unresolved:${newPath}${id.slice(`unresolved:${oldPath}`.length)}`;
    }
    return id;
  };
  return {
    source_file: newPath,
    language: cached.language,
    // The synthetic module node uses source_file as its `label` (see
    // makeModuleNode in the extractor). On a cache hit after a rename/copy
    // we already rewrite `id` + `source_file`, but were leaving `label`
    // pointing at the OLD path — the snapshot then disagreed with a
    // fresh (non-cached) extraction. Rewrite `label` for module nodes too.
    // CodeRabbit P1.
    nodes: cached.nodes.map((n) => ({
      ...n,
      id: swap(n.id),
      label: n.kind === "module" ? newPath : n.label,
      source_file: newPath,
    })),
    edges: cached.edges.map((e) => ({ ...e, source: swap(e.source), target: swap(e.target) })),
    parse_errors: cached.parse_errors.map((p) => ({ ...p, source_file: newPath })),
  };
}
