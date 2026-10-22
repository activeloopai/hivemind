/**
 * Merge the same-name skills of several authors into one skill and one
 * version chain. Second pass of `hivemind skillify dedupe`.
 *
 * Candidates: every local skill (global root, project root, pull-managed
 * `<name>--<author>` copies) grouped by `name`; a group with two or more
 * authors is a candidate. The survivor is the chain with the highest
 * version (tie: the user's own chain). An LLM merges the bodies, or answers
 * DISTINCT when the skills only share a name.
 *
 * On MERGE:
 *   - the merged SKILL.md replaces the user's `<name>` slot(s); when the user
 *     has none, the global slot is created
 *   - one row lands on the survivor chain (author = survivor author,
 *     contributors = every merged author + the user), so pull retires the
 *     other chains (see `retiredChains` in pull.ts)
 *   - the other pull-managed local copies are removed
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest, recordPull, removePullEntry, unlinkSymlinks, type PulledEntry } from "./manifest.js";
import { detectAgentSkillsRoots } from "./agent-roots.js";
import { fanOutSymlinks, type QueryFn } from "./pull.js";
import { readCurrentSkillRow } from "./skill-org-publish.js";
import { listSkills, parseFrontmatter, renderFrontmatter, resolveSkillsRoot, type SkillFrontmatter } from "./skill-writer.js";
import { insertSkillRow } from "./skills-table.js";
import { extractJsonBlock } from "./gate-parser.js";
import { findAgentBin, runGate, type Agent } from "./gate-runner.js";
import { deriveProjectKey } from "../utils/repo-identity.js";
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
  /** Org table access; without it the merged row is not recorded. */
  query?: QueryFn;
  tableName?: string;
  workspaceId?: string;
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

/** Groups with two or more distinct authors, keyed by skill name. */
export function groupByName(skills: LocalSkill[]): Map<string, LocalSkill[]> {
  const groups = new Map<string, LocalSkill[]>();
  for (const s of skills) {
    const list = groups.get(s.name) ?? [];
    list.push(s);
    groups.set(s.name, list);
  }
  for (const [name, list] of groups) {
    if (new Set(list.map(s => s.author)).size < 2) groups.delete(name);
  }
  return groups;
}

export function pickSurvivor(group: LocalSkill[], me: string): LocalSkill {
  return group.reduce((best, s) => {
    if (s.version > best.version) return s;
    if (s.version === best.version && s.author === me && best.author !== me) return s;
    return best;
  });
}

function unique(lists: string[][]): string[] {
  return Array.from(new Set(lists.flat().filter(Boolean)));
}

/** One candidate per author: the highest local version. */
function perAuthor(group: LocalSkill[]): LocalSkill[] {
  const best = new Map<string, LocalSkill>();
  for (const s of group) {
    const kept = best.get(s.author);
    if (!kept || s.version > kept.version) best.set(s.author, s);
  }
  return [...best.values()];
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

async function remoteVersion(opts: MergeAuthorsOptions, name: string, author: string): Promise<{ version: number; project: string; projectKey: string; install: "project" | "global"; scope: "me" | "team" } | null> {
  if (!opts.query || !opts.tableName) return null;
  const row = await readCurrentSkillRow(opts.query, opts.tableName, name, author);
  if (!row) return null;
  return { version: row.version, project: row.project, projectKey: row.projectKey, install: row.install, scope: row.scope };
}

async function mergeGroup(name: string, group: LocalSkill[], opts: MergeAuthorsOptions, merge: MergeFn): Promise<DedupeEntry> {
  const me = opts.myUsername;
  const survivor = pickSurvivor(group, me);
  const candidates = perAuthor(group);
  const authors = candidates.map(c => c.author).sort();
  const base: Omit<DedupeEntry, "action" | "reason"> = {
    dirName: survivor.dirName, name, path: join(survivor.root, survivor.dirName), dryRun: opts.dryRun ?? false,
  };
  if (opts.dryRun) {
    return { ...base, action: "merged", reason: `authors ${authors.join(", ")} -> ${survivor.author} v${survivor.version + 1}` };
  }
  let verdict: MergeVerdict | null;
  try {
    verdict = await merge({
      name,
      candidates: candidates.map(c => ({
        author: c.author, version: c.version, description: c.description, trigger: c.trigger, body: c.body,
      })),
    });
  } catch (err: any) {
    return { ...base, action: "failed", reason: `merge: ${err?.message ?? err}` };
  }
  if (!verdict) return { ...base, action: "failed", reason: "merge: no usable verdict" };
  if (verdict.verdict === "DISTINCT") return { ...base, action: "kept", reason: "distinct skills" };

  const remote = await remoteVersion(opts, name, survivor.author).catch(() => null);
  const version = Math.max(survivor.version, remote?.version ?? 0) + 1;
  const now = (opts.now ?? (() => new Date().toISOString()))();
  const merged: MergedSkill = {
    name,
    author: survivor.author,
    contributors: unique([[survivor.author], ...group.map(s => s.contributors.length ? s.contributors : [s.author]), [me]]),
    version,
    description: verdict.description ?? survivor.description,
    trigger: verdict.trigger ?? survivor.trigger,
    body: verdict.body!,
    sourceSessions: unique(group.map(s => s.sourceSessions)),
    createdByAgent: survivor.createdByAgent,
    createdAt: survivor.createdAt ?? now,
    updatedAt: now,
  };

  try {
    const slots = targetSlots(group, me, opts.cwd);
    const written = slots.map(slot => ({ ...slot, file: writeSlot(slot.root, merged) }));
    for (const s of group) {
      if (s.dirName !== name && s.entry) removeCopy(s);
    }
    for (const w of written) {
      if (survivor.author === me) continue;
      const symlinks = w.install === "global" ? fanOutSymlinks(join(w.root, name), name, detectAgentSkillsRoots(w.root)) : [];
      recordPull({
        dirName: name, name, rawName: name, author: survivor.author,
        projectKey: remote?.projectKey ?? survivor.entry?.projectKey ?? "",
        remoteVersion: version, install: w.install, installRoot: w.root, pulledAt: now, symlinks,
      });
    }
    if (opts.query && opts.tableName && opts.workspaceId) {
      const derived = deriveProjectKey(opts.cwd);
      await insertSkillRow({
        query: opts.query,
        tableName: opts.tableName,
        workspaceId: opts.workspaceId,
        name,
        project: remote?.project ?? derived.project,
        projectKey: remote?.projectKey ?? survivor.entry?.projectKey ?? derived.key,
        localPath: written[0].file,
        install: remote?.install ?? written[0].install,
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
    }
    return {
      ...base, path: written[0].file, dirName: name,
      action: "merged", reason: `authors ${authors.join(", ")} -> ${survivor.author} v${version}${opts.query ? "" : " (local only)"}`,
    };
  } catch (err: any) {
    return { ...base, action: "failed", reason: `merged: ${err?.message ?? err}` };
  }
}

export async function mergeAuthorDuplicates(opts: MergeAuthorsOptions): Promise<DedupeEntry[]> {
  const merge = opts.merge ?? agentMerge(opts.agent ?? pickMergeAgent());
  const out: DedupeEntry[] = [];
  for (const [name, group] of groupByName(listLocalSkills(opts.cwd))) {
    out.push(await mergeGroup(name, group, opts, merge));
  }
  return out;
}
