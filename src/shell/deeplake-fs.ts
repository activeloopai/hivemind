import { basename, posix } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DeeplakeApi } from "../deeplake-api.js";
import type {
  IFileSystem, FsStat, MkdirOptions, RmOptions, CpOptions,
  FileContent, BufferEncoding,
} from "just-bash";
import { normalizeContent } from "./grep-core.js";
import { EmbedClient } from "../embeddings/client.js";
import { embeddingSqlLiteral } from "../embeddings/sql.js";
import { embeddingsDisabled } from "../embeddings/disable.js";
import { buildVirtualIndexContent, INDEX_LIMIT_PER_SECTION } from "../hooks/virtual-table-query.js";
import {
  classifyPath,
  composeGoalPath,
  composeKpiPath,
  decomposeGoalPath,
  decomposeKpiPath,
  type PathKind,
} from "./goal-paths.js";
import { handleGraphVfs } from "../graph/vfs-handler.js";

interface ReadFileOptions { encoding?: BufferEncoding }
interface WriteFileOptions { encoding?: BufferEncoding }
interface DirentEntry { name: string; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }

// ── constants ─────────────────────────────────────────────────────────────────
const BATCH_SIZE = 10;
const PREFETCH_BATCH_SIZE = 50;
const FLUSH_DEBOUNCE_MS = 200;

// ── helpers ───────────────────────────────────────────────────────────────────
export function normPath(p: string): string {
  const r = posix.normalize(p.startsWith("/") ? p : "/" + p);
  return r === "/" ? r : r.replace(/\/$/, "");
}

function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

import { sqlStr as esc, sqlIdent } from "../utils/sql.js";

export function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return (
    ({
      json: "application/json", md: "text/markdown", txt: "text/plain",
      js: "text/javascript", ts: "text/typescript", html: "text/html",
      css: "text/css",
    } as Record<string, string>)[ext] ?? "text/plain"
  );
}

function normalizeSessionMessage(path: string, message: unknown): string {
  const raw = typeof message === "string" ? message : JSON.stringify(message);
  return normalizeContent(path, raw);
}

function resolveEmbedDaemonPath(): string {
  // This module is bundled to `<agent>/bundle/shell/deeplake-shell.js`,
  // while the embed daemon lives one level up at
  // `<agent>/bundle/embeddings/embed-daemon.js`. The earlier resolver
  // forgot the `..` and pointed at the non-existent
  // `bundle/shell/embeddings/embed-daemon.js`, which silently broke the
  // pre-tool-use shell embed path on every agent.
  return join(dirname(fileURLToPath(import.meta.url)), "..", "embeddings", "embed-daemon.js");
}

function joinSessionMessages(path: string, messages: unknown[]): string {
  return messages.map((message) => normalizeSessionMessage(path, message)).join("\n");
}

function fsErr(code: string, msg: string, path: string): Error {
  return Object.assign(new Error(`${code}: ${msg}, '${path}'`), { code });
}

// ── types ─────────────────────────────────────────────────────────────────────
interface FileMeta { size: number; mime: string; mtime: Date; }

interface PendingRow {
  path: string; filename: string;
  contentText: string; mimeType: string; sizeBytes: number;
  project?: string; description?: string;
  creationDate?: string; lastUpdateDate?: string;
}

// ── DeeplakeFs ────────────────────────────────────────────────────────────────
// ── Graph VFS bridge ──────────────────────────────────────────────────────────
//
// The codebase graph (Phase 1) lives at <memory-mount>/graph/. Its dispatcher
// is `handleGraphVfs()` in src/graph/vfs-handler.ts — a single source of truth
// shared between two consumers:
//
//   1. The pre-tool-use hook (Claude Code Bash/Read/Grep paths) — already
//      wired in src/hooks/pre-tool-use.ts.
//   2. This file, so the standalone deeplake-shell exposes the same VFS to
//      whoever's poking at the mount manually (debug, scripted access, etc).
//
// The bridge is intentionally thin: detect the /graph/ prefix, strip it,
// delegate. Path shape is documented in handleGraphVfs:
//   /graph              -> directory listing (index.md, find/, show/)
//   /graph/index.md     -> synthesized overview text
//   /graph/find/<pat>   -> synthesized search results
//   /graph/show/<key>   -> synthesized node detail
//   /graph/find         -> placeholder dir (no children to list)
//   /graph/show         -> placeholder dir (no children to list)
//
// The dispatcher is pure: no SQL, just reads the local snapshot file. The
// shell's cwd (inherited from the invoking terminal) determines which repo's
// graph to load.

const GRAPH_ROOT = "/graph";
const GRAPH_PREFIX = "/graph/";
const GRAPH_DIRS = new Set([GRAPH_ROOT, "/graph/find", "/graph/show"]);

function isGraphPath(p: string): boolean {
  return p === GRAPH_ROOT || p.startsWith(GRAPH_PREFIX);
}

function isGraphDir(p: string): boolean {
  return GRAPH_DIRS.has(p);
}

function graphSubpathOf(p: string): string {
  // p is normalized: "/graph" -> "", "/graph/index.md" -> "index.md",
  // "/graph/find/foo" -> "find/foo".
  if (p === GRAPH_ROOT) return "";
  return p.slice(GRAPH_PREFIX.length);
}

/**
 * Synthesize file content for a /graph/* path by delegating to the same
 * dispatcher the pre-tool-use hook uses. Throws ENOENT when the dispatcher
 * reports not-found so the FS API stays well-behaved.
 *
 * The "no-graph" return (no local snapshot for this cwd) is rendered as the
 * file body, NOT as ENOENT — the file conceptually exists; it just reports
 * its own emptiness. Same semantics as /index.md when no rows exist yet.
 */
function readGraphFile(p: string, cwd: string): string {
  const sub = graphSubpathOf(p);
  const r = handleGraphVfs(sub, cwd);
  if (r.kind === "ok") return r.body;
  if (r.kind === "no-graph") return `(no-graph) ${r.message}`;
  // not-found: surface as ENOENT so the shell shows the expected error
  throw fsErr("ENOENT", `${r.message}`, p);
}

