import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Entry-point tests for the two hot-path hooks. runRecall (the shared body)
 * is tested in recall-run.test.ts; here we check each hook's own gates and
 * what it hands to runRecall / prints.
 */

const stdinMock = vi.fn();
const runRecallMock = vi.fn();
const enabledMock = vi.fn();
const pluginMock = vi.fn();
const cliGateMock = vi.fn();

vi.mock("../../../src/utils/stdin.js", () => ({ readStdin: () => stdinMock() }));
vi.mock("../../../src/dir-config.js", () => ({ isHivemindEnabled: (c: string) => enabledMock(c) }));
vi.mock("../../../src/utils/plugin-state.js", () => ({ isHivemindPluginEnabled: () => pluginMock() }));
vi.mock("../../../src/hooks/shared/capture-gate.js", () => ({ entrypointPassesOnlyCliGate: () => cliGateMock() }));
vi.mock("../../../src/hooks/shared/recall-run.js", () => ({
  runRecall: (...a: unknown[]) => runRecallMock(...a),
  emitAdditionalContext: (ev: string, ctx: string) => console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: ev, additionalContext: ctx } })),
}));

async function run(hook: "recall-on-failure" | "recall-on-prompt"): Promise<string[]> {
  const out: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((s: string) => { out.push(s); });
  vi.resetModules();
  if (hook === "recall-on-failure") await import("../../../src/hooks/recall-on-failure.js");
  else await import("../../../src/hooks/recall-on-prompt.js");
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  spy.mockRestore();
  return out;
}

beforeEach(() => {
  delete process.env.HIVEMIND_WIKI_WORKER;
  stdinMock.mockReset();
  runRecallMock.mockReset().mockReturnValue("CTX");
  enabledMock.mockReset().mockReturnValue(true);
  pluginMock.mockReset().mockReturnValue(true);
  cliGateMock.mockReset().mockReturnValue(true);
});

describe("recall-on-failure hook", () => {
  const payload = { session_id: "s", cwd: "/r/api", tool_name: "Bash", error: "Exit code 1\nError: connect ECONNREFUSED 127.0.0.1:5432" };

  it("passes the distilled error to runRecall and emits PostToolUseFailure context", async () => {
    stdinMock.mockResolvedValue(payload);
    const out = await run("recall-on-failure");
    const arg = runRecallMock.mock.calls[0][0];
    expect(arg).toMatchObject({ trigger: "failure", sessionId: "s", cwd: "/r/api", gate: "Bash" });
    expect(arg.query).toBe("Error: connect ECONNREFUSED port5432");
    expect(arg.dedupeKey).toMatch(/^f:/);
    expect(JSON.parse(out[0])).toEqual({ hookSpecificOutput: { hookEventName: "PostToolUseFailure", additionalContext: "CTX" } });
  });

  it("skips noise failures without a lookup", async () => {
    stdinMock.mockResolvedValue({ ...payload, tool_name: "Edit" });
    expect(await run("recall-on-failure")).toEqual([]);
    expect(runRecallMock).not.toHaveBeenCalled();
  });

  it("prints nothing when runRecall returns null (shadow / miss)", async () => {
    stdinMock.mockResolvedValue(payload);
    runRecallMock.mockReturnValue(null);
    expect(await run("recall-on-failure")).toEqual([]);
  });

  it.each([
    ["plugin disabled", () => pluginMock.mockReturnValue(false)],
    ["CLI-only gate", () => cliGateMock.mockReturnValue(false)],
    [".hivemind collect:false", () => enabledMock.mockReturnValue(false)],
    ["nested wiki worker", () => { process.env.HIVEMIND_WIKI_WORKER = "1"; }],
  ])("does nothing when %s", async (_n, setup) => {
    stdinMock.mockResolvedValue(payload);
    setup();
    expect(await run("recall-on-failure")).toEqual([]);
    expect(runRecallMock).not.toHaveBeenCalled();
  });

  it("swallows bad stdin", async () => {
    stdinMock.mockRejectedValue(new Error("bad json"));
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    expect(await run("recall-on-failure")).toEqual([]);
    expect(exit).toHaveBeenCalledWith(0);
    exit.mockRestore();
  });
});

describe("recall-on-prompt hook", () => {
  it("looks up substantive prompts and emits UserPromptSubmit context", async () => {
    stdinMock.mockResolvedValue({ session_id: "s", cwd: "/r", prompt: "why does the deploy fail with a timeout on the staging cluster" });
    const out = await run("recall-on-prompt");
    expect(runRecallMock.mock.calls[0][0]).toMatchObject({ trigger: "prompt", gate: "signal" });
    expect(JSON.parse(out[0]).hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
  });

  it("skips acks", async () => {
    stdinMock.mockResolvedValue({ session_id: "s", prompt: "ok go ahead" });
    expect(await run("recall-on-prompt")).toEqual([]);
    expect(runRecallMock).not.toHaveBeenCalled();
  });
});
