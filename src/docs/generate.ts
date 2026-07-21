/**
 * Doc generation — author docs for a real codebase, selectively.
 *
 * Walks the AST graph (which already excludes .gitignored files, node_modules,
 * env files, etc. — see graph/ignore-config.ts), so non-code junk is filtered
 * for free. On top of that we apply doc-specific include/exclude globs and a
 * sensible default exclude list (tests, type decls, config, barrels) so we
 * don't document files nobody needs.
 *
 * Two scopes:
 *   - `file`   (default): ONE doc per source file, anchored to all of its
 *     documentable symbols (a small "component" doc — fewer docs, higher value).
 *   - `symbol`: one doc per function/class/method.
 *
 * Idempotent: a target that already has a doc is skipped unless `force`. The
 * orchestrator is pure except for the injected `generate` (LLM) and `query`.
 */

import { buildAnchor, readSymbolSource } from "./anchors.js";
import { runPool } from "./pool.js";
import { upsertDoc } from "./write.js";
import type { DocEmbedder } from "./embed.js";
import type { DocAnchor, QueryFn } from "./read.js";
import type { GraphNode, GraphSnapshot } from "../graph/types.js";

/** Kinds worth a doc. const/module/variable are skipped as low-signal noise. */
const DOCUMENTABLE_KINDS = new Set(["function", "class", "method", "interface", "type_alias", "enum"]);

/** Doc-specific default excludes (on top of the graph's gitignore filtering). */
export const DEFAULT_EXCLUDE_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*.d.ts",
  "**/*.config.*",
  "**/index.ts",
  "**/index.js",
];

export type GenScope = "file" | "symbol";

export interface GenTarget {
  /** Stable doc_id: the source file path (file scope) or the symbol id (symbol scope). */
  doc_id: string;
  /** Source file path. */
  file: string;
  /** Documentable symbols to anchor + describe. */
  symbols: GraphNode[];
}

export interface GenDocInput {
  doc_id: string;
  file: string;
  symbols: Array<{ id: string; signature?: string; source: string }>;
}
export type GenerateDocFn = (input: GenDocInput) => Promise<string>;

/**
 * Batched generator: document K files in ONE host-LLM call and return a
 * doc_id → markdown map. The per-file `claude -p` boot (~15s) dominates a single
 * doc; batching amortizes it across K files (~3.7x faster measured). Anchors are
 * still computed per file from the graph — only the prose is batched. Any file
 * the model omits is simply absent from the map, so the caller falls back to a
 * single-file call for it.
 */
export type BatchGenerateFn = (inputs: GenDocInput[]) => Promise<Map<string, string>>;

/** Machine marker the model emits before each file's doc (robust to split). */
const BATCH_MARKER_RE = /<<<DOC file=(.+?)>>>[ \t]*\n?/;

/** Convert a glob (`*`, `**`, `?`) to an anchored RegExp over forward-slash paths. */
export function globToRegExp(glob: string): RegExp {
  // CodeQL: the glob comes from CLI argv. Every regex metacharacter below is
  // escaped, so injection is not possible — but an adversarial multi-kilobyte
  // pattern could still be pathological to compile. Cap the length.
  if (glob.length > 512) throw new Error(`glob pattern too long (${glob.length} > 512 chars)`);
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // ** → any (including /)
        i++;
        if (glob[i + 1] === "/") i++; // swallow the slash after **
      } else {
        re += "[^/]*"; // * → any except /
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}

/**
 * Pick the targets to document from the snapshot, applying scope + include/exclude.
 * `exclude` is ADDITIVE to DEFAULT_EXCLUDE_GLOBS; `include` (if given) keeps only
 * matching files.
 */
export function selectTargets(
  snap: GraphSnapshot,
  opts: { scope?: GenScope; include?: string[]; exclude?: string[] } = {},
): GenTarget[] {
  const scope = opts.scope ?? "file";
  const excludes = [...DEFAULT_EXCLUDE_GLOBS, ...(opts.exclude ?? [])];
  const includes = opts.include ?? [];

  const docNodes = snap.nodes.filter((n) => DOCUMENTABLE_KINDS.has(n.kind));
  const keep = (file: string): boolean => {
    if (includes.length > 0 && !matchesAny(file, includes)) return false;
    if (matchesAny(file, excludes)) return false;
    return true;
  };

  if (scope === "symbol") {
    return docNodes
      .filter((n) => keep(n.source_file))
      .map((n) => ({ doc_id: n.id, file: n.source_file, symbols: [n] }));
  }

  // file scope: group documentable symbols by source_file.
  const byFile = new Map<string, GraphNode[]>();
  for (const n of docNodes) {
    if (!keep(n.source_file)) continue;
    const list = byFile.get(n.source_file);
    if (list) list.push(n);
    else byFile.set(n.source_file, [n]);
  }
  return [...byFile.entries()]
    .map(([file, symbols]) => ({ doc_id: file, file, symbols }))
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}