export class DeeplakeFs implements IFileSystem {
  // path → Buffer (content) or null (exists but not fetched yet)
  private files = new Map<string, Buffer | null>();
  private meta  = new Map<string, FileMeta>();
  // dir path → Set of immediate child names
  private dirs  = new Map<string, Set<string>>();
  // batched writes pending SQL flush
  private pending = new Map<string, PendingRow>();
  // paths that have been flushed (INSERT) at least once — subsequent flushes use UPDATE
  private flushed = new Set<string>();

  /** Number of files loaded from the server during bootstrap. */
  get fileCount(): number { return this.files.size; }
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  // serialize flushes
  private flushChain: Promise<void> = Promise.resolve();

  // Paths that live in the sessions table (multi-row, read by concatenation)
  private sessionPaths = new Set<string>();
  private sessionsTable: string | null = null;

  // Path-routed structured tables. When non-null, the VFS classifies
  // each path (see ./goal-paths.ts) and dispatches reads/writes to
  // the right table instead of the generic memory table. Null means
  // the goal/kpi routing is disabled (test or legacy configurations).
  private goalsTable: string | null = null;
  private kpisTable: string | null = null;

  // Embedding client lazily created on first flush. Lives as long as the process.
  private embedClient: EmbedClient | null = null;

  private constructor(
    private readonly client: DeeplakeApi,
    private readonly table: string,
    readonly mountPoint: string,
  ) {
    this.dirs.set(mountPoint, new Set());
    if (mountPoint !== "/") this.dirs.set("/", new Set([mountPoint.slice(1)]));
  }

  static async create(
    client: DeeplakeApi,
    table: string,
    mount = "/memory",
    sessionsTable?: string,
    extra?: { goalsTable?: string; kpisTable?: string },
  ): Promise<DeeplakeFs> {
    const fs = new DeeplakeFs(client, table, mount);
    fs.sessionsTable = sessionsTable ?? null;
    fs.goalsTable = extra?.goalsTable ?? null;
    fs.kpisTable = extra?.kpisTable ?? null;
    // Ensure the memory table + goal/kpi tables exist before
    // bootstrapping. Each ensure call is idempotent and lazy-heals
    // any column drift from prior schema versions. Failures bubble
    // up; the shell will report them but stay alive (the
    // memory-side bootstrap catches its own errors below).
    await client.ensureTable();
    if (fs.goalsTable) {
      try { await client.ensureGoalsTable(fs.goalsTable); }
      catch { /* keep bootstrap moving — goal routing degrades gracefully */ }
    }
    if (fs.kpisTable) {
      try { await client.ensureKpisTable(fs.kpisTable); }
      catch { /* same — degrade gracefully */ }
    }

    // Bootstrap memory + sessions metadata in parallel.
    let sessionSyncOk = true;
    const memoryBootstrap = (async () => {
      const sql = `SELECT path, size_bytes, mime_type FROM "${table}" ORDER BY path`;
      try {
        const rows = await client.query(sql);
        for (const row of rows) {
          const p = row["path"] as string;
          // Goal/KPI-shaped paths belong exclusively to the dedicated
          // hivemind_goals / hivemind_kpis tables. Pre-routing hook
          // versions (<=0.7.4) wrote goals to the generic memory table
          // as plain files; surfacing those here re-injects phantom
          // goals into the VFS goal namespace — visible in `ls /goal/...`
          // but absent from `hivemind goal list` (the CLI reads only the
          // structured table). Skip them when the dedicated table is
          // configured so the two views stay in sync. (When it is not
          // configured, goal routing is off and these rows are the only
          // copy, so we keep them.)
          const kind = classifyPath(p);
          if ((kind === "goal" && fs.goalsTable) || (kind === "kpi" && fs.kpisTable)) {
            continue;
          }
          fs.files.set(p, null);
          fs.meta.set(p, {
            size: Number(row["size_bytes"] ?? 0),
            mime: (row["mime_type"] as string) ?? "application/octet-stream",
            mtime: new Date(),
          });
          fs.addToTree(p);
          fs.flushed.add(p);
        }
      } catch {
        // Table may not exist yet — start empty
      }
    })();

    const sessionsBootstrap = (sessionsTable && sessionSyncOk) ? (async () => {
      try {
        const sessionRows = await client.query(
          // NOTE: SUM(size_bytes) returns NULL on the Deeplake backend when combined
          // with GROUP BY path (confirmed against workspace `with_embedding`). MAX
          // works and — for the single-row-per-file layout — is equal to SUM. For
          // multi-row-per-turn layouts MAX under-reports total size but stays >0
          // so files don't look like empty placeholders in ls/stat.
          `SELECT path, MAX(size_bytes) as total_size FROM "${sessionsTable}" GROUP BY path ORDER BY path`
        );
        for (const row of sessionRows) {
          const p = row["path"] as string;
          if (!fs.files.has(p)) {
            fs.files.set(p, null);
            fs.meta.set(p, {
              size: Number(row["total_size"] ?? 0),
              mime: "application/x-ndjson",
              mtime: new Date(),
            });
            fs.addToTree(p);
          }
          fs.sessionPaths.add(p);
        }
      } catch {
        // Sessions table may not exist yet
      }
    })() : Promise.resolve();

    // Goals + KPIs bootstrap — read the latest version of each row in
    // the structured tables and synthesize VFS paths for the cache.
    // ls / cat then work naturally against the file map, while
    // writes route to upsertRow which dispatches by path classifier.
    const goalsBootstrap = fs.goalsTable ? (async () => {
      try {
        const goalRows = await client.query(
          // One row per goal_id (UPDATE-or-INSERT model). Synthesize
          // the canonical VFS path from owner / status / goal_id.
          `SELECT goal_id, owner, status, content, created_at ` +
          `FROM "${fs.goalsTable}" ORDER BY created_at DESC`
        );
        for (const row of goalRows) {
          const owner = String(row["owner"] ?? "");
          const status = String(row["status"] ?? "");
          const goal_id = String(row["goal_id"] ?? "");
          if (!owner || !status || !goal_id) continue;
          if (status !== "opened" && status !== "in_progress" && status !== "closed") continue;
          const p = composeGoalPath({ owner, status, goal_id });
          const content = String(row["content"] ?? "");
          fs.files.set(p, Buffer.from(content, "utf-8"));
          fs.meta.set(p, {
            size: Buffer.byteLength(content, "utf-8"),
            mime: "text/markdown",
            mtime: new Date(),
          });
          fs.addToTree(p);
          fs.flushed.add(p);
        }
      } catch {
        // Goals table may not exist yet — start empty.
      }
    })() : Promise.resolve();

    const kpisBootstrap = fs.kpisTable ? (async () => {
      try {
        const kpiRows = await client.query(
          // One row per (goal_id, kpi_id) (UPDATE-or-INSERT model).
          `SELECT goal_id, kpi_id, content, created_at ` +
          `FROM "${fs.kpisTable}" ORDER BY created_at DESC`
        );
        for (const row of kpiRows) {
          const goal_id = String(row["goal_id"] ?? "");
          const kpi_id = String(row["kpi_id"] ?? "");
          if (!goal_id || !kpi_id) continue;
          const p = composeKpiPath({ goal_id, kpi_id });
          const content = String(row["content"] ?? "");
          fs.files.set(p, Buffer.from(content, "utf-8"));
          fs.meta.set(p, {
            size: Buffer.byteLength(content, "utf-8"),
            mime: "text/markdown",
            mtime: new Date(),
          });
          fs.addToTree(p);
          fs.flushed.add(p);
        }
      } catch {
        // KPIs table may not exist yet — start empty.
      }
    })() : Promise.resolve();

    await Promise.all([memoryBootstrap, sessionsBootstrap, goalsBootstrap, kpisBootstrap]);

    return fs;
  }

