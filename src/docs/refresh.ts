/**
 * Doc refresh orchestrator — turns the drift detector's work-list (step 3)
 * into rewritten docs, gated.
 *
 * Flow per stale doc:
 *   1. Re-anchor: recompute each anchor's hash against the current code
 *      (dropping anchors whose symbol vanished).
 *   2. Gather the changed symbols' CURRENT source as context.
 *   3. Ask the host LLM (injected `generate`) to produce a bounded rewrite.
 *   4. Gate it (objective invariants — see ./gate.ts).
 *   5. On pass, `setDoc` a new version with the fresh anchors; on fail, record
 *      the rejection. Nothing is written when the gate rejects.
 *
 * The LLM call is INJECTED (`generate`) so this whole module is unit-testable
 * with a deterministic stub — no network, no subprocess. The real host-CLI
 * implementation lives in ./refresh-llm.ts.
 */

import { buildAnchor, readSymbolSource } from "./anchors.js";
import { gateDocEdit, type GateResult } from "./gate.js";
import { runPool, withRateLimitRetry } from "./pool.js";
import { archiveDoc, setDoc } from "./write.js";
import type { DocEmbedder } from "./embed.js";
import type { DocAnchor, DocRow, QueryFn } from "./read.js";
import type { ImpactedDoc, StaleReason } from "./impact.js";
import type { GraphNode, GraphSnapshot } from "../graph/types.js";

/** One changed symbol with its current source, handed to the LLM as context. */
export interface ChangedSymbol {
  symbol_id: string;
  signature?: string;
  source: string;
}

/** Everything the generator needs to rewrite one doc. */
export interface RefreshContext {
  doc: DocRow;
  reasons: StaleReason[];
  changedSymbols: ChangedSymbol[];
}

/** Injected LLM call: given context, return the new markdown body. */
export type GenerateFn = (ctx: RefreshContext) => Promise<string>;

export interface RefreshOutcome {
  doc_id: string;
  status: "refreshed" | "rejected" | "skipped" | "archived";
  /** New version number when refreshed or archived. */
  version?: number;
  /** Gate rejection reasons, or skip/archive explanation. */
  reasons?: string[];
}

export interface RefreshReport {
  outcomes: RefreshOutcome[];
  refreshed: number;
  rejected: number;
  skipped: number;
  archived: number;
}

export interface RefreshArgs {
  query: QueryFn;
  tableName: string;
  snap: GraphSnapshot;
  repoRoot: string;
  /** The drift detector's output. */
  impacted: ImpactedDoc[];
  /** Current docs by doc_id (latest versions). */
  docsById: Map<string, DocRow>;
  generate: GenerateFn;
  agent?: string;
  pluginVersion?: string;
  maxChangedLines?: number;
  /** Max docs rewritten in parallel. Default 4. */
  concurrency?: number;
  /** Optional embedder to refresh the doc search vector (best-effort). */
  embed?: DocEmbedder;
}

/** Build the prompt for one doc refresh — bounded-edit, freshness-focused. */
export function buildRefreshPrompt(ctx: RefreshContext): string {
  const changed = ctx.changedSymbols
    .map((s) => `### ${s.symbol_id}\n${s.signature ? s.signature + "\n" : ""}\n\`\`\`\n${s.source}\n\`\`\``)
    .join("\n\n");
  return [
    "You are updating ONE internal documentation file so it matches the code again.",
    "The code below changed; the current doc may now be inaccurate.",
    "",
    "RULES:",
    "- Make the SMALLEST edit that restores accuracy. Do NOT rewrite the whole doc.",
    "- Preserve the existing structure, headings, and any sections unrelated to the change.",
    "- Output ONLY the full updated markdown body. No preamble, no code fences around the whole thing.",
    "",
    `## Current doc (${ctx.doc.doc_id})`,
    ctx.doc.content,
    "",
    "## Code that changed (current source)",
    changed || "(no symbol source available)",
  ].join("\n");
}

/**
 * Recompute anchors against the current snapshot + working tree. Anchors whose
 * symbol no longer resolves are dropped (the doc loses that anchor rather than
 * carrying a dangling one).
 */
function reanchor(doc: DocRow, nodeById: Map<string, GraphNode>, repoRoot: string): DocAnchor[] {
  const out: DocAnchor[] = [];
  for (const a of doc.anchors) {
    const node = nodeById.get(a.symbol_id);
    if (!node) continue;
    const fresh = buildAnchor(node, repoRoot);
    if (fresh) out.push(fresh);
  }
  return out;
}

