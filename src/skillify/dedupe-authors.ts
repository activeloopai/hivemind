/**
 * Merge the same-name skills of several authors into one skill and one
 * version chain. Second pass of `hivemind skillify dedupe`.
 *
 * The org skills table is the source of truth, so the pass also works on a
 * machine that has no skill pulled yet. Candidates: the latest row per
 * (project_key, name, author) that no earlier merge retired, grouped by
 * (project_key, name); a group with two or more authors is a candidate. The
 * survivor is the chain with the highest version (tie: the user's own chain).
 * An LLM merges the remote bodies, or answers DISTINCT when the skills only
 * share a name.
 *
 * On MERGE:
 *   - one row lands on the survivor chain (author = survivor author,
 *     contributors = every merged author + the user), so pull retires the
 *     other chains on every machine (see `retiredChains` in pull.ts)
 *   - when local copies exist, the merged SKILL.md replaces the user's
 *     `<name>` slot(s) (the global slot is created when the user has none)
 *     and the other pull-managed local copies are removed
 *   - without local copies nothing is written to disk; the next pull
 *     installs the merged skill
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, recordPull, removePullEntry, unlinkSymlinks, type PulledEntry } from "./manifest.js";
import { detectAgentSkillsRoots } from "./agent-roots.js";
import {
  buildPullSql, fanOutSymlinks, isMissingContributorsColumnError, isMissingTableError,
  resolvePullDestination, retiredChains, selectLatestPerName, type QueryFn,
} from "./pull.js";
import { parseContributorList } from "./ownership.js";
import { listSkills, parseFrontmatter, renderFrontmatter, resolveSkillsRoot, type SkillFrontmatter } from "./skill-writer.js";
import { insertSkillRow } from "./skills-table.js";
import { extractJsonBlock } from "./gate-parser.js";
import { findAgentBin, runGate, type Agent } from "./gate-runner.js";
import type { DedupeEntry } from "./dedupe.js";

export interface MergeCandidate {
  author: string;
  version: number;
  description: string;
  trigger?: string;
  body: string;
}

export interface MergeInput {
  name: string;
  candidates: MergeCandidate[];
}

export interface MergeVerdict {
  verdict: "MERGE" | "DISTINCT";
  description?: string;
  trigger?: string;
  body?: string;
}

export type MergeFn = (input: MergeInput) => Promise<MergeVerdict | null>;

export interface MergeAuthorsOptions {
  myUsername: string;
  cwd: string;
  dryRun?: boolean;
  /** Org skills table: the source of the candidates and the target of the merged row. */
  query: QueryFn;
  tableName: string;
  workspaceId: string;
  /** Produces the merged skill. Defaults to the local agent CLI. */
  merge?: MergeFn;
  /** Agent CLI for the default merge. */
  agent?: Agent;
  sourceAgent?: string;
  now?: () => string;
}

interface LocalSkill {
  name: string;
  dirName: string;
  root: string;
  install: "project" | "global";
  author: string;
  contributors: string[];
  version: number;
  description: string;
  trigger?: string;
  body: string;
  sourceSessions: string[];
  createdByAgent: string;
  createdAt?: string;
  entry?: PulledEntry;
}

function readLocal(root: string, install: "project" | "global", entries: PulledEntry[]): LocalSkill[] {
  const out: LocalSkill[] = [];
  for (const s of listSkills(root)) {
    const parsed = parseFrontmatter(s.body);
    if (!parsed) continue;
    const fm = parsed.fm;
    const entry = entries.find(e => e.install === install && e.installRoot === root && e.dirName === s.name);
    const author = typeof fm.author === "string" && fm.author.length > 0 ? fm.author : entry?.author;
    if (!author) continue;
    const name = entry?.name ?? (typeof fm.name === "string" && fm.name.length > 0 ? fm.name : s.name);
    out.push({
      name,
      dirName: s.name,
      root,
      install,
      author,
      contributors: Array.isArray(fm.contributors) ? fm.contributors.map(String) : [author],
      version: typeof fm.version === "number" ? fm.version : 1,
      description: typeof fm.description === "string" ? fm.description : "",
      trigger: typeof fm.trigger === "string" ? fm.trigger : undefined,
      body: parsed.body.trim(),
      sourceSessions: Array.isArray(fm.source_sessions) ? fm.source_sessions.map(String) : [],
      createdByAgent: typeof fm.created_by_agent === "string" ? fm.created_by_agent : "unknown",
      createdAt: typeof fm.created_at === "string" ? fm.created_at : undefined,
      entry,
    });
  }
  return out;
}

