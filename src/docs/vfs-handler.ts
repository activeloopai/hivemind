/**
 * Virtual filesystem handler for the docs index under
 * ~/.deeplake/memory/docs/ — the same intercept pattern as the graph mount
 * (src/graph/vfs-handler.ts), but a SEPARATE surface from the session-memory
 * index so browsing docs never pollutes memory retrieval.
 *
 * Unlike the graph handler (sync, reads a local snapshot), docs live in the
 * Deeplake table, so this handler is ASYNC and takes a `query` seam. It stays
 * cheap by construction: directory levels read metadata only (`listDocMeta`,
 * no content), and one-line summaries are fetched only for the files directly
 * in the viewed directory (`listDocsByIds`).
 *
 * Path shapes (relative to <memory>/docs/):
 *   ""  |  "index.md"            → root index (top directories, counts)
 *   "<dir>"  |  "<dir>/index.md" → directory index (subdirs + files + summaries)
 *   "<path>.md"                  → the doc content for source file <path>
 *
 * `index.md` at any level is always the DIRECTORY index; a real file's doc is
 * "<basename-with-extension>.md" (e.g. `diff.ts.md`), so there is no collision.
 */

import { listDocMeta, listDocsByIds, getDocLatest, type QueryFn } from "./read.js";
import { buildDocsIndex, dirOf, firstDocLine, type DocMeta } from "./index-render.js";
import { searchDocs, type SearchOptions } from "../shell/grep-core.js";
import { sqlLike } from "../utils/sql.js";
import { computeFingerprint, parseFingerprint, changedFiles } from "./fingerprint.js";
import { parseFilesIndex, WIKI_DOC_PREFIX } from "./wiki-generate.js";
import { readPrivateDoc } from "./private-store.js";
import { MAIN_SCOPE, type GitRunner } from "./branch-scope.js";
import type { DocEmbedder } from "./embed.js";

export type DocsVfsResult =
  | { kind: "ok"; body: string }
  | { kind: "not-found"; message: string };

export interface DocsVfsOptions {
  /** Query embedder (kind='query') for semantic `find/`. Absent → lexical only. */
  embedQuery?: DocEmbedder;
  /** Project scope for shared org tables (legacy '' rows always included). */
  project?: string;
  /**
   * The reader's branch view (`main` or `b:<branch>`), from their git checkout.
   * When set, a leaf doc resolves with branch precedence: the reader's own
   * overlay if present, else main, never another branch's overlay. Absent →
   * legacy behavior (latest version, scope-agnostic).
   */
  readerScope?: string;
  /**
   * Git runner for the read-time freshness verdict: when present, a leaf doc
   * whose stored fingerprint differs from HEAD's is served WITH a banner naming
   * the changed files, so the reader falls back to source and stays correct.
   */
  git?: GitRunner;
}