/** Collect the changed symbols' current source for the prompt context. */
function gatherChangedSymbols(
  reasons: StaleReason[],
  nodeById: Map<string, GraphNode>,
  repoRoot: string,
): ChangedSymbol[] {
  const seen = new Set<string>();
  const out: ChangedSymbol[] = [];
  for (const r of reasons) {
    if (seen.has(r.symbol_id)) continue;
    seen.add(r.symbol_id);
    const node = nodeById.get(r.symbol_id);
    if (!node) continue;
    const source = readSymbolSource(node, repoRoot);
    if (source === null) continue;
    out.push({ symbol_id: r.symbol_id, signature: node.signature, source });
  }
  return out;
}

/**
 * Refresh every impacted doc, gating each edit. Runs a bounded worker pool so a
 * commit touching many files rewrites them concurrently (each doc is an
 * independent UPDATE of its own row), with rate-limit backoff around the host
 * LLM. Pure except for `generate` + `query`.
 */
export async function refreshDocs(args: RefreshArgs): Promise<RefreshReport> {
  const nodeById = new Map<string, GraphNode>(args.snap.nodes.map((n) => [n.id, n]));
  const outcomes: RefreshOutcome[] = [];

  await runPool(args.impacted, args.concurrency ?? 4, async (imp) => {
    const doc = args.docsById.get(imp.doc_id);
    if (!doc) {
      outcomes.push({ doc_id: imp.doc_id, status: "skipped", reasons: ["no current doc row"] });
      return;
    }

    // Slow-tier docs are human-curated; the gate would reject any automatic
    // edit anyway. Short-circuit BEFORE calling the LLM so we never spend a
    // token on a guaranteed rejection or send protected content to the model.
    if (doc.tier === "slow") {
      outcomes.push({
        doc_id: imp.doc_id,
        status: "rejected",
        reasons: ["slow-tier docs are human-curated; automatic refresh is not allowed"],
      });
      return;
    }

    const newAnchors = reanchor(doc, nodeById, args.repoRoot);

    // Fully-orphaned doc: it HAD anchors, and every one of them vanished from
    // the graph (the documented file was deleted or renamed). Re-authoring it
    // would burn an LLM call and produce an anchor-less zombie that drift
    // detection can never flag again. Archive it instead — soft delete,
    // audit trail preserved — and spend no token. A PARTIAL orphan (the file
    // still exists, only some symbols removed) keeps ≥1 anchor and falls
    // through to a normal refresh below.
    if (doc.anchors.length > 0 && newAnchors.length === 0) {
      const res = await archiveDoc(args.query, args.tableName, {
        doc_id: doc.doc_id,
        agent: args.agent ?? "docs-refresh",
        plugin_version: args.pluginVersion,
      }, { project: doc.project });
      outcomes.push({
        doc_id: imp.doc_id,
        status: "archived",
        version: res.version,
        reasons: ["all anchored symbols gone (file deleted/renamed)"],
      });
      return;
    }

    const changedSymbols = gatherChangedSymbols(imp.reasons, nodeById, args.repoRoot);

    let newContent: string;
    try {
      // Retry the LLM call on rate-limit/overload — bulk refresh bursts hit
      // the host model's limits; other errors surface immediately.
      newContent = await withRateLimitRetry(() =>
        args.generate({ doc, reasons: imp.reasons, changedSymbols }),
      );
    } catch (err) {
      outcomes.push({ doc_id: imp.doc_id, status: "skipped", reasons: [`generate failed: ${(err as Error).message}`] });
      return;
    }

    const gate: GateResult = gateDocEdit({
      tier: doc.tier,
      prevContent: doc.content,
      newContent,
      newAnchors,
      snap: args.snap,
      maxChangedLines: args.maxChangedLines,
    });
    if (!gate.ok) {
      outcomes.push({ doc_id: imp.doc_id, status: "rejected", reasons: gate.reasons });
      return;
    }

    // Best-effort by contract: an embed failure must cost the VECTOR, never
    // the refresh (an uncaught throw here would reject the whole runPool batch).
    const content_embedding = args.embed ? (await args.embed(newContent).catch(() => null)) ?? undefined : undefined;
    const res = await setDoc(args.query, args.tableName, {
      doc_id: doc.doc_id,
      path: doc.path,
      content: newContent,
      anchors: newAnchors,
      tier: doc.tier,
      project: doc.project,
      agent: args.agent ?? "docs-refresh",
      plugin_version: args.pluginVersion,
      content_embedding,
    }, { project: doc.project });
    outcomes.push({ doc_id: imp.doc_id, status: "refreshed", version: res.version });
  });

  return {
    outcomes,
    refreshed: outcomes.filter((o) => o.status === "refreshed").length,
    rejected: outcomes.filter((o) => o.status === "rejected").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    archived: outcomes.filter((o) => o.status === "archived").length,
  };
}
