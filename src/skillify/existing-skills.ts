/**
 * Build the "existing skills" block the gate prompt sees, from both the
 * project-local skills root (`<cwd>/.claude/skills`) and the user-global
 * one (`~/.claude/skills`).
 *
 * Why both roots: the autopull lands pulled skills under the global root
 * regardless of scope-config, while the worker used to read only the
 * project root. That asymmetry meant the gate was making KEEP/MERGE
 * decisions blind to skills the user already had globally — the root
 * cause of cross-author duplicates (e.g. two near-identical "standup"
 * skills mined a few days apart because the gate never saw the first).
 *
 * Cross-author MERGE policy (issue #118): MERGE is now allowed on any
 * skill in the block, including ones authored by other teammates. When
 * the editor is not the original author, the worker's recordToDeeplake
 * path auto-promotes `scope` from "me" to "team" and appends the editor
 * to the `contributors` array on the v+1 row. The gate prompt declares
 * this so the LLM understands the "promotion" cost is real and only
 * picks cross-author MERGE when the new evidence genuinely extends the
 * existing skill (rather than as a default).
 */

import { listSkills, resolveSkillsRoot, parseFrontmatter } from "./skill-writer.js";

export interface TaggedSkill {
  /** Name the gate sees and answers with. */
  name: string;
  /** Directory under the source root. Differs from `name` for a pulled `<name>--<me>` copy. */
  dirName: string;
  body: string;
  source: "project" | "global";
  /**
   * Author parsed from the SKILL.md frontmatter. Undefined for legacy
   * files that pre-date the `author` field — the worker treats those as
   * "owned by whoever's about to edit" (same-author semantics) so a
   * legacy local file isn't accidentally treated as cross-author.
   */
  author?: string;
  version: number;
}

export interface MergeTarget {
  install: "project" | "global";
  skillsRoot: string;
  dirName: string;
}

export interface ExistingSkillsBlock {
  /** Names eligible as MERGE targets. Empty when no skills exist. */
  mergeTargetNames: string[];
  /** Where each MERGE-eligible name lives on disk. */
  mergeTargets: Record<string, MergeTarget>;
  /** Rendered block of all skills (project + global) for the gate prompt. */
  block: string;
}

/**
 * Collect every existing skill the gate should know about, with its
 * source root + author tagged.
 *
 * `userName` lets the user's own pulled global copy (`<name>--<me>`)
 * answer to its real `<name>`, so the gate continues that version chain
 * instead of starting a new v1 under the same name.
 *
 * Name collisions keep the higher version (a version only grows by a
 * merge, so higher = newer); a tie keeps the project copy, which the
 * user is presumed to be editing locally.
 */
export function listAllExistingSkills(cwd: string, userName?: string): TaggedSkill[] {
  const projectRoot = resolveSkillsRoot("project", cwd);
  const globalRoot = resolveSkillsRoot("global", cwd);
  const tag = (source: "project" | "global") => (s: { name: string; body: string }): TaggedSkill => {
    const parsed = parseFrontmatter(s.body);
    const author = typeof parsed?.fm.author === "string" && parsed.fm.author.length > 0
      ? parsed.fm.author
      : undefined;
    const version = typeof parsed?.fm.version === "number" ? parsed.fm.version : 1;
    const fmName = typeof parsed?.fm.name === "string" ? parsed.fm.name : "";
    const ownPulledCopy = source === "global" && !!userName && author === userName
      && s.name === `${fmName}--${userName}`;
    return { name: ownPulledCopy ? fmName : s.name, dirName: s.name, body: s.body, source, author, version };
  };
  const tagged: TaggedSkill[] = [
    ...listSkills(projectRoot).map(tag("project")),
    ...listSkills(globalRoot).map(tag("global")),
  ];
  const byName = new Map<string, TaggedSkill>();
  for (const s of tagged) {
    const kept = byName.get(s.name);
    if (!kept || s.version > kept.version) byName.set(s.name, s);
  }
  return [...byName.values()];
}

/**
 * Render the gate-prompt block. `charCap` is the soft budget — once we
 * cross it, we emit a "[…N more omitted]" line and stop.
 *
 * MERGE eligibility: `[project]` skills, and `[global]` skills authored by
 * `userName`. A global skill from a teammate stays `[global, read-only]`:
 * the worker writes MERGEs into the user's own skills only, and a
 * teammate's chain continues on the teammate's machine.
 *
 * `mergeTargetNames` only includes skills whose bodies were actually
 * rendered into the prompt — otherwise the truncation tail leaks names
 * the LLM never saw the context for.
 */
export function renderExistingSkillsBlock(cwd: string, charCap: number, userName?: string): ExistingSkillsBlock {
  const skills = listAllExistingSkills(cwd, userName);
  if (skills.length === 0) {
    return {
      mergeTargetNames: [],
      mergeTargets: {},
      block: "(no existing skills — MERGE is NOT a valid choice; pick KEEP or SKIP only)",
    };
  }
  let total = 0;
  const out: string[] = [];
  const mergeTargetNames: string[] = [];
  const mergeTargets: Record<string, MergeTarget> = {};
  for (const s of skills) {
    const mergeable = s.source === "project" || (!!userName && s.author === userName);
    const sourceTag = mergeable ? s.source : "global, read-only";
    const authorTag = s.author ? `, author=${s.author}` : "";
    const block = `--- existing skill [${sourceTag}${authorTag}]: ${s.name} ---\n${s.body}\n`;
    if (total + block.length > charCap) {
      out.push(`[…${skills.length - out.length} more existing skills omitted]`);
      break;
    }
    out.push(block);
    total += block.length;
    if (!mergeable) continue;
    mergeTargetNames.push(s.name);
    mergeTargets[s.name] = { install: s.source, skillsRoot: resolveSkillsRoot(s.source, cwd), dirName: s.dirName };
  }
  return { mergeTargetNames, mergeTargets, block: out.join("\n") };
}
