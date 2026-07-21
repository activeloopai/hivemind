/**
 * Docs onboarding — the ONE conversation where the user consents to LLM spend.
 *
 * Runs from `graph init` and from the first interactive `docs sync`. Two
 * chained questions, both defaulting to NO:
 *
 *   project root: <resolved root> (git repository, org: <name>)
 *   1. "Generate wiki docs now? (~N pages, one-time LLM cost)"
 *   2. (only if 1 = yes) "Keep them automatically in sync on every commit?"
 *
 * Guarantees (the anti-false-positive contract):
 *   - NEVER prompts without a human: no TTY → no questions, no spend.
 *   - No git → no questions at all (auto sync is commit-driven; there is
 *     nothing to react to), just the manual hint.
 *   - Every ambiguity resolves to NO: Enter, EOF, garbage input.
 *   - Saying yes to auto records the consent in the per-(org, project)
 *     registry — the only thing the post-commit trigger ever consults.
 */

import { createInterface } from "node:readline";
import { setAuto } from "./auto-registry.js";
import { selectWikiGroups } from "./wiki-generate.js";
import { detectAvailableAgents } from "./refresh-llm.js";
import { getDocsLlmAgent, setDocsLlmAgent } from "../user-config.js";
import type { GraphSnapshot } from "../graph/types.js";

export interface OnboardingIo {
  /** Ask one y/N question; resolves the raw answer. Injectable for tests. */
  ask: (question: string) => Promise<string>;
  say: (line: string) => void;
  /** Is a human attached? (default: process.stdin.isTTY && stdout.isTTY) */
  interactive: boolean;
}

export function defaultIo(): OnboardingIo {
  return {
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    say: (line) => console.log(line),
    ask: (question) =>
      new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
          rl.close();
          resolve(answer);
        });
      }),
  };
}

const YES = /^y(es)?$/i;

export interface OnboardingArgs {
  /** Resolved project root (git toplevel when git, else cwd). */
  root: string;
  isGitRepo: boolean;
  orgId: string;
  orgName?: string;
  /** Repo project key (deriveProjectKey(root).key). */
  project: string;
  /** Current snapshot, for the honest page estimate. Null → estimate unknown. */
  snap: GraphSnapshot | null;
  io?: OnboardingIo;
  /** Installed host agents (injectable for tests). Default: real detection. */
  detectAgents?: () => string[];
  /** Read the persisted docs agent (injectable). Default: config.json. */
  getAgent?: () => string | undefined;
  /** Persist the chosen docs agent (injectable). Default: config.json. */
  setAgent?: (agent: string) => void;
}

export interface OnboardingResult {
  /** User consented to generating the corpus now. */
  generate: boolean;
  /** User consented to automatic per-commit sync (recorded in the registry). */
  auto: boolean;
  asked: boolean;
}

export const STATUS_HINT = "See sync status anytime with: hivemind docs list";

/** Run the two-question consent flow. Fail-closed on every branch. */
export async function runDocsOnboarding(args: OnboardingArgs): Promise<OnboardingResult> {
  const io = args.io ?? defaultIo();
  const rootLine = `project root: ${args.root} (${args.isGitRepo ? "git repository" : "no git — current folder"}${args.orgName ? `, org: ${args.orgName}` : ""})`;

  if (!args.isGitRepo) {
    io.say(rootLine);
    io.say("Auto doc sync requires a git repository (it reacts to commits).");
    io.say("Docs can still be generated manually with: hivemind docs wiki");
    return { generate: false, auto: false, asked: false };
  }
  if (!io.interactive) {
    // Detached / hook / piped run: no human, no questions, no spend.
    return { generate: false, auto: false, asked: false };
  }

  io.say(rootLine);
  const pages = args.snap ? selectWikiGroups(args.snap).length : null;
  const estimate = pages !== null ? `~${pages} pages, one-time LLM cost` : "one-time LLM cost";
  const genAnswer = await io.ask(`Generate wiki docs for this repo now? (${estimate}) [y/N] `);
  if (!YES.test(genAnswer.trim())) {
    io.say("Skipped. Generate later with: hivemind docs wiki");
    io.say(STATUS_HINT);
    return { generate: false, auto: false, asked: true };
  }

  // Agent choice: only worth asking when more than one host CLI is installed
  // AND nothing is pinned yet. One agent → no choice; already pinned → respect
  // it silently. The chosen agent is persisted globally in config.json.
  const getAgent = args.getAgent ?? getDocsLlmAgent;
  const setAgent = args.setAgent ?? setDocsLlmAgent;
  const detectAgents = args.detectAgents ?? detectAvailableAgents;
  if (!getAgent()) {
    const available = detectAgents();
    if (available.length > 1) {
      const raw = (await io.ask(
        `Which agent should write the docs? [${available.join("/")}] (default: ${available[0]}) `,
      )).trim().toLowerCase();
      const chosen = available.includes(raw) ? raw : available[0];
      setAgent(chosen);
      io.say(`Docs will be authored by: ${chosen}. Change with: hivemind docs agent <name>`);
    }
  }

  const autoAnswer = await io.ask(
    "Keep them automatically in sync on every commit? Docs stay fresh but this consumes more LLM tokens over time. [y/N] ",
  );
  const auto = YES.test(autoAnswer.trim());
  if (auto) {
    setAuto({ orgId: args.orgId, orgName: args.orgName, project: args.project, path: args.root, auto: true });
    io.say(`Auto sync ON for this repo on org ${args.orgName ?? args.orgId}. Turn off with: hivemind docs auto off`);
  } else {
    io.say("Manual mode: sync when you want with: hivemind docs sync");
  }
  io.say(STATUS_HINT);
  return { generate: true, auto, asked: true };
}