export function listLocalSkills(cwd: string): LocalSkill[] {
  const entries = loadManifest().entries;
  return [
    ...readLocal(resolveSkillsRoot("global", cwd), "global", entries),
    ...readLocal(resolveSkillsRoot("project", cwd), "project", entries),
  ];
}

export interface RemoteSkill {
  name: string;
  project: string;
  projectKey: string;
  author: string;
  contributors: string[];
  version: number;
  description: string;
  trigger?: string;
  body: string;
  sourceSessions: string[];
  sourceAgent: string;
  install: "project" | "global";
  createdAt?: string;
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
  }
  return [];
}

/** A skills-table row (the pull SELECT shape) as a merge candidate; null without name or author. */
export function rowToRemoteSkill(row: Record<string, unknown>): RemoteSkill | null {
  const name = String(row.name ?? "");
  const author = String(row.author ?? "");
  if (!name || !author) return null;
  const version = Number(row.version);
  const trigger = typeof row.trigger_text === "string" && row.trigger_text ? row.trigger_text : undefined;
  const contributors = parseContributorList(row.contributors);
  return {
    name,
    project: String(row.project ?? ""),
    projectKey: String(row.project_key ?? ""),
    author,
    contributors: contributors.length ? contributors : [author],
    version: Number.isFinite(version) && version > 0 ? version : 1,
    description: String(row.description ?? ""),
    trigger,
    body: String(row.body ?? "").trim(),
    sourceSessions: asList(row.source_sessions),
    sourceAgent: String(row.source_agent ?? "") || "unknown",
    install: String(row.install ?? "") === "project" ? "project" : "global",
    createdAt: typeof row.created_at === "string" && row.created_at ? row.created_at : undefined,
  };
}

/** The latest row per (project_key, name, author), minus the chains an earlier merge retired. */
export async function fetchRemoteSkills(query: QueryFn, tableName: string): Promise<RemoteSkill[]> {
  let rows: Record<string, unknown>[];
  try {
    rows = await query(buildPullSql({ tableName, users: [] }));
  } catch (err: any) {
    if (isMissingTableError(err?.message)) return [];
    if (!isMissingContributorsColumnError(err?.message)) throw err;
    rows = await query(buildPullSql({ tableName, users: [], includeContributors: false }));
  }
  const latest = selectLatestPerName(rows);
  const retired = retiredChains(latest);
  return latest.filter(r => !retired.has(r)).map(rowToRemoteSkill).filter((s): s is RemoteSkill => s !== null);
}

