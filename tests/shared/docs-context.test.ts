import { describe, expect, it } from "vitest";
import { docsWikiContextNote } from "../../src/docs/docs-context.js";

describe("docsWikiContextNote (SessionStart wiki hint)", () => {
  it("renders the note when the registry authorizes this exact (org, project)", () => {
    const seen: Array<[string, string]> = [];
    const note = docsWikiContextNote("org-a", "proj-1", (o, p) => {
      seen.push([o, p]);
      return true;
    });
    expect(seen).toEqual([["org-a", "proj-1"]]); // exact key, no ambient state
    expect(note).toContain("DOCS WIKI");
    expect(note).toContain("~/.deeplake/memory/docs/find/");
    // The benchmark-mandated framing: on-demand orientation, never wiki-first.
    expect(note).toContain("Confirm every claim about code behavior against the source files");
    expect(note).not.toMatch(/wiki (page )?first/i);
    // Edge-case honesty: the corpus can lag (first generation running,
    // refresh pending) — the agent must be told source beats wiki.
    expect(note).toContain("incomplete or lag behind the code");
    expect(note).toContain("trust the source");
    expect(note.startsWith("\n\n")).toBe(true); // appends cleanly after graphNote
  });

  it("returns '' when the repo has not opted in", () => {
    expect(docsWikiContextNote("org-a", "proj-1", () => false)).toBe("");
  });

  it("fail-closed: a throwing registry read yields '' — never breaks SessionStart", () => {
    expect(docsWikiContextNote("org-a", "proj-1", () => { throw new Error("corrupt registry"); })).toBe("");
  });
});
