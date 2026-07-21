/**
 * Local private doc store — the on-disk home for docs generated from a branch's
 * COMMITTED-but-UNPUSHED code. Such a doc describes code teammates don't have
 * yet, so it must never reach the shared cloud table (the publish gate holds
 * it). Instead it lives here, readable only by this machine's owner, until the
 * source is pushed and the next refresh promotes it to the cloud branch overlay.
 *
 * Layout: one JSON file per (project, scope) under
 *   ~/.hivemind/docs-private/<project>__<scopeSlug>.json
 * holding a map `{ [doc_id]: PrivateDoc }`. A whole-file read/write keeps it
 * trivially consistent at the per-branch scale (dozens of pages).
 *
 * Each entry carries the `source_fp` it was generated from, so the reader can
 * apply the same freshness verdict as cloud docs (stale banner) and drop an
 * entry once it no longer matches HEAD.
 */

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export interface PrivateDoc {
  doc_id: string;
  path: string;
  content: string;
  /** Serialized fingerprint (`{file: blob-sha}`) the doc was generated from. */
  source_fp: string;
  tier: "fast" | "slow";
  updated_at: string;
}

/** Root dir for the private store (overridable for tests). */
export function privateStoreRoot(): string {
  // `||` (not `??`): an empty override must fall through to the default, not
  // resolve the store to a relative path under cwd.
  return process.env.HIVEMIND_DOCS_PRIVATE_DIR || join(homedir(), ".hivemind", "docs-private");
}

/**
 * The store file for (project, scope). The name is an INJECTIVE hash of the
 * pair (with a null separator) so distinct branches/projects never collide onto
 * one file — a plain char-substitution slug is not injective (`b:feat/x` and
 * `b:feat_x` would both become `b_feat_x`), which would cross-contaminate one
 * branch's private docs with another's.
 */
function storeFile(project: string, scope: string): string {
  // Full 256-bit digest of (project, scope) with a NUL separator that can
  // never appear in either — collision-free in practice, and not a lossy slug.
  const key = createHash("sha256").update(`${project}\u0000${scope}`).digest("hex");
  return join(privateStoreRoot(), `${key}.json`);
}

function readMap(file: string): Record<string, PrivateDoc> {
  try {
    if (!existsSync(file)) return {};
    const raw = JSON.parse(readFileSync(file, "utf-8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, PrivateDoc>;
  } catch {
    return {}; // corrupt file → empty, never throw on the read path
  }
}

function writeMap(file: string, map: Record<string, PrivateDoc>): void {
  mkdirSync(dirname(file), { recursive: true });
  // Per-process tmp name so concurrent writers don't clobber a shared `.tmp`
  // before rename. (Same-(project,scope) refreshes are already serialized by
  // the refresh lease; this guards cross-process / cross-scope overlap.)
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(map, null, 1) + "\n");
  renameSync(tmp, file); // atomic replace
}

/** The private doc for (project, scope, doc_id), or null. */
export function readPrivateDoc(project: string, scope: string, docId: string): PrivateDoc | null {
  return readMap(storeFile(project, scope))[docId] ?? null;
}

/** All private docs for (project, scope). */
export function listPrivateDocs(project: string, scope: string): PrivateDoc[] {
  return Object.values(readMap(storeFile(project, scope)));
}

/** Upsert a private doc for (project, scope). */
export function writePrivateDoc(project: string, scope: string, doc: PrivateDoc): void {
  const file = storeFile(project, scope);
  const map = readMap(file);
  map[doc.doc_id] = doc;
  writeMap(file, map);
}

/** Remove a private doc (e.g. after it's promoted to the cloud on push). */
export function deletePrivateDoc(project: string, scope: string, docId: string): void {
  const file = storeFile(project, scope);
  const map = readMap(file);
  if (docId in map) {
    delete map[docId];
    writeMap(file, map);
  }
}
