/**
 * Event-driven, user-side firing of the SkillOpt loop. Replaces the old weekly
 * SessionStart time-throttle entirely — firing is driven by REAL bad-skill signal.
 *
 * Flow (all hook-side, never blocking):
 *   PreToolUse(Skill, ORG skill only) → markSkillPending(session, X)   — opens a K-message
 *                                                                         judgment window for X
 *   UserPromptSubmit (the reaction)   → runEventTrigger(session, prompt) — spawn the worker to
 *                                                                          judge X against the reaction
 *
 * The spawned worker judges X's window (the LLM is the only evaluator — a regex can't
 * catch "you fucked up again") with the just-submitted reaction passed in, and improves X
 * immediately if it failed. Each org-skill call opens a window of K user messages
 * (default 3); the worker is fired on each until the budget is spent. A session that never
 * invokes an org skill never opens a window, so it never spawns anything — zero overhead.
 *
 * Opt-out: HIVEMIND_SKILLOPT_DISABLED=1.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log as _log } from "../utils/debug.js";
import { getStateDir } from "./state-dir.js";
import { splitOrgSkill } from "./skill-invocations.js";
import { loadManifest } from "./manifest.js";
import { loadConfig } from "../config.js";
import { SKILLOPT_ENV } from "./skillopt-env.js";

const log = (m: string) => _log("skillopt-trigger", m);

/** Creds check — same as the worker (loadConfig accepts file OR env creds). */
function defaultHasCreds(): boolean {
  try {
    const config = loadConfig();
    return Boolean(config && ((config.storage?.kind ?? "deeplake") !== "deeplake" || config.token));
  } catch { return false; }
}

/** How many user messages after a skill call to keep judging it (the reaction may not be
 *  the immediate next turn — "clarify, then push back"). Default 3, env-tunable. */
export const DEFAULT_JUDGE_WINDOW = 3;
export function judgeWindow(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env[SKILLOPT_ENV.JUDGE_WINDOW]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_JUDGE_WINDOW;
}

/** Reaction text passed to the worker via env — bounded so a pasted log can't bloat argv. */
const MAX_REACTION = 8000;

export interface PendingSkill { skill: string; budget: number; toolUseId?: string }

/** Authoritative org-skill check: is this ref actually a PULLED org skill (in the manifest),
 *  not just a LOCAL skill that happens to be named `name--author`? Without this, a local skill
 *  could shadow an org-table row of the same name and get the shared org skill edited. */
function defaultIsOrgSkill(skillRef: string): boolean {
  try { return loadManifest().entries.some((e) => e.dirName === skillRef); } catch { return false; }
}

/**
 * Pending state is stored PER SESSION (one small file each), not a single shared map.
 * Two concurrent sessions arming/reacting touch DIFFERENT files, so neither can clobber
 * the other's pending entry (the load-modify-overwrite race codex flagged on the shared
 * map). A session id is sanitised to a safe filename.
 */
function pendingFile(sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);
  return path.join(getStateDir(), "skillopt", "pending", `${safe}.json`);
}

export interface PendingStore {
  load: (sessionId: string) => PendingSkill | null;
  save: (sessionId: string, p: PendingSkill | null) => void; // null clears the session
}

