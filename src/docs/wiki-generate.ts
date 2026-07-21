/**
 * Wiki page generation — ONE narrative page per subsystem, authored from
 * chunked SOURCE (not from per-file docs, not from a graph slice alone).
 *
 * Benchmark evidence (autodoc-benchmark, W arm): narrative subsystem pages
 * were the only retrieval layer that improved architecture-level answers.
 * They work because a human wrote-style overview carries cross-file intent
 * that per-file docs cannot.
 *
 * Shape of a page:
 *   - LLM narrative (purpose, how the pieces fit, data flow, invariants)
 *   - a MECHANICAL `## Files` index appended by code (never by the model),
 *     so every member file is referenced even if the prose omits it.
 *
 * Anchors: every documentable symbol in the member files gets an anchor
 * (symbol_id + content_hash), so the same drift detection that refreshes
 * per-file docs also flags stale wiki pages.
 *
 * Chunking: member sources are packed into character-budgeted chunks. One
 * chunk → single-shot page prompt. Multiple chunks → per-chunk NOTES prompts
 * followed by one SYNTHESIS prompt (map-reduce), so no prompt ever exceeds
 * the budget regardless of subsystem size.
 *
 * Failure design: a page whose generation fails is recorded and NOT written —
 * a missing page beats a stale-but-green one.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildAnchor } from "./anchors.js";
import { selectTargets } from "./generate.js";
import { runPool } from "./pool.js";
import { upsertDoc } from "./write.js";
import { computeFingerprint, serializeFingerprint } from "./fingerprint.js";
import { defaultGit } from "./candidates.js";
import { groupFilesBySubsystem, type WikiGroup } from "./wiki-groups.js";
import type { DocEmbedder } from "./embed.js";
import type { DocAnchor, QueryFn } from "./read.js";
import type { GraphSnapshot } from "../graph/types.js";

/** doc_id prefix distinguishing wiki pages from per-file docs in the table. */
export const WIKI_DOC_PREFIX = "wiki/";

export function wikiDocId(key: string): string {
  return `${WIKI_DOC_PREFIX}${key}`;
}

/** Max characters of source packed into one LLM prompt chunk. */
export const DEFAULT_CHUNK_CHARS = 120_000;
/**
 * A group below BOTH thresholds gets no wiki page: a page about one tiny file
 * is ceremony (it paraphrases what a 5-second read shows), and pathological
 * one-file groups (e.g. a lone test file) push the model into refusals.
 */
export const MIN_GROUP_FILES = 3;
export const MIN_GROUP_CHARS = 8_000;

export interface WikiFileSource {
  file: string;
  content: string;
}

/**
 * Split one oversized source into sequential parts with EXPLICIT part labels.
 * The audit showed the model fabricates claims about code it never saw — a
 * tail cut off by a cap is exactly that — so nothing is ever dropped: the
 * whole file rides across as many labeled parts as it needs.
 */
export function splitOversizedFile(s: WikiFileSource, maxChars: number): WikiFileSource[] {
  if (s.content.length <= maxChars) return [s];
  const parts: WikiFileSource[] = [];
  const total = Math.ceil(s.content.length / maxChars);
  for (let i = 0; i < total; i++) {
    parts.push({
      file: `${s.file} [part ${i + 1}/${total}]`,
      content: s.content.slice(i * maxChars, (i + 1) * maxChars),
    });
  }
  return parts;
}

/**
 * Pack sources into chunks of at most `chunkChars` characters. A file larger
 * than the budget is split into labeled parts (NEVER truncated) so the model
 * sees 100% of the source. Order is preserved so chunks stay
 * directory-coherent and file parts stay sequential.
 */