/** Prompt for a fresh doc — concise, code-grounded, markdown-only. */
export function buildGeneratePrompt(input: GenDocInput): string {
  const syms = input.symbols
    .map((s) => `### ${s.id}\n${s.signature ? s.signature + "\n" : ""}\n\`\`\`\n${s.source}\n\`\`\``)
    .join("\n\n");
  return [
    "You are writing concise internal documentation for ONE source file.",
    "Describe what the file is for and what its key symbols do — one short line per symbol.",
    "Be precise and grounded in the code below. Output ONLY markdown, no preamble, no outer code fence. Keep it under ~1500 characters.",
    "",
    `## File: ${input.file}`,
    "",
    "## Symbols",
    syms || "(none)",
  ].join("\n");
}

/** Render the symbols block for one file (shared with the batch prompt). */
function renderSymbols(input: GenDocInput): string {
  return input.symbols
    .map((s) => `### ${s.id}\n${s.signature ? s.signature + "\n" : ""}\n\`\`\`\n${s.source}\n\`\`\``)
    .join("\n\n") || "(none)";
}

/**
 * Build ONE prompt documenting several files. The model must prefix each file's
 * doc with an exact machine marker `<<<DOC file=PATH>>>` so the response splits
 * back apart deterministically — see {@link parseBatchDocs}.
 */
export function buildBatchGeneratePrompt(inputs: GenDocInput[]): string {
  const blocks = inputs.map((input) =>
    [`<<<DOC file=${input.file}>>>`, `## File: ${input.file}`, "", "## Symbols", renderSymbols(input)].join("\n"),
  );
  return [
    "You are writing concise internal documentation for MULTIPLE source files.",
    "For EACH file below, output its doc PREFIXED by a line EXACTLY of the form:",
    "<<<DOC file=RELATIVE/PATH.ts>>>",
    "using the exact path shown for that file, then the markdown doc (what the file",
    "is for + one short line per key symbol, under ~1200 characters).",
    "Output ONLY these marker+doc sections, in order. No preamble, no outer code fence.",
    "",
    "=== FILES ===",
    "",
    blocks.join("\n\n----------\n\n"),
  ].join("\n");
}

/**
 * Split a batched response into doc_id → markdown. Keys by the marker path,
 * matched against the requested `inputs` (so only real files map back). A file
 * whose marker is missing is simply absent — the caller regenerates it singly.
 */
export function parseBatchDocs(response: string, inputs: GenDocInput[]): Map<string, string> {
  const wanted = new Map(inputs.map((i) => [i.file, i.doc_id]));
  const out = new Map<string, string>();
  const marker = new RegExp(BATCH_MARKER_RE.source, "g");
  const matches = [...response.matchAll(marker)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const file = m[1].trim();
    const docId = wanted.get(file);
    if (!docId) continue; // unknown/hallucinated path
    const start = m.index! + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : response.length;
    const body = response.slice(start, end).trim();
    if (body) out.set(docId, body);
  }
  return out;
}

export interface GenerateArgs {
  query: QueryFn;
  tableName: string;
  snap: GraphSnapshot;
  repoRoot: string;
  project?: string;
  scope?: GenScope;
  include?: string[];
  exclude?: string[];
  /** doc_ids that already exist (skipped unless force). */
  existing: Set<string>;
  force?: boolean;
  limit?: number;
  concurrency?: number;
  generate: GenerateDocFn;
  /** When >1 with `batchGenerate`, document this many files per LLM call. */
  batchSize?: number;
  /** Batched generator (documents K files at once). Falls back to `generate`. */
  batchGenerate?: BatchGenerateFn;
  /** Optional embedder for the doc search vector (best-effort, null-safe). */
  embed?: DocEmbedder;
  agent?: string;
  pluginVersion?: string;
}

export interface GenOutcome {
  doc_id: string;
  status: "created" | "skipped" | "failed";
  reason?: string;
}
export interface GenReport {
  outcomes: GenOutcome[];
  targets: number;
  created: number;
  skipped: number;
  failed: number;
}

