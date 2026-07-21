import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDocsOnboarding, STATUS_HINT, type OnboardingIo } from "../../src/docs/onboarding.js";
import { isAutoEnabled } from "../../src/docs/auto-registry.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

function node(id: string, file: string): GraphNode {
  return { id, label: id, kind: "function", source_file: file, source_location: "L1", language: "typescript", exported: true };
}
const SNAP: GraphSnapshot = { nodes: [node("pkg/a/x.ts:f:function", "pkg/a/x.ts"), node("pkg/b/y.ts:g:function", "pkg/b/y.ts")], links: [] } as unknown as GraphSnapshot;

function io(answers: string[], interactive = true): { io: OnboardingIo; said: string[]; asked: string[] } {
  const said: string[] = [];
  const asked: string[] = [];
  let i = 0;
  return {
    said, asked,
    io: { interactive, say: (l) => said.push(l), ask: async (q) => { asked.push(q); return answers[i++] ?? ""; } },
  };
}

describe("runDocsOnboarding (the one consent moment — fail-closed everywhere)", () => {
  let dir: string;
  let regFile: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "docs-onb-"));
    regFile = join(dir, "docs-auto.json");
    process.env.HIVEMIND_DOCS_AUTO_FILE = regFile; // registry file isolation
  });
  afterEach(() => { delete process.env.HIVEMIND_DOCS_AUTO_FILE; rmSync(dir, { recursive: true, force: true }); });

  // detectAgents: () => [] opts these tests out of the (separate) "which agent
  // writes the docs?" question — that gate is covered in docs-llm-agent.test.ts.
  // Without this, a test host with >1 agent CLI installed would see the extra
  // question consume an answer meant for the auto prompt.
  const base = { root: "/work/repo", isGitRepo: true, orgId: "org-a", orgName: "acme", project: "proj-1", snap: SNAP, detectAgents: () => [] };

  it("yes + yes: real page estimate shown, registry entry written for (org, project)", async () => {
    const t = io(["y", "yes"]);
    const r = await runDocsOnboarding({ ...base, io: t.io });
    expect(r).toEqual({ generate: true, auto: true, asked: true });
    expect(t.asked[0]).toContain("~2 pages");                 // estimate from the snapshot
    expect(t.said[0]).toContain("/work/repo");                // root shown first
    expect(t.said[0]).toContain("acme");                      // org shown
    expect(isAutoEnabled("org-a", "proj-1", regFile)).toBe(true);
    expect(t.said.join("\n")).toContain(STATUS_HINT);
  });

  it("yes + no: generate consented, auto NOT recorded", async () => {
    const t = io(["y", "n"]);
    const r = await runDocsOnboarding({ ...base, io: t.io });
    expect(r).toEqual({ generate: true, auto: false, asked: true });
    expect(isAutoEnabled("org-a", "proj-1", regFile)).toBe(false);
  });

  it("Enter (default) means NO — no second question, no registry write", async () => {
    const t = io([""]);
    const r = await runDocsOnboarding({ ...base, io: t.io });
    expect(r).toEqual({ generate: false, auto: false, asked: true });
    expect(t.asked).toHaveLength(1); // auto question never asked
    expect(isAutoEnabled("org-a", "proj-1", regFile)).toBe(false);
  });

  it("NO TTY: silent — zero questions, zero writes (the hook/detached case)", async () => {
    const t = io(["y", "y"], false);
    const r = await runDocsOnboarding({ ...base, io: t.io });
    expect(r).toEqual({ generate: false, auto: false, asked: false });
    expect(t.asked).toHaveLength(0);
    expect(isAutoEnabled("org-a", "proj-1", regFile)).toBe(false);
  });

  it("NO GIT: never asks (auto is commit-driven), prints the manual hint", async () => {
    const t = io(["y", "y"]);
    const r = await runDocsOnboarding({ ...base, isGitRepo: false, io: t.io });
    expect(r.asked).toBe(false);
    expect(t.asked).toHaveLength(0);
    expect(t.said.join("\n")).toContain("hivemind docs wiki");
  });

  it("garbage input resolves to NO", async () => {
    const t = io(["boh"]);
    const r = await runDocsOnboarding({ ...base, io: t.io });
    expect(r.generate).toBe(false);
  });
});