  // ── tree management ───────────────────────────────────────────────────────
  private addToTree(filePath: string): void {
    const segs = filePath.split("/").filter(Boolean);
    for (let d = 0; d < segs.length; d++) {
      const dir = d === 0 ? "/" : "/" + segs.slice(0, d).join("/");
      if (!this.dirs.has(dir)) this.dirs.set(dir, new Set());
      this.dirs.get(dir)!.add(segs[d]);
    }
  }

  private removeFromTree(filePath: string): void {
    this.files.delete(filePath);
    this.meta.delete(filePath);
    this.pending.delete(filePath);
    this.flushed.delete(filePath);
    const parent = parentOf(filePath);
    this.dirs.get(parent)?.delete(basename(filePath));
  }

  // ── flush / write batching ────────────────────────────────────────────────
  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flush().catch(() => {});
    }, FLUSH_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    this.flushChain = this.flushChain.then(() => this._doFlush());
    return this.flushChain;
  }

  private async _doFlush(): Promise<void> {
    if (this.pending.size === 0) return;
    if (this.flushTimer !== null) { clearTimeout(this.flushTimer); this.flushTimer = null; }

    const rows = [...this.pending.values()];
    this.pending.clear();

    const embeddings = await this.computeEmbeddings(rows);

    // Upsert in parallel — the semaphore in DeeplakeApi.query() handles concurrency.
    // Re-queue any rows that failed so they are retried on the next flush.
    const results = await Promise.allSettled(rows.map((r, i) => this.upsertRow(r, embeddings[i])));
    let failures = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "rejected") {
        // Re-queue for next flush — don't overwrite if the caller wrote a newer version
        if (!this.pending.has(rows[i].path)) {
          this.pending.set(rows[i].path, rows[i]);
        }
        failures++;
      }
    }
    if (failures > 0) {
      throw new Error(`flush: ${failures}/${rows.length} writes failed and were re-queued`);
    }
  }

  private async computeEmbeddings(rows: PendingRow[]): Promise<(number[] | null)[]> {
    if (rows.length === 0) return [];
    // Skip the daemon hop entirely when embeddings are globally disabled.
    // upsertRow writes NULL for embedding columns when the value is null,
    // so the INSERT / UPDATE shape stays identical.
    if (embeddingsDisabled()) return rows.map(() => null);
    if (!this.embedClient) {
      this.embedClient = new EmbedClient({ daemonEntry: resolveEmbedDaemonPath() });
    }
    // One request per row over the same daemon — daemon batches internally if
    // ONNX is configured to do so. We fire in parallel; the Unix socket + daemon
    // queue handles ordering. null entries are silently stored as empty.
    return Promise.all(rows.map(r => this.embedClient!.embed(r.contentText, "document")));
  }

  private async upsertRow(r: PendingRow, embedding: number[] | null): Promise<void> {
    // Path-routed structured tables: dispatch goal / kpi writes to
    // the dedicated table with INSERT-only version-bump semantics.
    // The generic memory path falls through to the existing UPDATE /
    // INSERT shape below. Failures here propagate up to the flush
    // chain which re-queues the row on the next tick.
    const kind: PathKind = classifyPath(r.path);
    if (kind === "goal" && this.goalsTable) {
      await this.upsertGoalRow(r);
      return;
    }
    if (kind === "kpi" && this.kpisTable) {
      await this.upsertKpiRow(r);
      return;
    }

    const text  = esc(r.contentText);
    const p     = esc(r.path);
    const fname = esc(r.filename);
    const mime  = esc(r.mimeType);
    const ts = new Date().toISOString();
    const cd = r.creationDate ?? ts;
    const lud = r.lastUpdateDate ?? ts;
    const embSql = embeddingSqlLiteral(embedding);
    if (this.flushed.has(r.path)) {
      let setClauses = `filename = '${fname}', summary = E'${text}', summary_embedding = ${embSql}, ` +
        `mime_type = '${mime}', size_bytes = ${r.sizeBytes}, last_update_date = '${esc(lud)}'`;
      if (r.project !== undefined) setClauses += `, project = '${esc(r.project)}'`;
      if (r.description !== undefined) setClauses += `, description = '${esc(r.description)}'`;
      await this.client.query(
        `UPDATE "${sqlIdent(this.table)}" SET ${setClauses} WHERE path = '${p}'`
      );
    } else {
      const id = randomUUID();
      const cols = "id, path, filename, summary, summary_embedding, mime_type, size_bytes, creation_date, last_update_date" +
        (r.project !== undefined ? ", project" : "") +
        (r.description !== undefined ? ", description" : "");
      const vals = `'${id}', '${p}', '${fname}', E'${text}', ${embSql}, '${mime}', ${r.sizeBytes}, '${esc(cd)}', '${esc(lud)}'` +
        (r.project !== undefined ? `, '${esc(r.project)}'` : "") +
        (r.description !== undefined ? `, '${esc(r.description)}'` : "");
      await this.client.query(
        `INSERT INTO "${sqlIdent(this.table)}" (${cols}) VALUES (${vals})`
      );
      this.flushed.add(r.path);
    }
  }

  /**
   * UPDATE-or-INSERT for a goal row, keyed by goal_id. One row per
   * goal forever — status changes, owner reassignments, and text
   * edits all mutate the same row in place. The version column
   * stays at 1 (vestigial in the schema; kept so the column is
   * already there if we ever bring back the audit-trail pattern).
   *
   * Trade-off versus the prior INSERT-only-version-bump design:
   *   - Pros: 1 row per goal makes the Deeplake table view obvious,
   *     no row proliferation, simpler bootstrap queries.
   *   - Cons: no audit trail; vulnerable to Deeplake's
   *     UPDATE-coalescing quirk if two writes hit the same row
   *     within microseconds. For the v1 single-user / small-team
   *     workflow the user explicitly chose this trade-off.
   */
  private async upsertGoalRow(r: PendingRow): Promise<void> {
    if (!this.goalsTable) throw new Error("goalsTable not configured");
    const parts = decomposeGoalPath(r.path);
    const safe = this.goalsTable;
    const now = new Date().toISOString();
    const createdAt = r.creationDate ?? now;
    const updatedAt = r.lastUpdateDate ?? createdAt;
    const existing = await this.client.query(
      `SELECT id FROM "${safe}" WHERE goal_id = '${esc(parts.goal_id)}' LIMIT 1`
    );
    if (existing.length > 0) {
      // Preserve created_at — a status transition or content edit must
      // not reset the goal's creation timestamp (it drives created_at
      // DESC ordering in the listing and bootstrap). Record the edit
      // time in updated_at instead.
      await this.client.query(
        `UPDATE "${safe}" SET ` +
        `owner = '${esc(parts.owner)}', ` +
        `status = '${esc(parts.status)}', ` +
        `content = E'${esc(r.contentText)}', ` +
        `updated_at = '${esc(updatedAt)}' ` +
        `WHERE goal_id = '${esc(parts.goal_id)}'`
      );
    } else {
      const id = randomUUID();
      await this.client.query(
        `INSERT INTO "${safe}" (id, goal_id, owner, status, content, version, created_at, updated_at, agent, plugin_version) VALUES (` +
        `'${id}', ` +
        `'${esc(parts.goal_id)}', ` +
        `'${esc(parts.owner)}', ` +
        `'${esc(parts.status)}', ` +
        `E'${esc(r.contentText)}', ` +
        `1, ` +
        `'${esc(createdAt)}', ` +
        `'${esc(updatedAt)}', ` +
        `'manual', ` +
        `''` +
        `)`
      );
    }
    this.flushed.add(r.path);
  }

  /**
   * UPDATE-or-INSERT for a KPI row, keyed by (goal_id, kpi_id).
   * Same trade-off as upsertGoalRow — one row per KPI forever,
   * no version proliferation. Progress bumps (Edit on the `current:`
   * line) and any other content edits mutate the same row in place.
   */
  private async upsertKpiRow(r: PendingRow): Promise<void> {
    if (!this.kpisTable) throw new Error("kpisTable not configured");
    const parts = decomposeKpiPath(r.path);
    const safe = this.kpisTable;
    const now = new Date().toISOString();
    const createdAt = r.creationDate ?? now;
    const updatedAt = r.lastUpdateDate ?? createdAt;
    const existing = await this.client.query(
      `SELECT id FROM "${safe}" ` +
      `WHERE goal_id = '${esc(parts.goal_id)}' AND kpi_id = '${esc(parts.kpi_id)}' LIMIT 1`
    );
    if (existing.length > 0) {
      // Preserve created_at — KPI progress edits keep their original
      // creation time so the KPI list stays in stable creation order
      // (created_at ASC). Edit time goes to updated_at.
      await this.client.query(
        `UPDATE "${safe}" SET ` +
        `content = E'${esc(r.contentText)}', ` +
        `updated_at = '${esc(updatedAt)}' ` +
        `WHERE goal_id = '${esc(parts.goal_id)}' AND kpi_id = '${esc(parts.kpi_id)}'`
      );
    } else {
      const id = randomUUID();
      await this.client.query(
        `INSERT INTO "${safe}" (id, goal_id, kpi_id, content, version, created_at, updated_at, agent, plugin_version) VALUES (` +
        `'${id}', ` +
        `'${esc(parts.goal_id)}', ` +
        `'${esc(parts.kpi_id)}', ` +
        `E'${esc(r.contentText)}', ` +
        `1, ` +
        `'${esc(createdAt)}', ` +
        `'${esc(updatedAt)}', ` +
        `'manual', ` +
        `''` +
        `)`
      );
    }
    this.flushed.add(r.path);
  }

  // ── Virtual index.md generation ────────────────────────────────────────────

  private async generateVirtualIndex(): Promise<string> {
    // Memory (summaries) section — high-level wikipage per session. Fetch
    // one extra row beyond the cap so the renderer can emit the "showing N
    // most-recent of many" notice.
    const fetchLimit = INDEX_LIMIT_PER_SECTION + 1;
    const summaryRows = await this.client.query(
      `SELECT path, project, description, creation_date, last_update_date FROM "${sqlIdent(this.table)}" ` +
      `WHERE path LIKE '${esc("/summaries/")}%' ORDER BY last_update_date DESC LIMIT ${fetchLimit}`
    );

    // Sessions section — raw session records (dialogue / events). Pulled
    // directly from the sessions table so the index is never empty just
    // because memory has no summaries yet. GROUP BY path collapses the
    // many-rows-per-conversation shape of the sessions table.
    let sessionRows: Record<string, unknown>[] = [];
    if (this.sessionsTable) {
      try {
        sessionRows = await this.client.query(
          `SELECT path, MAX(description) AS description, MIN(creation_date) AS creation_date, MAX(last_update_date) AS last_update_date ` +
          `FROM "${sqlIdent(this.sessionsTable)}" WHERE path LIKE '${esc("/sessions/")}%' ` +
          `GROUP BY path ORDER BY MAX(last_update_date) DESC LIMIT ${fetchLimit}`
        );
      } catch {
        // sessions table absent or schema mismatch — leave empty, emit memory-only index.
        sessionRows = [];
      }
    }

    const summaryTruncated = summaryRows.length > INDEX_LIMIT_PER_SECTION;
    const sessionTruncated = sessionRows.length > INDEX_LIMIT_PER_SECTION;
    return buildVirtualIndexContent(
      summaryRows.slice(0, INDEX_LIMIT_PER_SECTION),
      sessionRows.slice(0, INDEX_LIMIT_PER_SECTION),
      { summaryTruncated, sessionTruncated },
    );
  }

  // ── batch prefetch ────────────────────────────────────────────────────────

  /**
   * Prefetch multiple files into the content cache with a single SQL query.
   * Skips paths that are already cached, pending, or session-backed.
   * After this call, subsequent readFile() calls for these paths hit cache.
   */
  async prefetch(paths: string[]): Promise<void> {
    const uncached: string[] = [];
    const uncachedSessions: string[] = [];
    for (const raw of paths) {
      const p = normPath(raw);
      if (this.files.get(p) !== null && this.files.get(p) !== undefined) continue;
      if (this.pending.has(p)) continue;
      if (!this.files.has(p)) continue; // unknown path
      if (this.sessionPaths.has(p)) {
        uncachedSessions.push(p);
      } else {
        uncached.push(p);
      }
    }

    for (let i = 0; i < uncached.length; i += PREFETCH_BATCH_SIZE) {
      const chunk = uncached.slice(i, i + PREFETCH_BATCH_SIZE);
      const inList = chunk.map(p => `'${esc(p)}'`).join(", ");
      const rows = await this.client.query(
        `SELECT path, summary FROM "${this.table}" WHERE path IN (${inList})`
      );
      for (const row of rows) {
        const p = row["path"] as string;
        const text = (row["summary"] as string) ?? "";
        this.files.set(p, Buffer.from(text, "utf-8"));
      }
    }

    if (!this.sessionsTable) return;

    for (let i = 0; i < uncachedSessions.length; i += PREFETCH_BATCH_SIZE) {
      const chunk = uncachedSessions.slice(i, i + PREFETCH_BATCH_SIZE);
      const inList = chunk.map(p => `'${esc(p)}'`).join(", ");
      const rows = await this.client.query(
        `SELECT path, message, creation_date FROM "${this.sessionsTable}" WHERE path IN (${inList}) ORDER BY path, creation_date ASC`
      );
      const grouped = new Map<string, string[]>();
      for (const row of rows) {
        const p = row["path"] as string;
        const current = grouped.get(p) ?? [];
        current.push(normalizeSessionMessage(p, row["message"]));
        grouped.set(p, current);
      }
      for (const [p, parts] of grouped) {
        this.files.set(p, Buffer.from(parts.join("\n"), "utf-8"));
      }
    }
  }

  // ── IFileSystem: reads ────────────────────────────────────────────────────

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const p = normPath(path);
    if (this.dirs.has(p) && !this.files.has(p)) throw fsErr("EISDIR", "illegal operation on a directory", p);
    if (!this.files.has(p)) throw fsErr("ENOENT", "no such file or directory", p);

    // 1. Content cache
    const cached = this.files.get(p);
    if (cached !== null && cached !== undefined) return cached;

    // 2. Pending batch (written but not yet flushed)
    const pend = this.pending.get(p);
    if (pend) { const buf = Buffer.from(pend.contentText, "utf-8"); this.files.set(p, buf); return buf; }

    // 3. Session files: concatenate rows from sessions table
    if (this.sessionPaths.has(p) && this.sessionsTable) {
      const rows = await this.client.query(
        `SELECT message FROM "${this.sessionsTable}" WHERE path = '${esc(p)}' ORDER BY creation_date ASC`
      );
      if (rows.length === 0) throw fsErr("ENOENT", "no such file or directory", p);
      const text = joinSessionMessages(p, rows.map((row) => row["message"]));
      const buf = Buffer.from(text, "utf-8");
      this.files.set(p, buf);
      return buf;
    }

    // 4. SQL query — summary column (text content)
    const rows = await this.client.query(
      `SELECT summary FROM "${this.table}" WHERE path = '${esc(p)}' LIMIT 1`
    );
    if (rows.length === 0) throw fsErr("ENOENT", "no such file or directory", p);
    const buf = Buffer.from((rows[0]["summary"] as string) ?? "", "utf-8");
    this.files.set(p, buf);
    return buf;
  }

  async readFile(path: string, _opts?: ReadFileOptions | BufferEncoding): Promise<string> {
    const p = normPath(path);
    // Graph VFS bridge — delegate to the shared dispatcher BEFORE the
    // dirs/files cache check, otherwise /graph/index.md would race with a
    // hypothetical real "graph" dir entry.
    if (isGraphPath(p)) {
      if (isGraphDir(p)) throw fsErr("EISDIR", "illegal operation on a directory", p);
      return readGraphFile(p, process.cwd());
    }
    if (this.dirs.has(p) && !this.files.has(p)) throw fsErr("EISDIR", "illegal operation on a directory", p);

    // Virtual index.md: if no real row exists, generate from summary rows
    if (p === "/index.md" && !this.files.has(p)) {
      // Check if a real /index.md row exists in the table
      const realRows = await this.client.query(
        `SELECT summary FROM "${this.table}" WHERE path = '${esc("/index.md")}' LIMIT 1`
      );
      if (realRows.length > 0 && realRows[0]["summary"]) {
        const text = realRows[0]["summary"] as string;
        const buf = Buffer.from(text, "utf-8");
        this.files.set(p, buf);
        return text;
      }
      // No real row — generate virtual index
      return this.generateVirtualIndex();
    }

    if (!this.files.has(p)) throw fsErr("ENOENT", "no such file or directory", p);

    // Content cache (populated by prefetch or prior reads)
    const cached = this.files.get(p);
    if (cached !== null && cached !== undefined) return cached.toString("utf-8");

    // Pending batch
    const pend = this.pending.get(p);
    if (pend) return pend.contentText;

    // Session files: concatenate rows from sessions table, ordered by creation_date
    if (this.sessionPaths.has(p) && this.sessionsTable) {
      const rows = await this.client.query(
        `SELECT message FROM "${this.sessionsTable}" WHERE path = '${esc(p)}' ORDER BY creation_date ASC`
      );
      if (rows.length === 0) throw fsErr("ENOENT", "no such file or directory", p);
      const text = joinSessionMessages(p, rows.map((row) => row["message"]));
      const buf = Buffer.from(text, "utf-8");
      this.files.set(p, buf);
      return text;
    }

    const rows = await this.client.query(
      `SELECT summary FROM "${this.table}" WHERE path = '${esc(p)}' LIMIT 1`
    );
    if (rows.length === 0) throw fsErr("ENOENT", "no such file or directory", p);
    const text = (rows[0]["summary"] as string) ?? "";
    const buf = Buffer.from(text, "utf-8");
    this.files.set(p, buf);
    return text;
  }

  // ── IFileSystem: writes ───────────────────────────────────────────────────

  /** Write a file with optional row-level metadata (project, description, dates). */
  async writeFileWithMeta(
    path: string, content: FileContent,
    meta: { project?: string; description?: string; creationDate?: string; lastUpdateDate?: string },
  ): Promise<void> {
    const p = normPath(path);
    if (this.sessionPaths.has(p)) throw fsErr("EPERM", "session files are read-only", p);
    if (this.dirs.has(p) && !this.files.has(p)) throw fsErr("EISDIR", "illegal operation on a directory", p);

    const text = typeof content === "string" ? content : Buffer.from(content).toString("utf-8");
    const buf = Buffer.from(text, "utf-8");
    const mime = guessMime(basename(p));

    this.files.set(p, buf);
    this.meta.set(p, { size: buf.length, mime, mtime: new Date() });
    this.addToTree(p);

    this.pending.set(p, {
      path: p, filename: basename(p),
      contentText: text, mimeType: mime, sizeBytes: buf.length,
      ...meta,
    });

    if (this.pending.size >= BATCH_SIZE) await this.flush();
    else this.scheduleFlush();
  }

  async writeFile(path: string, content: FileContent, _opts?: WriteFileOptions | BufferEncoding): Promise<void> {
    const p = normPath(path);
    if (this.sessionPaths.has(p)) throw fsErr("EPERM", "session files are read-only", p);
    if (this.dirs.has(p) && !this.files.has(p)) throw fsErr("EISDIR", "illegal operation on a directory", p);

    const text = typeof content === "string" ? content : Buffer.from(content).toString("utf-8");
    const buf = Buffer.from(text, "utf-8");
    const mime = guessMime(basename(p));

    this.files.set(p, buf);
    this.meta.set(p, { size: buf.length, mime, mtime: new Date() });
    this.addToTree(p);

    this.pending.set(p, {
      path: p, filename: basename(p),
      contentText: text, mimeType: mime, sizeBytes: buf.length,
    });

    if (this.pending.size >= BATCH_SIZE) await this.flush();
    else this.scheduleFlush();
  }

  async appendFile(path: string, content: FileContent, opts?: WriteFileOptions | BufferEncoding): Promise<void> {
    const p = normPath(path);
    const add = typeof content === "string" ? content : Buffer.from(content).toString("utf-8");

    // Session files are read-only (multi-row in sessions table, not memory table)
    if (this.sessionPaths.has(p)) throw fsErr("EPERM", "session files are read-only", p);

    // A buffered (unflushed) prior write must land in the DB before the
    // SQL-level concat below. The UPDATE appends onto the persisted row, so
    // if the prior write is still pending the row does not exist yet, the
    // UPDATE matches zero rows, and the appended content is silently dropped
    // (the common `echo a > f && echo b >> f` idiom would lose "b"). Flushing
    // the pending write first guarantees the concat lands on a real row.
    if (this.pending.has(p)) await this.flush();

    // Fast path: SQL-level concat — no read-back, O(1) per append
    if (this.files.has(p) || await this.exists(p).catch(() => false)) {
      const ts = new Date().toISOString();
      await this.client.query(
        `UPDATE "${this.table}" SET ` +
        `summary = summary || E'${esc(add)}', ` +
        `size_bytes = size_bytes + ${Buffer.byteLength(add, "utf-8")}, ` +
        `last_update_date = '${ts}' ` +
        `WHERE path = '${esc(p)}'`
      );
      // Invalidate content cache so next read fetches fresh data from SQL
      this.files.set(p, null);
      const m = this.meta.get(p);
      if (m) { m.size += Buffer.byteLength(add, "utf-8"); m.mtime = new Date(ts); }
    } else {
      // File doesn't exist yet — create it
      await this.writeFile(p, content, opts);
      await this.flush();
    }
  }

  // ── IFileSystem: metadata ─────────────────────────────────────────────────

  async exists(path: string): Promise<boolean> {
    const p = normPath(path);
    if (p === "/index.md") return true; // Virtual index always exists
    if (isGraphPath(p)) {
      // CodeRabbit P1: the old "everything under /graph/ exists" was too
      // broad. A bogus path like /graph/find/<no-such-pattern> would
      // exists-true and confuse callers (e.g. shell write/append flows
      // that check exists() before touching the path). Tighten:
      //   - /graph, /graph/find, /graph/show are always-true dirs
      //   - /graph/<endpoint>/<arg> only exists when the dispatcher
      //     returns a non-not-found result (ok OR no-graph — both render
      //     conceptual file content, just one happens to be a stub
      //     message; the path is addressable either way).
      if (isGraphDir(p)) return true;
      const r = handleGraphVfs(graphSubpathOf(p), process.cwd());
      return r.kind === "ok" || r.kind === "no-graph";
    }
    return this.files.has(p) || this.dirs.has(p);
  }

  async stat(path: string): Promise<FsStat> {
    const p = normPath(path);
    // Graph VFS — synthesize stat without parsing the snapshot. Anything
    // matching /graph(/find|/show)? is a directory; anything else under
    // /graph/ is a file (synthesized at readFile time).
    if (isGraphPath(p)) {
      // CodeRabbit P1: align stat() with the tightened exists() — non-dir
      // /graph paths must reject when the dispatcher says not-found.
      // Otherwise tools that stat-before-read get inconsistent answers
      // (exists=false but stat=true) and break the standard FS contract.
      if (!isGraphDir(p)) {
        const r = handleGraphVfs(graphSubpathOf(p), process.cwd());
        if (r.kind === "not-found") throw fsErr("ENOENT", "no such file or directory", p);
      }
      const dir = isGraphDir(p);
      return {
        isFile: !dir, isDirectory: dir, isSymbolicLink: false,
        mode: dir ? 0o755 : 0o644,
        size: 0, // synthesized; cheaper than computing the body just to size it
        mtime: new Date(),
      };
    }
    const isFile = this.files.has(p);
    const isDir  = this.dirs.has(p);
    // Virtual index.md: always exists as a file
    if (p === "/index.md" && !isFile && !isDir) {
      return {
        isFile: true, isDirectory: false, isSymbolicLink: false,
        mode: 0o644, size: 0, mtime: new Date(),
      };
    }
    if (!isFile && !isDir) throw fsErr("ENOENT", "no such file or directory", p);
    const m = this.meta.get(p);
    return {
      isFile: isFile && !isDir,
      isDirectory: isDir,
      isSymbolicLink: false,
      mode: isDir ? 0o755 : 0o644,
      size: m?.size ?? 0,
      mtime: m?.mtime ?? new Date(),
    };
  }

  async lstat(path: string): Promise<FsStat> { return this.stat(path); }

  async chmod(_path: string, _mode: number): Promise<void> {}
  async utimes(_path: string, _atime: Date, _mtime: Date): Promise<void> {}
  async symlink(_target: string, linkPath: string): Promise<void> { throw fsErr("EPERM", "operation not permitted", linkPath); }
  async link(_src: string, destPath: string): Promise<void> { throw fsErr("EPERM", "operation not permitted", destPath); }
  async readlink(path: string): Promise<string> { throw fsErr("EINVAL", "invalid argument", path); }
  async realpath(path: string): Promise<string> {
    const p = normPath(path);
    if (p === "/index.md") return p; // Virtual index always exists
    if (isGraphPath(p)) {
      // Same alignment as stat(): unknown leaf path → ENOENT.
      if (isGraphDir(p)) return p;
      const r = handleGraphVfs(graphSubpathOf(p), process.cwd());
      if (r.kind === "ok" || r.kind === "no-graph") return p;
      throw fsErr("ENOENT", "no such file or directory", p);
    }
    if (!this.files.has(p) && !this.dirs.has(p)) throw fsErr("ENOENT", "no such file or directory", p);
    return p;
  }

  // ── IFileSystem: directories ──────────────────────────────────────────────

  async mkdir(path: string, opts?: MkdirOptions): Promise<void> {
    const p = normPath(path);
    if (this.files.has(p)) throw fsErr("EEXIST", "file exists", p);
    if (this.dirs.has(p)) {
      if (!opts?.recursive) throw fsErr("EEXIST", "file exists", p);
      return;
    }
    if (!opts?.recursive) {
      const parent = parentOf(p);
      if (!this.dirs.has(parent)) throw fsErr("ENOENT", "no such file or directory", parent);
    }
    this.dirs.set(p, new Set());
    const parent = parentOf(p);
    if (!this.dirs.has(parent)) this.dirs.set(parent, new Set());
    this.dirs.get(parent)!.add(basename(p));
  }

  async readdir(path: string): Promise<string[]> {
    const p = normPath(path);
    // Graph VFS — directory listings synthesized from a fixed taxonomy.
    if (p === GRAPH_ROOT) return ["index.md", "find", "show"];
    if (p === "/graph/find" || p === "/graph/show") {
      // No children to enumerate: arguments are user-supplied patterns, not
      // a finite set we could list. Return empty so `ls` shows nothing
      // (rather than throwing — the dir conceptually exists, it's just
      // dispatched-on-demand).
      return [];
    }
    if (!this.dirs.has(p)) throw fsErr("ENOTDIR", "not a directory", p);
    const entries = [...(this.dirs.get(p) ?? [])];
    // Virtual index.md: always show in root listing even if no real row exists
    if (p === "/" && !entries.includes("index.md")) {
      entries.push("index.md");
    }
    // Surface the graph subtree in the root listing.
    if (p === "/" && !entries.includes("graph")) {
      entries.push("graph");
    }
    return entries;
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    const names = await this.readdir(path);
    const p = normPath(path);
    return names.map(name => {
      const child = p === "/" ? `/${name}` : `${p}/${name}`;
      // CodeRabbit P1: graph entries aren't in this.files/this.dirs (they're
      // synthesized). Classify them by the same isGraphDir taxonomy used by
      // exists()/stat() so tools that consume DirentEntry get accurate types
      // (e.g. `ls -F` shows trailing slash on /graph and /graph/find).
      if (isGraphPath(child)) {
        return {
          name,
          isFile: !isGraphDir(child),
          isDirectory: isGraphDir(child),
          isSymbolicLink: false,
        };
      }
      return {
        name,
        isFile: (this.files.has(child) || child === "/index.md") && !this.dirs.has(child),
        isDirectory: this.dirs.has(child),
        isSymbolicLink: false,
      };
    });
  }

  // ── IFileSystem: structural mutations ─────────────────────────────────────

  async rm(path: string, opts?: RmOptions): Promise<void> {
    const p = normPath(path);
    if (this.sessionPaths.has(p)) throw fsErr("EPERM", "session files are read-only", p);
    if (!this.files.has(p) && !this.dirs.has(p)) {
      if (opts?.force) return;
      throw fsErr("ENOENT", "no such file or directory", p);
    }

    // Path-routed soft-close: `rm` on a goal path does NOT delete the
    // row. It writes a new v=N+1 with status='closed' (soft-close,
    // preserves audit trail). The agent expects the file to be gone
    // from the opened/in_progress folder; we move the cache entry
    // to the canonical closed/<goal_id>.md path so subsequent ls of
    // the source folder reflects the absence, while cat on the new
    // closed path returns the same content.
    if (this.goalsTable && classifyPath(p) === "goal") {
      const parts = decomposeGoalPath(p);
      if (parts.status === "closed") {
        // Already closed — codex's "rm-on-closed" edge case. Treat as
        // a true hard-delete request? For v1 we make it a no-op so
        // the audit trail is fully preserved and the agent can not
        // accidentally wipe history.
        this.removeFromTree(p);
        return;
      }
      const closedPath = composeGoalPath({ ...parts, status: "closed" });
      const contentBuf = this.files.get(p);
      const content = contentBuf instanceof Buffer ? contentBuf.toString("utf-8") : "";
      await this.upsertGoalRow({
        path: closedPath,
        filename: basename(closedPath),
        contentText: content,
        mimeType: "text/markdown",
        sizeBytes: Buffer.byteLength(content, "utf-8"),
        creationDate: undefined,
        lastUpdateDate: new Date().toISOString(),
      });
      // Move the cache entry from opened/ to closed/.
      this.files.set(closedPath, contentBuf ?? null);
      this.meta.set(closedPath, this.meta.get(p) ?? { size: 0, mime: "text/markdown", mtime: new Date() });
      this.addToTree(closedPath);
      this.flushed.add(closedPath);
      this.removeFromTree(p);
      return;
    }

    if (this.dirs.has(p)) {
      const children = this.dirs.get(p) ?? new Set();
      if (children.size > 0 && !opts?.recursive) throw fsErr("ENOTEMPTY", "directory not empty", p);

      // Collect all descendant files before mutating state
      const toDelete: string[] = [];
      const stack = [p];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of [...(this.dirs.get(cur) ?? [])]) {
          const childPath = cur === "/" ? `/${child}` : `${cur}/${child}`;
          if (this.files.has(childPath)) toDelete.push(childPath);
          if (this.dirs.has(childPath))  stack.push(childPath);
        }
      }
      // Filter out session paths — they are read-only
      const safeToDelete = toDelete.filter(fp => !this.sessionPaths.has(fp));
      for (const fp of safeToDelete) this.removeFromTree(fp);
      this.dirs.delete(p);
      this.dirs.get(parentOf(p))?.delete(basename(p));

      if (safeToDelete.length > 0) {
        const inList = safeToDelete.map(fp => `'${esc(fp)}'`).join(", ");
        await this.client.query(`DELETE FROM "${this.table}" WHERE path IN (${inList})`);
      }
    } else {
      await this.client.query(`DELETE FROM "${this.table}" WHERE path = '${esc(p)}'`);
      this.removeFromTree(p);
    }
  }

  async cp(src: string, dest: string, opts?: CpOptions): Promise<void> {
    const s = normPath(src), d = normPath(dest);
    if (this.sessionPaths.has(d)) throw fsErr("EPERM", "session files are read-only", d);
    if (this.dirs.has(s) && !this.files.has(s)) {
      if (!opts?.recursive) throw fsErr("EISDIR", "is a directory", s);
      for (const fp of [...this.files.keys()].filter(k => k === s || k.startsWith(s + "/"))) {
        await this.writeFile(d + fp.slice(s.length), await this.readFileBuffer(fp));
      }
    } else {
      await this.writeFile(d, await this.readFileBuffer(s));
    }
  }

  async mv(src: string, dest: string): Promise<void> {
    const s = normPath(src), d = normPath(dest);
    if (this.sessionPaths.has(s)) throw fsErr("EPERM", "session files are read-only", s);
    if (this.sessionPaths.has(d)) throw fsErr("EPERM", "session files are read-only", d);

    // Goal status transition: single INSERT v=N+1 with the new
    // status, no cp+rm dance (which would otherwise double-write to
    // the goals table). Also enforces the goal_id invariant: a goal
    // path mv cannot rename the UUID, only the status component.
    if (this.goalsTable && classifyPath(s) === "goal" && classifyPath(d) === "goal") {
      const from = decomposeGoalPath(s);
      const to = decomposeGoalPath(d);
      if (from.goal_id !== to.goal_id || from.owner !== to.owner) {
        throw fsErr("EPERM", "cannot rename goal_id or owner via mv (only status)", d);
      }
      if (!this.files.has(s)) throw fsErr("ENOENT", "no such file or directory", s);
      const contentBuf = this.files.get(s);
      const content = contentBuf instanceof Buffer ? contentBuf.toString("utf-8") : "";
      await this.upsertGoalRow({
        path: d,
        filename: basename(d),
        contentText: content,
        mimeType: "text/markdown",
        sizeBytes: Buffer.byteLength(content, "utf-8"),
        creationDate: undefined,
        lastUpdateDate: new Date().toISOString(),
      });
      this.files.set(d, contentBuf ?? null);
      this.meta.set(d, this.meta.get(s) ?? { size: 0, mime: "text/markdown", mtime: new Date() });
      this.addToTree(d);
      this.flushed.add(d);
      this.removeFromTree(s);
      return;
    }

    await this.cp(src, dest, { recursive: true });
    await this.rm(src, { recursive: true, force: true });
  }

  resolvePath(base: string, path: string): string {
    if (path.startsWith("/")) return normPath(path);
    return normPath(posix.join(base, path));
  }

  getAllPaths(): string[] {
    return [...new Set([...this.files.keys(), ...this.dirs.keys()])];
  }
}