function defaultVfsPath(project: string, docId: string): string {
  return `/docs/${project || "default"}/${docId}.md`;
}

/** Generate docs for the selected targets. */
export async function generateDocs(args: GenerateArgs): Promise<GenReport> {
  const project = args.project ?? "";
  let targets = selectTargets(args.snap, { scope: args.scope, include: args.include, exclude: args.exclude });
  if (!args.force) targets = targets.filter((t) => !args.existing.has(t.doc_id));
  if (args.limit !== undefined) targets = targets.slice(0, args.limit);

  const outcomes: GenOutcome[] = [];

  // Prep a target into its prompt input + per-file anchors (pure, no LLM).
  // Returns null (and records a skip) when nothing can be anchored.
  const prep = (t: GenTarget): { input: GenDocInput; anchors: DocAnchor[] } | null => {
    const symInput: GenDocInput["symbols"] = [];
    const anchors: DocAnchor[] = [];
    for (const n of t.symbols) {
      const source = readSymbolSource(n, args.repoRoot);
      const anchor = buildAnchor(n, args.repoRoot);
      if (source !== null) symInput.push({ id: n.id, signature: n.signature, source });
      if (anchor) anchors.push(anchor);
    }
    if (anchors.length === 0) {
      outcomes.push({ doc_id: t.doc_id, status: "skipped", reason: "no readable symbols to anchor" });
      return null;
    }
    return { input: { doc_id: t.doc_id, file: t.file, symbols: symInput }, anchors };
  };

  // Persist one doc via the idempotent upsert (deterministic id = doc_id, so a
  // retried write can never fork a duplicate row).
  const writeDoc = async (docId: string, content: string, anchors: DocAnchor[]): Promise<void> => {
    if (content.trim() === "") {
      outcomes.push({ doc_id: docId, status: "failed", reason: "empty content" });
      return;
    }
    try {
      // Best-effort search vector; null → NULL column, never blocks the write.
      const content_embedding = args.embed ? (await args.embed(content)) ?? undefined : undefined;
      await upsertDoc(args.query, args.tableName, {
        doc_id: docId,
        path: defaultVfsPath(project, docId),
        content,
        anchors,
        tier: "fast",
        project,
        agent: args.agent ?? "docs-generate",
        plugin_version: args.pluginVersion,
        content_embedding,
      });
      outcomes.push({ doc_id: docId, status: "created" });
    } catch (err) {
      outcomes.push({ doc_id: docId, status: "failed", reason: `write failed: ${(err as Error).message}` });
    }
  };

  const genSingle = async (input: GenDocInput, anchors: DocAnchor[]): Promise<void> => {
    let content: string;
    try {
      content = await args.generate(input);
    } catch (err) {
      outcomes.push({ doc_id: input.doc_id, status: "failed", reason: `generate failed: ${(err as Error).message}` });
      return;
    }
    await writeDoc(input.doc_id, content, anchors);
  };

  const concurrency = args.concurrency ?? 4;
  const batchSize = args.batchSize ?? 1;

  if (batchSize > 1 && args.batchGenerate) {
    // Batched: document `batchSize` files per LLM call (amortizes the per-call
    // boot). Anchors stay per-file; any file the model omits from the batch
    // response falls back to a single-file call so coverage is never lost.
    const prepped = targets.map(prep).filter((p): p is { input: GenDocInput; anchors: DocAnchor[] } => p !== null);
    const batches: Array<typeof prepped> = [];
    for (let i = 0; i < prepped.length; i += batchSize) batches.push(prepped.slice(i, i + batchSize));
    const batchGen = args.batchGenerate;
    await runPool(batches, concurrency, async (batch) => {
      let map: Map<string, string>;
      try {
        map = await batchGen(batch.map((b) => b.input));
      } catch {
        map = new Map(); // whole-batch failure → everyone falls back to single
      }
      for (const b of batch) {
        const content = map.get(b.input.doc_id);
        if (content && content.trim() !== "") await writeDoc(b.input.doc_id, content, b.anchors);
        else await genSingle(b.input, b.anchors); // omitted by the model → single
      }
    });
  } else {
    await runPool(targets, concurrency, async (t) => {
      const p = prep(t);
      if (p) await genSingle(p.input, p.anchors);
    });
  }

  return {
    outcomes,
    targets: targets.length,
    created: outcomes.filter((o) => o.status === "created").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  };
}
