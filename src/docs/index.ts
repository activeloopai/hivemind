/**
 * Barrel for `src/docs/`.
 *
 * Consumers (CLI handler, doc-worker, future VFS read routing) import only
 * from this entry point so internal restructuring stays a non-breaking
 * change for callers.
 */

export { insertDoc, insertDocResilient, upsertDoc, editDoc, setDoc, archiveDoc, _MAX_CONTENT_LENGTH } from "./write.js";
export type { InsertDocInput, EditDocInput, SetDocInput, WriteResult, ResilientWriteOpts } from "./write.js";

export { listDocs, listDocMeta, listDocsByIds, getDocLatest, parseAnchors } from "./read.js";
export type {
  DocRow,
  DocMetaRow,
  DocAnchor,
  DocTier,
  ListDocsOpts,
  QueryFn,
} from "./read.js";

export { buildDocsIndex, dirOf, firstDocLine } from "./index-render.js";
export type { DocMeta } from "./index-render.js";

export { changedFilesFromGit, expandToCandidateFiles } from "./candidates.js";
export type { GitRunner } from "./candidates.js";

export {
  parseSourceLocation,
  readSymbolSource,
  hashSource,
  computeSymbolHash,
  buildAnchor,
  anchorStatus,
} from "./anchors.js";
export type { AnchorStatus } from "./anchors.js";

export { computeStaleDocs, widenByBlastRadius, computeImpactedDocs } from "./impact.js";
export type { StaleReason, ImpactedDoc } from "./impact.js";

export { gateDocEdit, countChangedLines, DEFAULT_MAX_CHANGED_LINES, GATE_MAX_CONTENT_LENGTH } from "./gate.js";
export type { GateInput, GateResult } from "./gate.js";

export { groupFilesBySubsystem, DEFAULT_MAX_FILES } from "./wiki-groups.js";
export type { WikiGroup } from "./wiki-groups.js";

export {
  generateWikiPages,
  selectWikiGroups,
  wikiDocId,
  chunkFiles,
  splitOversizedFile,
  validateWikiNarrative,
  appendFilesIndex,
  stripFilesIndex,
  parseFilesIndex,
  collectWikiAnchors,
  buildWikiPagePrompt,
  buildWikiNotesPrompt,
  buildWikiSynthesisPrompt,
  WIKI_DOC_PREFIX,
  DEFAULT_CHUNK_CHARS,
  MIN_GROUP_FILES,
  MIN_GROUP_CHARS,
} from "./wiki-generate.js";
export type { WikiGenArgs, WikiReport, WikiOutcome, WikiFileSource, RunPromptFn } from "./wiki-generate.js";

export { runWikiRefreshCycle, runLocalWikiRefresh, DEFAULT_MIN_PERIOD_MS } from "./wiki-refresh.js";
export type {
  WikiRefreshArgs,
  WikiRefreshReport,
  WikiRefreshOutcome,
  LocalWikiRefreshArgs,
  LocalWikiRefreshOutcome,
} from "./wiki-refresh.js";

export {
  updateWikiPage,
  buildUpdatePrompt,
  shouldEscalate,
  NO_CHANGE,
  DEFAULT_MAX_PATCHES,
  DEFAULT_MAX_SIGNATURE_CHANGES,
  DEFAULT_WIKI_MAX_CHANGED_LINES,
} from "./wiki-update.js";
export type { WikiUpdateArgs, WikiUpdateOutcome, EscalationInput } from "./wiki-update.js";

export {
  pullDocs,
  localDocPath,
  readPullManifest,
  writePullManifest,
  ensureGitignoreEntries,
  GITIGNORE_ENTRIES,
  PULL_MANIFEST_DIR,
  PULL_MANIFEST_FILE,
} from "./pull.js";
export type { PullArgs, PullReport, PullManifest } from "./pull.js";

export { readRefreshMeta, tryClaimTurn, commitRefresh, META_DOC_ID, CLAIM_TTL_MS } from "./meta.js";
export type { RefreshMeta, MetaReadResult, ClaimOpts, ClaimResult, CommitResult } from "./meta.js";

export { refreshDocs, buildRefreshPrompt } from "./refresh.js";
export type {
  GenerateFn,
  RefreshContext,
  RefreshArgs,
  RefreshReport,
  RefreshOutcome,
  ChangedSymbol,
} from "./refresh.js";
