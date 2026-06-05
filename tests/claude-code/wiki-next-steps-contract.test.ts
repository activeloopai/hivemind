import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { WIKI_PROMPT_TEMPLATE as CLAUDE_TEMPLATE } from "../../src/hooks/spawn-wiki-worker.js";
import { WIKI_PROMPT_TEMPLATE as CODEX_TEMPLATE } from "../../src/hooks/codex/spawn-wiki-worker.js";
import { WIKI_PROMPT_TEMPLATE as CURSOR_TEMPLATE } from "../../src/hooks/cursor/spawn-wiki-worker.js";
import { WIKI_PROMPT_TEMPLATE as HERMES_TEMPLATE } from "../../src/hooks/hermes/spawn-wiki-worker.js";

/**
 * Contract lock-in for the `## Next Steps` instruction in the wiki-worker
 * prompt. This section is the sole source of the resume "pick up where you
 * left off" pointer, so over-generous wording here is exactly what produces
 * false-positive next steps in the SessionStart brief.
 *
 * The prompt lives in FIVE hand-maintained copies (claude / codex / cursor /
 * hermes, plus the pi extension which ships as raw TypeScript and is read at
 * the source level here). The intros differ slightly per agent, but the
 * `## Next Steps` block must stay byte-identical across all five — a copy
 * drifting back to looser wording (or, as pi originally did, omitting the
 * section entirely) silently reopens the false-positive path for that agent.
 * These tests guard both the contract and the cross-copy sync.
 */

// pi ships its prompt inline in a raw-TS extension that can't be imported and
// executed here, so lift the template literal from source — same approach as
// tests/pi/pi-extension-source.test.ts.
const PI_TEMPLATE = readFileSync(
  join(process.cwd(), "pi", "extension-source", "hivemind.ts"),
  "utf-8",
);

const TEMPLATES = {
  claude: CLAUDE_TEMPLATE,
  codex: CODEX_TEMPLATE,
  cursor: CURSOR_TEMPLATE,
  hermes: HERMES_TEMPLATE,
  pi: PI_TEMPLATE,
} as const;

/** Extract the body of the `## Next Steps` section (up to the next blank-line
 *  paragraph break / next `##` heading). The instruction is a single angle-
 *  bracketed line, so we capture from `## Next Steps` to the first following
 *  blank line. */
function nextStepsSection(template: string): string {
  const marker = "## Next Steps\n";
  const start = template.indexOf(marker);
  if (start === -1) return "";
  const after = start + marker.length;
  const end = template.indexOf("\n\n", after);
  return (end === -1 ? template.slice(after) : template.slice(after, end)).trim();
}

describe("wiki Next Steps prompt contract", () => {
  for (const [agent, template] of Object.entries(TEMPLATES)) {
    describe(`${agent} template`, () => {
      const section = nextStepsSection(template);

      it("has a non-empty ## Next Steps section", () => {
        expect(section.length).toBeGreaterThan(0);
      });

      it("fires on genuinely unfinished work (the primary positive trigger)", () => {
        // The dominant legitimate case is a session that ended mid-task. The
        // gate must require — not merely permit — a next step there, and must
        // NOT gate it behind a catastrophe ("substantial consequences") bar.
        expect(section).toMatch(/not finished and you MUST write/i);
        expect(section).toMatch(/mid-task/i);
        expect(section).toMatch(/never suppress a genuinely unfinished task/i);
      });

      it("treats the session's last messages as the strongest signal", () => {
        // Directly addresses the failure mode where the final message says the
        // work isn't done but no next step was emitted.
        expect(section).toMatch(/last messages are the strongest signal/i);
      });

      it("defaults to `none` only when the core work is finished", () => {
        expect(section).toMatch(/if the core work IS finished, default to exactly: none/i);
      });

      it("treats administrative wrap-up as already done", () => {
        expect(section).toMatch(/administrative wrap-up/i);
        expect(section).toMatch(/already done/i);
      });

      it("does not gate unfinished work behind a catastrophe bar", () => {
        // Regression guard for the over-tightened wording that suppressed real
        // next steps: the strict consequence test must apply ONLY to the
        // finished-work exception, never to unfinished work.
        expect(section).not.toMatch(/MISS SOMETHING IMPORTANT WITH SUBSTANTIAL CONSEQUENCES/);
      });
    });
  }

  it("keeps the ## Next Steps block byte-identical across all agent copies", () => {
    const sections = Object.values(TEMPLATES).map(nextStepsSection);
    const [reference, ...rest] = sections;
    for (const s of rest) {
      expect(s).toBe(reference);
    }
  });
});
