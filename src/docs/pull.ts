/**
 * Local materialization of canonical docs — `hivemind docs pull`.
 *
 * The table is the source of truth; GitHub never sees the docs. Each pulled
 * doc lands next to the code as a GITIGNORED `*.hivemind.md` file:
 *   - wiki page  `wiki/xarray/plot`  → `xarray/plot.hivemind.md`
 *   - file doc   `src/foo.ts`        → `src/foo.ts.hivemind.md`
 *
 * Delta protocol: a local manifest (`.hivemind/docs-pull.json`, gitignored)
 * stores the `updated_at` cursor of the last pull. Each pull reads only rows
 * with `updated_at > cursor` for this (project, scope) — O(changed docs), not
 * O(corpus). Rows are targeted by their composite id prefix
 * (`<project>|<scope>|`) so the read never selects the `scope` column and
 * works on tables that predate it.
 *
 * Writes are deterministic (same content → same bytes) and skipped when the
 * on-disk file already matches, so repeated pulls never churn mtimes. An
 * archived doc removes its local file.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { sqlIdent, sqlLike, sqlStr } from "../utils/sql.js";
import { stableUnionRows } from "./stable-read.js";
import { docRowId } from "./write.js";
import { META_DOC_ID } from "./meta.js";
import { WIKI_DOC_PREFIX } from "./wiki-generate.js";
import type { QueryFn } from "./read.js";

export const PULL_MANIFEST_DIR = ".hivemind";
export const PULL_MANIFEST_FILE = "docs-pull.json";

/** Gitignore lines every pulled repo needs (docs stay off GitHub by design). */
export const GITIGNORE_ENTRIES = ["*.hivemind.md", ".hivemind/"];

export interface PullManifest {
  /** Max `updated_at` already materialized. Empty = never pulled. */
  cursor: string;
}

/**
 * Repo-relative path a doc materializes to. Wiki pages get a distinct
 * `.wiki.hivemind.md` suffix: a root-level file can produce a wiki key equal
 * to its own path (`wiki/main.ts` vs file doc `main.ts`), and a shared
 * suffix would let one overwrite the other. Returns null for doc_ids that
 * would escape the repo (absolute, `..` segments) — those are never written.
 */
export function localDocPath(docId: string): string | null {
  const isWiki = docId.startsWith(WIKI_DOC_PREFIX);
  const rel = isWiki ? docId.slice(WIKI_DOC_PREFIX.length) : docId;
  if (rel === "" || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) return null;
  if (rel.split("/").some((seg) => seg === ".." || seg === "")) return null;
  return isWiki ? `${rel}.wiki.hivemind.md` : `${rel}.hivemind.md`;
}

export function readPullManifest(repoRoot: string): PullManifest {
  try {
    const raw = JSON.parse(readFileSync(join(repoRoot, PULL_MANIFEST_DIR, PULL_MANIFEST_FILE), "utf-8"));
    return { cursor: typeof raw?.cursor === "string" ? raw.cursor : "" };
  } catch {
    return { cursor: "" };
  }
}

export function writePullManifest(repoRoot: string, manifest: PullManifest): void {
  const dir = join(repoRoot, PULL_MANIFEST_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, PULL_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");
}

/**
 * Idempotently append the hivemind ignore lines to the repo's `.gitignore`.
 * Existing content is preserved byte-for-byte; already-present lines are not
 * duplicated. Returns true when the file was modified.
 */
export function ensureGitignoreEntries(repoRoot: string): boolean {
  const path = join(repoRoot, ".gitignore");
  let current = "";
  try {
    current = readFileSync(path, "utf-8");
  } catch {
    // no .gitignore yet — created below
  }
  const lines = new Set(current.split("\n").map((l) => l.trim()));
  const missing = GITIGNORE_ENTRIES.filter((e) => !lines.has(e));
  if (missing.length === 0) return false;
  const prefix = current === "" || current.endsWith("\n") ? current : current + "\n";
  writeFileSync(path, prefix + missing.join("\n") + "\n");
  return true;
}

export interface PullArgs {
  query: QueryFn;
  tableName: string;
  repoRoot: string;
  project: string;
  /** Which shared view to materialize. Default `main` (the canonical truth). */
  scope?: string;
  /** Ignore the cursor and re-materialize everything. */
  force?: boolean;
}

export interface PullReport {
  /** Repo-relative paths written (created or content changed). */
  written: string[];
  /** Repo-relative paths removed (doc archived). */
  removed: string[];
  /** Docs whose local file already matched — untouched. */
  unchanged: number;
  /** New cursor persisted to the manifest. */
  cursor: string;
}

/** Pull the (project, scope) docs newer than the local cursor into the repo. */
export async function pullDocs(args: PullArgs): Promise<PullReport> {
  const scope = args.scope ?? "main";
  const manifest = readPullManifest(args.repoRoot);
  const cursor = args.force ? "" : manifest.cursor;

  const safe = sqlIdent(args.tableName);
  const idPrefix = docRowId(args.project, scope, "");
  // INCLUSIVE cursor (>=): a concurrent write can land with exactly the max
  // timestamp this pull records, AFTER our SELECT — a strict `>` would skip
  // it forever. Re-reading the boundary rows every pull is free: unchanged
  // content is detected on disk and never rewritten.
  const cursorFilter = cursor === "" ? "" : ` AND updated_at >= '${sqlStr(cursor)}'`;
  // id-prefix LIKE targets (project, scope) without selecting the scope column
  // (backward compat: reads must work on tables that predate the column).
  const rows = await stableUnionRows(
    args.query,
    `SELECT id, doc_id, content, status, updated_at FROM "${safe}" ` +
      `WHERE id LIKE '${sqlLike(idPrefix)}%'${cursorFilter}`,
  );

  // Latest row per doc_id (defensive — upsert keeps one, but never trust it).
  const latest = new Map<string, { doc_id: string; content: string; status: string; updated_at: string }>();
  for (const r of rows) {
    const doc_id = String(r.doc_id ?? "");
    if (doc_id === "" || doc_id === META_DOC_ID) continue;
    const updated_at = String(r.updated_at ?? "");
    const prev = latest.get(doc_id);
    if (!prev || updated_at > prev.updated_at) {
      latest.set(doc_id, { doc_id, content: String(r.content ?? ""), status: String(r.status ?? ""), updated_at });
    }
  }

  const written: string[] = [];
  const removed: string[] = [];
  let unchanged = 0;
  let maxSeen = manifest.cursor;
  const rootAbs = resolve(args.repoRoot);

  for (const doc of latest.values()) {
    if (doc.updated_at > maxSeen) maxSeen = doc.updated_at;
    const rel = localDocPath(doc.doc_id);
    if (rel === null) continue; // unmappable/unsafe doc_id — never touch disk
    const abs = resolve(rootAbs, rel);
    if (!abs.startsWith(rootAbs + sep)) continue; // paranoia: stay inside the repo

    if (doc.status !== "active") {
      if (existsSync(abs)) {
        rmSync(abs);
        removed.push(rel);
      }
      continue;
    }
    const body = doc.content.endsWith("\n") ? doc.content : doc.content + "\n";
    let existing: string | null = null;
    try {
      existing = readFileSync(abs, "utf-8");
    } catch {
      // not materialized yet
    }
    if (existing === body) {
      unchanged++;
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    written.push(rel);
  }

  ensureGitignoreEntries(args.repoRoot);
  writePullManifest(args.repoRoot, { cursor: maxSeen });
  return { written, removed, unchanged, cursor: maxSeen };
}
