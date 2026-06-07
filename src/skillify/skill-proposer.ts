/**
 * Proposer — the engine's "reflect → edit" step (the paper's backward pass).
 * Given a deficient skill's body + the concrete failures the detector confirmed,
 * the optimizer diagnoses the single recurring weakness and proposes a SMALL set
 * of structured edits, bounded by the edit budget ("textual learning rate"). The
 * protected slow-update region is off-limits. Edits are applied locally to produce
 * the candidate body — NOTHING is published here (publish is a separate, gated step).
 *
 * Runs on the user's agent via an injected ModelCall (default = claude sonnet),
 * so the reflect logic is unit-testable with zero real LLM calls.
 */
import { applyEdits, selectEdits, SU_START, SU_END, type Edit, type EditOp } from "./skill-edits.js";
import { claudeModel, type ModelCall } from "./claude-model.js";

export interface Proposal {
  edits: Edit[];       // edits kept after the budget
  editedBody: string;  // skill body after applying them
  report: string[];    // per-edit OK/SKIP log
  changed: boolean;    // did anything actually change?
}

export interface ProposeConfig {
  editBudget?: number;     // max edits to keep (default 3)
  model?: ModelCall;       // injected; default = claude sonnet
  priorEdits?: string[];   // meta-skill: edits already tried for this skill (don't repeat)
}

const SYSTEM =
  "You improve an engineering SKILL document that produced repeated, confirmed " +
  "failures. Work in two steps: (1) diagnose the SINGLE recurring weakness — the " +
  "specific thing the doc told the agent to do, or failed to tell it, that caused " +
  "the pushback; (2) propose a SMALL set of structured edits that fix exactly that.\n" +
  "Every edit MUST be:\n" +
  "- CONCRETE and OPERATIONAL: a specific rule, check, command, or step the agent " +
  "can follow — never vague advice ('be careful', 'communicate clearly').\n" +
  "- PLACED WHERE IT FIRES: anchor it to the RELEVANT existing section " +
  "(insert_after that heading), or REPLACE the weak existing instruction that " +
  "allowed the failure. Do NOT just append a paragraph at the end of a long doc — " +
  "that gets skipped.\n" +
  "- TRACEABLE: each edit must directly prevent a specific failure listed below.\n" +
  "Prefer strengthening/replacing an existing instruction over adding new text. Do " +
  `NOT rewrite the whole doc, and do NOT touch anything between ${SU_START} and ` +
  `${SU_END}. Reply with ONLY a JSON array of edits, each: {"op":"append|` +
  'insert_after|replace|delete","target":"<exact existing text to anchor on; ' +
  'required for insert_after/replace/delete>","content":"<new text; required for ' +
  'append/insert_after/replace>"}. Prefer the smallest change that fixes the weakness.';

function buildUserPrompt(body: string, failures: string[], priorEdits: string[]): string {
  const cases = failures.slice(0, 8).map((f, i) => `${i + 1}. ${f}`).join("\n");
  const prior = priorEdits.length
    ? `\n\nALREADY TRIED for this skill on earlier runs (do NOT repeat these — propose something different, or nothing):\n${priorEdits.slice(0, 12).map((p) => `- ${p}`).join("\n")}`
    : "";
  return `CURRENT SKILL:\n${body}\n\nCONFIRMED FAILURES it produced (user pushed back AND a judge confirmed the task was not accomplished):\n${cases}${prior}\n\nFirst name the single recurring weakness in one line, then output the edits that anchor the fix into the relevant existing section. JSON array only.`;
}

const OPS = new Set<EditOp>(["append", "insert_after", "replace", "delete"]);

/** Tolerant parse of a JSON array of edits (handles ```fences / surrounding prose). */
export function parseEdits(raw: string): Edit[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a === -1 || b <= a) return [];
  let arr: unknown;
  try { arr = JSON.parse(s.slice(a, b + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: Edit[] = [];
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const op = (e as { op?: unknown }).op;
    if (typeof op !== "string" || !OPS.has(op as EditOp)) continue;
    const target = (e as { target?: unknown }).target;
    const content = (e as { content?: unknown }).content;
    out.push({
      op: op as EditOp,
      ...(typeof target === "string" ? { target } : {}),
      ...(typeof content === "string" ? { content } : {}),
    });
  }
  return out;
}

export async function proposeSkillEdit(
  skillBody: string,
  failures: string[],
  cfg: ProposeConfig = {},
): Promise<Proposal> {
  const budget = cfg.editBudget ?? 3;
  const model = cfg.model ?? claudeModel("sonnet");
  let raw: string;
  try {
    raw = await model(SYSTEM, buildUserPrompt(skillBody, failures, cfg.priorEdits ?? []));
  } catch {
    return { edits: [], editedBody: skillBody, report: ["proposer model call failed"], changed: false };
  }
  const edits = selectEdits(parseEdits(raw), budget);
  const { skill, report, applied } = applyEdits(skillBody, edits);
  return { edits, editedBody: skill, report, changed: applied > 0 };
}
