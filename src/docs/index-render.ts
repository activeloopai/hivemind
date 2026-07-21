/**
 * Pure renderer for the per-directory docs index (browsable like the memory
 * `index.md`, but a SEPARATE surface under the code side, not mixed into the
 * session-memory index — see the design note in src/commands/docs.ts).
 *
 * The index is a filesystem-shaped drill-down so it stays small on a large
 * repo: at any directory you see (a) the immediate SUB-directories that hold
 * docs, with aggregate counts, and (b) the docs for files directly in this
 * directory. You never render one flat list of every file.
 *
 * Levels 0/N-with-subdirs need only METADATA (doc_id, version, updated_at) —
 * no content is pulled. The optional `summaries` map is filled only for the
 * files directly in the viewed directory (a bounded, cheap content fetch), so
 * the "1 line per file" description never costs a full-table content read.
 *
 * Pure and synchronous: all I/O (the metadata query, the summary fetch) is the
 * caller's job, which keeps this exhaustively unit-testable.
 */

/** Light per-doc metadata — everything the index needs except content. */
export interface DocMeta {
  /** Documented source file path, e.g. `src/graph/diff.ts`. The stable key. */
  doc_id: string;
  version: number;
  updated_at: string;
  status: string;
  tier: string;
}

/** The directory portion of a `doc_id` ("" for a top-level file). */
export function dirOf(docId: string): string {
  const i = docId.lastIndexOf("/");
  return i < 0 ? "" : docId.slice(0, i);
}

/** The immediate child of `atDir` on the path to `docId`, or null. */
function childUnder(atDir: string, docId: string): { kind: "dir" | "file"; name: string } | null {
  const prefix = atDir === "" ? "" : atDir + "/";
  if (!docId.startsWith(prefix)) return null;
  const rest = docId.slice(prefix.length);
  if (rest === "" || rest.startsWith("/")) return null;
  const slash = rest.indexOf("/");
  if (slash < 0) return { kind: "file", name: rest }; // a file directly in atDir
  return { kind: "dir", name: rest.slice(0, slash) };  // an immediate subdirectory
}

/** First meaningful line of a doc body, for the per-file summary column. */
export function firstDocLine(content: string, max = 90): string {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line === "---") continue;
    return line.length > max ? line.slice(0, max - 1).trimEnd() + "…" : line;
  }
  return "";
}

function dateOnly(ts: string): string {
  return ts.slice(0, 10);
}

interface DirAgg {
  count: number;
  latest: string;
}

/**
 * Render the index for directory `atDir` ("" = root) from the full metadata
 * list. `summaries` (doc_id → one-liner) is optional and used only for the
 * files shown at this level.
 */
export function buildDocsIndex(
  meta: DocMeta[],
  atDir = "",
  summaries: Map<string, string> = new Map(),
): string {
  const active = meta.filter((m) => m.status === "active");

  const subdirs = new Map<string, DirAgg>();
  const files: DocMeta[] = [];
  for (const m of active) {
    const child = childUnder(atDir, m.doc_id);
    if (!child) continue;
    if (child.kind === "file") {
      files.push(m);
    } else {
      const agg = subdirs.get(child.name);
      if (agg) {
        agg.count++;
        if (m.updated_at > agg.latest) agg.latest = m.updated_at;
      } else {
        subdirs.set(child.name, { count: 1, latest: m.updated_at });
      }
    }
  }

  const title = atDir === "" ? "# Docs Index" : `# Docs: ${atDir}/`;
  const lines: string[] = [
    title,
    "",
    "Per-file documentation, kept fresh on code changes. Drill into a directory,",
    "or open a file's doc directly. Metadata only — open a leaf for the content.",
    "",
  ];

  if (subdirs.size > 0) {
    lines.push("## Directories", "");
    lines.push("| Directory | Docs | Last updated |");
    lines.push("|-----------|------|--------------|");
    for (const name of [...subdirs.keys()].sort()) {
      const agg = subdirs.get(name)!;
      const rel = `${name}/index.md`;
      lines.push(`| [${name}/](${rel}) | ${agg.count} | ${dateOnly(agg.latest)} |`);
    }
    lines.push("");
  }

  if (files.length > 0) {
    lines.push("## Files", "");
    const hasSummary = files.some((f) => (summaries.get(f.doc_id) ?? "") !== "");
    if (hasSummary) {
      lines.push("| File | Version | Updated | Summary |");
      lines.push("|------|---------|---------|---------|");
    } else {
      lines.push("| File | Version | Updated |");
      lines.push("|------|---------|---------|");
    }
    for (const f of files.sort((a, b) => a.doc_id.localeCompare(b.doc_id))) {
      const base = f.doc_id.slice(f.doc_id.lastIndexOf("/") + 1);
      const rel = `${base}.md`;
      const ver = `v${f.version}`;
      if (hasSummary) {
        lines.push(`| [${base}](${rel}) | ${ver} | ${dateOnly(f.updated_at)} | ${summaries.get(f.doc_id) ?? ""} |`);
      } else {
        lines.push(`| [${base}](${rel}) | ${ver} | ${dateOnly(f.updated_at)} |`);
      }
    }
    lines.push("");
  }

  if (subdirs.size === 0 && files.length === 0) {
    lines.push(atDir === "" ? "_(no docs yet — run `hivemind docs generate`)_" : `_(no docs under ${atDir}/)_`);
    lines.push("");
  }

  const totalActive = active.length;
  const archived = meta.length - totalActive;
  lines.push("---", `${totalActive} active doc(s)${archived > 0 ? `, ${archived} archived` : ""}.`);
  return lines.join("\n");
}