/** Groups with two or more distinct authors, keyed by (project_key, name). */
export function groupByName(skills: RemoteSkill[]): Map<string, RemoteSkill[]> {
  const groups = new Map<string, RemoteSkill[]>();
  for (const s of skills) {
    const key = `${s.projectKey}\x00${s.name}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  for (const [key, list] of groups) {
    if (new Set(list.map(s => s.author)).size < 2) groups.delete(key);
  }
  return groups;
}

export function pickSurvivor<T extends { version: number; author: string }>(group: T[], me: string): T {
  return group.reduce((best, s) => {
    if (s.version > best.version) return s;
    if (s.version === best.version && s.author === me && best.author !== me) return s;
    return best;
  });
}

function unique(lists: string[][]): string[] {
  return Array.from(new Set(lists.flat().filter(Boolean)));
}

export function buildMergePrompt(input: MergeInput): string {
  const blocks = input.candidates.map(c =>
    `--- candidate [author=${c.author}, v${c.version}] ---\n` +
    `description: ${c.description}\n` +
    (c.trigger ? `trigger: ${c.trigger}\n` : "") +
    `${c.body}\n`,
  );
  return [
    `You curate a shared skill library. ${input.candidates.length} teammates each saved a skill`,
    `named "${input.name}". Decide whether they are the same skill.`,
    ``,
    `- MERGE if they describe the same procedure or pattern. Produce one merged body that keeps`,
    `  every concrete step, command, and caveat from all candidates, without exceeding ~3000`,
    `  characters. Remove repetition. Keep the most precise wording.`,
    `- DISTINCT if they only share a name and describe different things.`,
    `- "trigger" is REQUIRED for MERGE: one concrete activation condition phrased`,
    `  'Use this skill when <situation>'.`,
    ``,
    `=== CANDIDATES ===`,
    ...blocks,
    `=== END ===`,
    ``,
    `Respond with ONLY a JSON object:`,
    `{`,
    `  "verdict": "MERGE" | "DISTINCT",`,
    `  "description": "<one sentence; MERGE only>",`,
    `  "trigger": "<REQUIRED for MERGE: 'Use this skill when <situation>'>",`,
    `  "body": "<full SKILL.md body WITHOUT frontmatter; MERGE only>"`,
    `}`,
  ].join("\n");
}

export function parseMergeVerdict(raw: string): MergeVerdict | null {
  const block = extractJsonBlock(raw);
  if (!block) return null;
  try {
    const v = JSON.parse(block) as MergeVerdict;
    if (v.verdict !== "MERGE" && v.verdict !== "DISTINCT") return null;
    if (v.verdict === "MERGE" && !(typeof v.body === "string" && v.body.trim().length > 0)) return null;
    return v;
  } catch {
    return null;
  }
}

const AGENT_ORDER: Agent[] = ["claude_code", "codex", "cursor", "hermes", "pi"];

/** The first agent CLI installed on this machine; claude_code when none is found. */
export function pickMergeAgent(): Agent {
  return AGENT_ORDER.find(a => existsSync(findAgentBin(a))) ?? "claude_code";
}

export function agentMerge(agent: Agent): MergeFn {
  return async (input) => {
    const gate = runGate({ agent, prompt: buildMergePrompt(input) });
    if (gate.errored && !gate.stdout) throw new Error(gate.errorMessage ?? `${agent} CLI failed`);
    return parseMergeVerdict(gate.stdout);
  };
}

function removeCopy(s: LocalSkill): void {
  if (!s.entry) return;
  rmSync(join(s.root, s.dirName), { recursive: true, force: true });
  unlinkSymlinks(s.entry.symlinks);
  removePullEntry(s.entry.install, s.entry.installRoot, s.entry.dirName);
}

interface MergedSkill {
  name: string;
  author: string;
  contributors: string[];
  version: number;
  description: string;
  trigger?: string;
  body: string;
  sourceSessions: string[];
  createdByAgent: string;
  createdAt: string;
  updatedAt: string;
}

function renderMerged(m: MergedSkill): string {
  const fm: SkillFrontmatter = {
    name: m.name,
    description: m.description,
    trigger: m.trigger,
    author: m.author,
    source_sessions: m.sourceSessions,
    contributors: m.contributors,
    version: m.version,
    created_by_agent: m.createdByAgent,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
  return `${renderFrontmatter(fm)}\n\n${m.body.trim()}\n`;
}

/** The user's `<name>` slots that get the merged skill; the global slot when there is none. */
function targetSlots(group: LocalSkill[], me: string, cwd: string): { root: string; install: "project" | "global" }[] {
  const own = group.filter(s => s.dirName === s.name && (s.author === me || s.contributors.includes(me)));
  if (own.length > 0) return own.map(s => ({ root: s.root, install: s.install }));
  return [{ root: resolveSkillsRoot("global", cwd), install: "global" }];
}

function writeSlot(root: string, m: MergedSkill): string {
  const dir = join(root, m.name);
  const file = join(dir, "SKILL.md");
  mkdirSync(dir, { recursive: true });
  try {
    renameSync(file, `${file}.bak`);
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  writeFileSync(file, renderMerged(m));
  return file;
}

/** The local copies of a merged group: same name, one of the merged authors. */
function localCopies(cwd: string, name: string, authors: string[]): LocalSkill[] {
  return listLocalSkills(cwd).filter(s => s.name === name && authors.includes(s.author));
}

/** Write the merged skill into the user's slots and drop the other pull-managed copies. */
function applyLocal(local: LocalSkill[], merged: MergedSkill, projectKey: string, me: string, cwd: string): string {
  const slots = targetSlots(local, me, cwd);
  const written = slots.map(slot => ({ ...slot, file: writeSlot(slot.root, merged) }));
  for (const s of local) {
    if (s.dirName !== merged.name && s.entry) removeCopy(s);
  }
  for (const w of written) {
    if (merged.author === me) continue;
    const symlinks = w.install === "global" ? fanOutSymlinks(join(w.root, merged.name), merged.name, detectAgentSkillsRoots(w.root)) : [];
    recordPull({
      dirName: merged.name, name: merged.name, rawName: merged.name, author: merged.author, projectKey,
      remoteVersion: merged.version, install: w.install, installRoot: w.root, pulledAt: merged.updatedAt, symlinks,
    });
  }
  return written[0].file;
}

async function mergeGroup(group: RemoteSkill[], opts: MergeAuthorsOptions, merge: MergeFn): Promise<DedupeEntry> {
  const me = opts.myUsername;
  const name = group[0].name;
  const survivor = pickSurvivor(group, me);
  const authors = group.map(c => c.author).sort();
  const local = localCopies(opts.cwd, name, authors);
  const version = survivor.version + 1;
  const localNote = local.length > 0 ? "local copy updated" : "no local copy";
  const base: Omit<DedupeEntry, "action" | "reason"> = {
    dirName: name, name, path: `${opts.tableName}:${name}`, dryRun: opts.dryRun ?? false,
  };
  if (opts.dryRun) {
    return { ...base, action: "merged", reason: `authors ${authors.join(", ")} -> ${survivor.author} v${version} · ${localNote}` };
  }
  let verdict: MergeVerdict | null;
  try {
    verdict = await merge({
      name,
      candidates: group.map(c => ({
        author: c.author, version: c.version, description: c.description, trigger: c.trigger, body: c.body,
      })),
    });
  } catch (err: any) {
    return { ...base, action: "failed", reason: `merge: ${err?.message ?? err}` };
  }
  if (!verdict) return { ...base, action: "failed", reason: "merge: no usable verdict" };
  if (verdict.verdict === "DISTINCT") return { ...base, action: "kept", reason: "distinct skills" };

  const now = (opts.now ?? (() => new Date().toISOString()))();
  const merged: MergedSkill = {
    name,
    author: survivor.author,
    contributors: unique([[survivor.author], ...group.map(s => s.contributors), [me]]),
    version,
    description: verdict.description ?? survivor.description,
    trigger: verdict.trigger ?? survivor.trigger,
    body: verdict.body!,
    sourceSessions: unique(group.map(s => s.sourceSessions)),
    createdByAgent: survivor.sourceAgent,
    createdAt: survivor.createdAt ?? now,
    updatedAt: now,
  };

  try {
    await insertSkillRow({
      query: opts.query,
      tableName: opts.tableName,
      workspaceId: opts.workspaceId,
      name,
      project: survivor.project,
      projectKey: survivor.projectKey,
      localPath: join(resolvePullDestination(survivor.install, opts.cwd), name, "SKILL.md"),
      install: survivor.install,
      sourceSessions: merged.sourceSessions,
      sourceAgent: opts.sourceAgent ?? "cli",
      scope: "team",
      author: merged.author,
      contributors: merged.contributors,
      description: merged.description,
      trigger: merged.trigger,
      body: merged.body,
      version,
      createdAt: merged.createdAt,
      updatedAt: now,
    });
  } catch (err: any) {
    return { ...base, action: "failed", reason: `table: ${err?.message ?? err}` };
  }
  const reason = `authors ${authors.join(", ")} -> ${survivor.author} v${version}`;
  if (local.length === 0) return { ...base, action: "merged", reason: `${reason} · ${localNote}` };
  try {
    const file = applyLocal(local, merged, survivor.projectKey, me, opts.cwd);
    return { ...base, path: file, action: "merged", reason: `${reason} · ${localNote}` };
  } catch (err: any) {
    return { ...base, action: "failed", reason: `row v${version} recorded; local: ${err?.message ?? err}` };
  }
}

export async function mergeAuthorDuplicates(opts: MergeAuthorsOptions): Promise<DedupeEntry[]> {
  const merge = opts.merge ?? agentMerge(opts.agent ?? pickMergeAgent());
  const out: DedupeEntry[] = [];
  for (const group of groupByName(await fetchRemoteSkills(opts.query, opts.tableName)).values()) {
    out.push(await mergeGroup(group, opts, merge));
  }
  return out;
}
