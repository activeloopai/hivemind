/**
 * Shared SkillOpt hook wiring, so every agent's PreToolUse / UserPromptSubmit hook
 * (claude + the codex/hermes/cursor forks) wires the event trigger with one call each
 * instead of copy-pasting the logic. Both are fully swallowed — they must NEVER affect
 * whether a tool runs or a prompt is captured.
 */
import { markSkillPending, runEventTrigger } from "../../skillify/skillopt-trigger.js";
import { pathToSkillRef } from "../../skillify/skill-invocations.js";
import { SKILLOPT_ENV } from "../../skillify/skillopt-env.js";

/**
 * Recover an org-skill ref from a tool call that LOADS a skill's SKILL.md — how agents without
 * a first-class `Skill` tool use skills: pi `read`s `.../skills/<dir>/SKILL.md` (structured
 * `path`), harnesses/codex/hermes SHELL a read of it (path inside `command`). The `<dir>` segment is the
 * ref. Returns null when it isn't a SKILL.md load. markSkillPending still gates the ref
 * (org-shape + manifest), so a bare/non-org dir is rejected there.
 */
export function skillRefFromSkillFileRead(toolName: string, toolInput: unknown): string | null {
  // read tool with a structured path (pi)
  if (/^read$/i.test(toolName)) return pathToSkillRef((toolInput as { path?: unknown })?.path);
  // shell tool with the path inside the command (codex Bash, hermes terminal)
  return pathToSkillRef((toolInput as { command?: unknown })?.command);
}

/**
 * PreToolUse: open a skill's K-message judgment window when the agent USES an org skill —
 * either via a first-class `Skill` tool (claude) or by reading its SKILL.md file (pi/codex).
 * Org-skill gating (shape + pull manifest) happens in markSkillPending.
 */
export function armSkillOptOnSkillUse(sessionId: string, toolName: string, toolInput: unknown, toolUseId?: string): void {
  try {
    if (process.env[SKILLOPT_ENV.DISABLED] === "1") return;
    let ref: string | null = null;
    if (toolName === "Skill") {
      const s = (toolInput as { skill?: unknown })?.skill;
      ref = typeof s === "string" ? s : null;
    } else {
      ref = skillRefFromSkillFileRead(toolName, toolInput); // pi/codex: read of …/skills/<ref>/SKILL.md
    }
    if (ref) markSkillPending(sessionId, ref, toolUseId);
  } catch { /* never break PreToolUse */ }
}

/**
 * UserPromptSubmit: the prompt is the user's reaction. If an org skill is awaiting
 * judgment for this session, fire the worker to judge it against this reaction (on the
 * user's own `agent`). No-op unless a window is open. Skips internal worker calls.
 */
export function reactSkillOpt(sessionId: string, prompt: string | undefined, agent: string): void {
  try {
    // Empty/whitespace prompt isn't a reaction — firing on it would spend the judgment
    // budget and spawn a worker with no signal.
    if (prompt === undefined || prompt.trim() === "" || process.env.HIVEMIND_WIKI_WORKER === "1") return;
    runEventTrigger(sessionId, prompt, { agent });
  } catch { /* never break capture */ }
}