const fileStore: PendingStore = {
  load(sessionId) {
    try { return JSON.parse(fs.readFileSync(pendingFile(sessionId), "utf8")) as PendingSkill; } catch { return null; }
  },
  save(sessionId, p) {
    try {
      const f = pendingFile(sessionId);
      if (p === null) { try { fs.unlinkSync(f); } catch { /* already gone */ } return; }
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const tmp = `${f}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(p));
      fs.renameSync(tmp, f);
    } catch { /* swallow — hooks must never fail */ }
  },
};

export interface MarkDeps {
  store?: PendingStore;
  env?: NodeJS.ProcessEnv;
  isOrgSkill?: (skillRef: string) => boolean; // default: present in the pull manifest
}

/**
 * Open (or reset) a K-message judgment window for an ORG skill the session just
 * invoked. Called from PreToolUse on `Skill` tool_use. Org skills only — a bare local
 * skill or plugin (`hivemind:...`) is ignored. The newest org-skill call supersedes the
 * pending one for that session (the next reaction is to the most recent skill). Returns
 * true if a window is now open.
 */
export function markSkillPending(sessionId: string, skillRef: string, toolUseId?: string, deps: MarkDeps = {}): boolean {
  if (!sessionId || !skillRef) return false;
  if (!splitOrgSkill(skillRef)) return false; // wrong shape → not an org skill
  if (!(deps.isOrgSkill ?? defaultIsOrgSkill)(skillRef)) return false; // not a PULLED org skill → don't arm
  (deps.store ?? fileStore).save(sessionId, { skill: skillRef, budget: judgeWindow(deps.env ?? process.env), toolUseId });
  return true;
}

export interface TriggerDeps {
  env?: NodeJS.ProcessEnv;
  store?: PendingStore;
  spawnWorker?: (sessionId: string, skill: string, reaction: string, toolUseId: string | undefined, agent?: string) => void;
  canFire?: () => boolean;
}

export interface FireResult {
  fired: boolean;
  reason?: "disabled" | "in-worker" | "no-skill" | "no-creds" | "spawned";
}

/**
 * On a user reaction, fire the worker to judge the session's pending skill against it.
 * Non-blocking. No pending skill → no-op (the common case). Decrements the message budget
 * and closes the window when it's spent.
 */
export function runEventTrigger(
  sessionId: string,
  reaction: string,
  opts: { agent?: string; deps?: TriggerDeps } = {},
): FireResult {
  const deps = opts.deps ?? {};
  const env = deps.env ?? process.env;
  if (env[SKILLOPT_ENV.DISABLED] === "1") return { fired: false, reason: "disabled" };
  if (env[SKILLOPT_ENV.WORKER] === "1") return { fired: false, reason: "in-worker" }; // recursion guard
  if (!sessionId) return { fired: false, reason: "no-skill" };
  const store = deps.store ?? fileStore;
  const p = store.load(sessionId);
  if (!p) return { fired: false, reason: "no-skill" }; // no org skill awaiting judgment
  if (!(deps.canFire ?? defaultHasCreds)()) return { fired: false, reason: "no-creds" };

  // Spend one message of this session's budget; close the window when exhausted. Only
  // this session's file is touched, so a concurrent session can't be clobbered.
  store.save(sessionId, p.budget - 1 <= 0 ? null : { ...p, budget: p.budget - 1 });

  (deps.spawnWorker ?? spawnWorker)(sessionId, p.skill, reaction ?? "", p.toolUseId, opts.agent);
  return { fired: true, reason: "spawned" };
}

/** Spawn the detached targeted worker (judge skill X against the reaction). Swallowed. */
function spawnWorker(sessionId: string, skill: string, reaction: string, toolUseId?: string, agent?: string): void {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const entry = path.join(here, "skillopt-worker.js"); // bundled alongside this module
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: "ignore",
      // SW_HIDE: libuv applies it alongside detached. No-op on POSIX.
      windowsHide: true,
      env: {
        ...process.env,
        [SKILLOPT_ENV.WORKER]: "1",
        [SKILLOPT_ENV.SESSION]: sessionId,
        [SKILLOPT_ENV.SKILL]: skill,
        [SKILLOPT_ENV.REACTION]: (reaction ?? "").slice(0, MAX_REACTION),
        ...(toolUseId ? { [SKILLOPT_ENV.TOOL_USE_ID]: toolUseId } : {}),
        ...(agent ? { [SKILLOPT_ENV.AGENT]: agent } : {}),
      },
    });
    child.unref();
    log(`spawned skillopt worker for ${skill} in ${sessionId}${agent ? ` (agent=${agent})` : ""}`);
  } catch (e: unknown) {
    log(`spawn failed (swallowed): ${(e as Error)?.message ?? e}`);
  }
}