/** Resolve a `<memory>/docs/` subpath to rendered text from the docs table. */
export async function handleDocsVfs(
  subpath: string,
  query: QueryFn,
  tableName: string,
  opts: DocsVfsOptions = {},
): Promise<DocsVfsResult> {
  const path = subpath.replace(/^\/+/, "").replace(/\/+$/, "");

  // `find/<query>` — hybrid semantic+lexical search over doc content. Checked
  // BEFORE the directory/leaf resolution so `find` is never treated as a dir.
  // `.md` subpaths fall through: docs whose source lives under a real `find/`
  // directory render as `find/<file>.md` leaves and must stay browsable
  // (search queries are free text and never end in `.md`).
  if (path === "find" || (path.startsWith("find/") && !path.endsWith(".md"))) {
    const q = path === "find" ? "" : path.slice("find/".length).trim();
    if (q === "") {
      return { kind: "ok", body: "Usage: cat <memory>/docs/find/<query> — search docs by meaning/keyword." };
    }
    const queryEmbedding = opts.embedQuery ? await opts.embedQuery(q) : null;
    const searchOpts: SearchOptions = {
      pathFilter: "",
      contentScanOnly: false,
      likeOp: "ILIKE",
      escapedPattern: sqlLike(q),
      queryEmbedding,
      limit: 20,
      project: opts.project,
    };
    const hits = await searchDocs(query, tableName, searchOpts);
    if (hits.length === 0) return { kind: "ok", body: `No docs match "${q}".` };
    const lines = [`${hits.length} doc(s) match "${q}"${queryEmbedding ? " (semantic + keyword)" : " (keyword)"}:`, ""];
    for (const h of hits) lines.push(`## ${h.path}\n${firstDocLine(h.content)}`);
    lines.push("", `Open one with: cat <memory>/docs/<path>.md`);
    return { kind: "ok", body: lines.join("\n") };
  }

  // Decide whether this is a directory index or a leaf doc.
  let dir: string | null = null;
  if (path === "" || path === "index.md") dir = "";
  else if (path.endsWith("/index.md")) dir = path.slice(0, -"/index.md".length);
  else if (!path.endsWith(".md")) dir = path; // a bare directory (e.g. `cat .../docs/src/graph`)

  if (dir !== null) {
    const meta: DocMeta[] = (await listDocMeta(query, tableName, { dirPrefix: dir, project: opts.project, readerScope: opts.readerScope })).map((r) => ({
      doc_id: r.doc_id,
      version: r.version,
      updated_at: r.updated_at,
      status: r.status,
      tier: r.tier,
    }));
    const directFiles = meta
      .filter((m) => m.status === "active" && dirOf(m.doc_id) === dir)
      .map((m) => m.doc_id);
    const summaries = new Map<string, string>();
    if (directFiles.length > 0) {
      for (const d of await listDocsByIds(query, tableName, directFiles, { projectOrLegacy: opts.project, readerScope: opts.readerScope })) {
        summaries.set(d.doc_id, firstDocLine(d.content));
      }
    }
    return { kind: "ok", body: buildDocsIndex(meta, dir, summaries) };
  }

  // Leaf: "<source-file>.md" → doc for that file.
  const docId = path.slice(0, -".md".length);

  // Highest precedence: THIS machine's private doc for the current branch (a doc
  // built from committed-but-unpushed code, held out of the shared cloud). Only
  // the owner, on that branch, sees it. `project === ""` is a legitimate legacy/
  // default key, so test for presence (!== undefined), not truthiness — an
  // empty-string project must still resolve its private docs.
  if (opts.project !== undefined && opts.readerScope && opts.readerScope !== MAIN_SCOPE) {
    const priv = readPrivateDoc(opts.project, opts.readerScope, docId);
    if (priv) {
      const banner = staleBanner(opts.git, priv.doc_id, priv.content, priv.source_fp);
      const header = `# ${priv.doc_id}\nvisibility: private (this branch, not pushed)  updated: ${priv.updated_at}\n---\n`;
      return { kind: "ok", body: header + banner + priv.content };
    }
  }

  const row = await getDocLatest(query, tableName, docId, { projectOrLegacy: opts.project, readerScope: opts.readerScope });
  if (!row) return { kind: "not-found", message: `${subpath}: No such file or directory` };

  const banner = staleBanner(opts.git, row.doc_id, row.content, row.source_fp);
  const header =
    `# ${row.doc_id}\n` +
    `version: ${row.version}  tier: ${row.tier}  status: ${row.status}  updated: ${row.updated_at}\n` +
    `---\n`;
  return { kind: "ok", body: header + banner + row.content };
}

/**
 * Read-time freshness verdict: compare the page's stored fingerprint to HEAD's
 * current one. If member files changed since it was written, return a banner
 * naming them so the reader confirms against source (on-demand posture); else "".
 */
function staleBanner(git: GitRunner | undefined, docId: string, content: string, source_fp?: string): string {
  if (!git || !source_fp) return "";
  const files = docId.startsWith(WIKI_DOC_PREFIX) ? parseFilesIndex(content) : [docId];
  const changed = changedFiles(parseFingerprint(source_fp), computeFingerprint(git, files));
  if (changed.length === 0) return "";
  return (
    `> [!] This page may be stale — ${changed.length} source file(s) changed since it was written. ` +
    `Confirm against the source before relying on it: ${changed.join(", ")}\n\n`
  );
}
