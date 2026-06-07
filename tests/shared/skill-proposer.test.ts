import { describe, it, expect, vi } from "vitest";
import { parseEdits, proposeSkillEdit } from "../../src/skillify/skill-proposer.js";

describe("parseEdits", () => {
  it("parses a JSON array, tolerating fences/prose, dropping invalid ops + non-objects", () => {
    const raw = "Sure:\n```json\n[" +
      '{"op":"replace","target":"mock the client","content":"NEVER mock"},' +
      '{"op":"bogus","target":"x"},' +              // invalid op → dropped
      '"nope",' +                                    // non-object → dropped
      '{"op":"append","content":"verify via API"}' +
      "]\n```";
    const edits = parseEdits(raw);
    expect(edits).toEqual([
      { op: "replace", target: "mock the client", content: "NEVER mock" },
      { op: "append", content: "verify via API" },
    ]);
  });
  it("returns [] when there's no array", () => {
    expect(parseEdits("the model refused")).toEqual([]);
  });
  it("extracts the edits array past a weakness line that itself contains brackets", () => {
    const raw = 'Weakness: the doc never says to verify [the real client] before reporting.\n' +
      '[{"op":"append","content":"verify via API"}]';
    expect(parseEdits(raw)).toEqual([{ op: "append", content: "verify via API" }]);
  });
  it("falls back to first-[..last-] when content holds an unbalanced bracket", () => {
    // the inner "]" defeats the balanced back-scan; the fallback still parses it
    const raw = '[{"op":"append","content":"use arr] carefully"}]';
    expect(parseEdits(raw)).toEqual([{ op: "append", content: "use arr] carefully" }]);
  });
});

describe("proposeSkillEdit", () => {
  const body = "## Rules\n1. mock the client\n2. skip flush";
  const failures = ["mocked the client so the test passes even when the event never sends"];

  it("applies the proposed edits to produce a candidate body", async () => {
    const model = vi.fn(async (_s: string, _u: string) =>
      '[{"op":"replace","target":"mock the client","content":"NEVER mock — assert on the real client"}]');
    const p = await proposeSkillEdit(body, failures, { model });
    expect(p.changed).toBe(true);
    expect(p.editedBody).toContain("NEVER mock — assert on the real client");
    // the optimizer is told to diagnose the recurring weakness + emit JSON edits
    expect(model.mock.calls[0][0]).toMatch(/recurring weakness/i);
    expect(model.mock.calls[0][1]).toContain("CONFIRMED FAILURES");
  });

  it("steers toward concrete, anchored edits — not append-at-end", async () => {
    const model = vi.fn(async (_s: string, _u: string) =>
      '[{"op":"insert_after","target":"## Rules","content":"0. verify on the real client first"}]');
    const p = await proposeSkillEdit(body, failures, { model });
    expect(p.changed).toBe(true);
    const system = model.mock.calls[0][0];
    expect(system).toContain("anchor it to the RELEVANT existing section");
    expect(system).toContain("CONCRETE and OPERATIONAL");
    expect(system).toContain("REPLACE the weak existing instruction");
    expect(model.mock.calls[0][1]).toContain("First name the single recurring weakness in one line");
  });

  it("includes prior edits so the proposer doesn't repeat them", async () => {
    const model = vi.fn(async (_s: string, _u: string) => "[]");
    await proposeSkillEdit(body, failures, { model, priorEdits: ["append: verify via API"] });
    const user = model.mock.calls[0][1];
    expect(user).toContain("ALREADY TRIED");
    expect(user).toContain("append: verify via API");
  });

  it("enforces the edit budget", async () => {
    const model = vi.fn(async (_s: string, _u: string) =>
      '[{"op":"append","content":"a"},{"op":"append","content":"b"},{"op":"append","content":"c"}]');
    const p = await proposeSkillEdit(body, failures, { model, editBudget: 1 });
    expect(p.edits).toHaveLength(1);
    expect(p.editedBody).toContain("\na");
    expect(p.editedBody).not.toContain("\nb");
  });

  it("is a no-op when the model fails or proposes nothing", async () => {
    expect((await proposeSkillEdit(body, failures, { model: vi.fn(async () => { throw new Error("x"); }) })).changed).toBe(false);
    expect((await proposeSkillEdit(body, failures, { model: vi.fn(async (_s: string, _u: string) => "no edits") })).changed).toBe(false);
  });
});