export function chunkFiles(sources: WikiFileSource[], chunkChars = DEFAULT_CHUNK_CHARS): WikiFileSource[][] {
  const chunks: WikiFileSource[][] = [];
  let current: WikiFileSource[] = [];
  let size = 0;
  for (const raw of sources) {
    for (const s of splitOversizedFile(raw, chunkChars)) {
      const len = s.content.length + s.file.length + 32; // block overhead
      if (current.length > 0 && size + len > chunkChars) {
        chunks.push(current);
        current = [];
        size = 0;
      }
      current.push(s);
      size += len;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function renderSources(sources: WikiFileSource[]): string {
  return sources
    .map((s) => `### ${s.file}\n\`\`\`\n${s.content}\n\`\`\``)
    .join("\n\n");
}

const PAGE_STYLE = [
  "Write for an engineer new to this subsystem. Cover: what the subsystem is for,",
  "how its pieces fit together (data flow, who calls whom), and any surprising",
  "behavior. Use `## ` section headings.",
  "EVIDENCE RULE: state ONLY facts you can tie to a specific file and symbol you",
  "actually saw. Name the file when you attribute behavior to it. If you did not",
  "see the code for a claim, do not make the claim. Never state general rules or",
  'invariants ("X is immutable", "Y rejects Z", "almost everything goes through W")',
  "unless a specific line you saw says exactly that — prefer describing what one",
  "named function does over generalizing across the subsystem.",
  "NEVER cite line numbers or numeric counts (\"line 887\", \"~60 methods\") — line",
  "numbers rot with every commit and you cannot know them reliably; anchor claims",
  "to file + symbol names only.",
  "Do NOT include a file listing section; one is appended mechanically.",
  "Output ONLY markdown, no preamble, no outer code fence. Keep it under ~4000 characters.",
].join("\n");

/** Single-shot page prompt: the whole subsystem fits in one chunk. */
export function buildWikiPagePrompt(key: string, sources: WikiFileSource[]): string {
  return [
    `You are writing an internal wiki page for the subsystem \`${key}\`.`,
    PAGE_STYLE,
    "",
    "=== SOURCE ===",
    "",
    renderSources(sources),
  ].join("\n");
}

/** Map step: extract dense notes from ONE chunk of a large subsystem. */
export function buildWikiNotesPrompt(key: string, sources: WikiFileSource[], chunkIdx: number, chunkTotal: number): string {
  return [
    `You are reading part ${chunkIdx + 1} of ${chunkTotal} of the subsystem \`${key}\`` +
      " to prepare notes for a wiki page.",
    "For each file: 1-3 bullet points on its responsibility and how it connects to the",
    "rest (imports/exports/calls). Note cross-file flows you can SEE in this code.",
    "Every bullet must name the file and symbol it comes from — the synthesis step",
    "can only trust attributed notes. Do not generalize beyond this chunk.",
    "Never record line numbers (they rot and mislead the synthesis); file + symbol only.",
    "Be terse and factual — these notes feed a synthesis step, not humans.",
    "Output ONLY markdown bullets grouped under `### <file>` headings.",
    "",
    "=== SOURCE ===",
    "",
    renderSources(sources),
  ].join("\n");
}

/** Reduce step: synthesize the final page from the per-chunk notes. */
export function buildWikiSynthesisPrompt(key: string, notes: string[]): string {
  return [
    `You are writing an internal wiki page for the subsystem \`${key}\`,`,
    "synthesized from the reading notes below (taken across the whole subsystem).",
    "The notes are your ONLY source: keep every claim attributed to the file the",
    "note attributes it to — never move behavior to a different file, and never",
    "merge two notes into a broader rule neither of them states.",
    PAGE_STYLE,
    "",
    "=== NOTES ===",
    "",
    notes.map((n, i) => `--- notes part ${i + 1} ---\n${n}`).join("\n\n"),
  ].join("\n");
}

/**
 * Output validation — a page must be a page. Models occasionally REFUSE
 * (e.g. handed a lone test file: "I can only see a test file... Could you
 * provide...") and a refusal is non-empty text, so the empty-content check
 * alone lets it through and it gets persisted as documentation. Refusal
 * phrasing or a heading-less body ⇒ invalid.
 */
const REFUSAL_RE =
  /\b(I can only|I cannot|I can't|I'm unable|I am unable|I don't have|I do not have|could you (provide|share)|please (provide|share)|as an AI)\b/i;

export function validateWikiNarrative(narrative: string): { ok: boolean; reason?: string } {
  if (narrative.trim() === "") return { ok: false, reason: "empty content" };
  if (REFUSAL_RE.test(narrative)) return { ok: false, reason: "model refused instead of writing the page" };
  if (!/^##? /m.test(narrative)) return { ok: false, reason: "no markdown section headings — not a page" };
  return { ok: true };
}

const FILES_INDEX_HEADER = "## Files";

/** Remove any `## Files` section (model-emitted or previous mechanical one). */
export function stripFilesIndex(content: string): string {
  return content.replace(/^## Files\s*$[\s\S]*?(?=^## |\n*$(?![\s\S]))/gm, "").trimEnd();
}

/**
 * Append the mechanical `## Files` index. Idempotent: any model-emitted or
 * previous `## Files` section (to end-of-doc or next `## `) is stripped first,
 * so re-running never stacks duplicates. This section is CODE-owned — the
 * guarantee that every member file is referenced does not depend on the model.
 */
export function appendFilesIndex(narrative: string, files: string[]): string {
  const index = [FILES_INDEX_HEADER, "", ...files.map((f) => `- \`${f}\``)].join("\n");
  return `${stripFilesIndex(narrative)}\n\n${index}\n`;
}

/**
 * Parse the mechanical `## Files` index back into its member list. This is
 * how the refresh loop detects membership drift: the page's stored index is
 * the group composition at last write; comparing it to the current grouping
 * says whether files joined or left the subsystem.
 */
export function parseFilesIndex(content: string): string[] {
  const m = /^## Files\s*$([\s\S]*?)(?=^## |\n*$(?![\s\S]))/m.exec(content);
  if (!m) return [];
  const files: string[] = [];
  for (const line of m[1].split("\n")) {
    const item = /^- `(.+)`\s*$/.exec(line.trim());
    if (item) files.push(item[1]);
  }
  return files;
}

/**
 * Anchors for every documentable symbol across `files` (drift detection for a
 * wiki page reuses the per-file doc machinery unchanged). Unreadable symbols
 * are skipped — an anchor is only as good as the source it hashes.
 */
export function collectWikiAnchors(snap: GraphSnapshot, files: string[], repoRoot: string): DocAnchor[] {
  const wanted = new Set(files);
  const anchors: DocAnchor[] = [];
  for (const t of selectTargets(snap, { scope: "file", include: [...wanted] })) {
    if (!wanted.has(t.file)) continue;
    for (const node of t.symbols) {
      const a = buildAnchor(node, repoRoot);
      if (a) anchors.push(a);
    }
  }
  return anchors;
}

/** Run-a-prompt seam (production: runHostPrompt via the resolved host agent). */
export type RunPromptFn = (prompt: string) => Promise<string>;

export interface WikiGenArgs {
  query: QueryFn;
  tableName: string;
  snap: GraphSnapshot;
  repoRoot: string;
  project?: string;
  /** Row scope. Wiki pages are canonical by default. */
  scope?: string;
  include?: string[];
  exclude?: string[];
  /** doc_ids (`wiki/<key>`) that already exist — skipped unless force. */
  existing: Set<string>;
  force?: boolean;
  limit?: number;
  concurrency?: number;
  maxFilesPerGroup?: number;
  chunkChars?: number;
  /** Min-value thresholds (see MIN_GROUP_FILES / MIN_GROUP_CHARS). */
  minGroupFiles?: number;
  minGroupChars?: number;
  /** Notes / default runner (cheap model — bulk of the tokens). */
  run: RunPromptFn;
  /**
   * FINAL-PAGE authoring runner. The audit showed page-authoring is where
   * accuracy is won or lost (module-attribution inversions, fabricated
   * invariants), while note-taking survives a cheap model — so the two steps
   * take different models. Defaults to `run`.
   */
  runPage?: RunPromptFn;
  embed?: DocEmbedder;
  agent?: string;
  pluginVersion?: string;
}

export interface WikiOutcome {
  doc_id: string;
  key: string;
  files: number;
  chunks: number;
  status: "created" | "skipped" | "failed";
  reason?: string;
}

export interface WikiReport {
  outcomes: WikiOutcome[];
  groups: number;
  created: number;
  skipped: number;
  failed: number;
}

/** Group the snapshot's documentable files into wiki subsystems (pure). */
export function selectWikiGroups(
  snap: GraphSnapshot,
  opts: { include?: string[]; exclude?: string[]; maxFiles?: number } = {},
): WikiGroup[] {
  const targets = selectTargets(snap, { scope: "file", include: opts.include, exclude: opts.exclude });
  return groupFilesBySubsystem(targets.map((t) => t.file), { maxFiles: opts.maxFiles });
}

function defaultWikiVfsPath(project: string, key: string): string {
  return `/docs/${project || "default"}/wiki/${key}.md`;
}

/**
 * Disk-side mirror of the generation min-size gate, for status displays
 * (`docs list` progress line). Same semantics as the in-run gate: a group is
 * skipped only when BOTH file count and total size are below threshold.
 * Uses stat sizes instead of loaded content — cheap enough to run on every
 * list, and byte-vs-char drift cannot flip the gate in any realistic repo.
 */
export function wikiGroupEligible(files: string[], repoRoot: string, minFiles = MIN_GROUP_FILES, minChars = MIN_GROUP_CHARS): boolean {
  let total = 0;
  let present = 0;
  for (const f of files) {
    try {
      total += statSync(join(repoRoot, f)).size;
      present++;
    } catch {
      // unreadable/missing file: contributes nothing, same as the in-run gate
    }
  }
  return !(present < minFiles && total < minChars);
}

/** Generate wiki pages for every subsystem group. */
export async function generateWikiPages(args: WikiGenArgs): Promise<WikiReport> {
  const project = args.project ?? "";
  const scope = args.scope ?? "main";

  let groups = selectWikiGroups(args.snap, {
    include: args.include,
    exclude: args.exclude,
    maxFiles: args.maxFilesPerGroup,
  });
  if (!args.force) groups = groups.filter((g) => !args.existing.has(wikiDocId(g.key)));
  if (args.limit !== undefined) groups = groups.slice(0, args.limit);

  const outcomes: WikiOutcome[] = [];

  await runPool(groups, args.concurrency ?? 2, async (group) => {
    const docId = wikiDocId(group.key);

    // Read member sources IN FULL (oversized files are split into labeled
    // parts by chunkFiles, never truncated); unreadable files are dropped from
    // the prompt but stay in the mechanical index.
    const sources: WikiFileSource[] = [];
    for (const file of group.files) {
      try {
        sources.push({ file, content: readFileSync(join(args.repoRoot, file), "utf-8") });
      } catch {
        // unreadable (deleted between snapshot and now, permissions) — skip source
      }
    }
    if (sources.length === 0) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: 0, status: "skipped", reason: "no readable member sources" });
      return;
    }

    // Min-value threshold: tiny one-off groups produce ceremony or refusals.
    const totalChars = sources.reduce((n, s) => n + s.content.length, 0);
    if (sources.length < (args.minGroupFiles ?? MIN_GROUP_FILES) && totalChars < (args.minGroupChars ?? MIN_GROUP_CHARS)) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: 0, status: "skipped", reason: `below min size (${sources.length} file(s), ${totalChars} chars)` });
      return;
    }

    const chunks = chunkFiles(sources, args.chunkChars ?? DEFAULT_CHUNK_CHARS);
    const runPage = args.runPage ?? args.run;

    let narrative: string;
    try {
      if (chunks.length === 1) {
        narrative = await runPage(buildWikiPagePrompt(group.key, chunks[0]));
      } else {
        const notes: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
          notes.push(await args.run(buildWikiNotesPrompt(group.key, chunks[i], i, chunks.length)));
        }
        narrative = await runPage(buildWikiSynthesisPrompt(group.key, notes));
      }
    } catch (err) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "failed", reason: `generate failed: ${(err as Error).message}` });
      return;
    }
    const valid = validateWikiNarrative(narrative);
    if (!valid.ok) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "failed", reason: valid.reason });
      return;
    }

    const content = appendFilesIndex(narrative, group.files);
    const anchors = collectWikiAnchors(args.snap, group.files, args.repoRoot);

    try {
      const content_embedding = args.embed ? (await args.embed(content)) ?? undefined : undefined;
      const source_fp = serializeFingerprint(computeFingerprint(defaultGit(args.repoRoot), group.files));
      await upsertDoc(args.query, args.tableName, {
        doc_id: docId,
        path: defaultWikiVfsPath(project, group.key),
        content,
        anchors,
        tier: "slow",
        project,
        scope,
        source_fp,
        agent: args.agent ?? "docs-wiki",
        plugin_version: args.pluginVersion,
        content_embedding,
      });
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "created" });
    } catch (err) {
      outcomes.push({ doc_id: docId, key: group.key, files: group.files.length, chunks: chunks.length, status: "failed", reason: `write failed: ${(err as Error).message}` });
    }
  });

  return {
    outcomes,
    groups: groups.length,
    created: outcomes.filter((o) => o.status === "created").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  };
}
