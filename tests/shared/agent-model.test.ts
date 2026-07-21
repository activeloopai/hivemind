import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { agentModel, detectScorerAgent } from "../../src/skillify/agent-model.js";

/** A fake child process that emits `stdout` then closes with `code`, and records argv. */
function fakeSpawn(stdout: string, code = 0) {
  const calls: Array<{ bin: string; args: string[]; env: Record<string, unknown> }> = [];
  const spawnImpl = (bin: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ bin, args, env: (opts.env as Record<string, unknown>) ?? {} });
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => void };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => { child.stdout.emit("data", stdout); child.emit("close", code); });
    return child as never;
  };
  return { spawnImpl, calls };
}
const argVal = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("agentModel — per-agent no-tools dispatch", () => {
  it("claude_code: empty --tools allow-list + strict MCP + --system-prompt, unwraps {result}", async () => {
    const { spawnImpl, calls } = fakeSpawn(JSON.stringify({ result: '{"success":0}' }));
    const out = await agentModel({ agent: "claude_code", role: "judge", bin: "/x/claude", spawnImpl })("SYS", "USER");
    const a = calls[0].args;
    expect(argVal(a, "--tools")).toBe("");          // NO tools (authoritative)
    expect(a).toContain("--strict-mcp-config");
    expect(argVal(a, "--system-prompt")).toBe("SYS");
    expect(argVal(a, "-p")).toBe("USER");
    expect(argVal(a, "--model")).toBe("haiku");      // judge = cheap
    expect(out).toBe('{"success":0}');               // unwrapped from {result}
    // isolation env always set
    expect(calls[0].env.HIVEMIND_CAPTURE).toBe("false");
    expect(calls[0].env.HIVEMIND_WIKI_WORKER).toBe("1");
  });

  it("claude_code proposer defaults to a capable model (sonnet)", async () => {
    const { spawnImpl, calls } = fakeSpawn(JSON.stringify({ result: "[]" }));
    await agentModel({ agent: "claude_code", role: "proposer", bin: "/x/claude", spawnImpl })("S", "U");
    expect(argVal(calls[0].args, "--model")).toBe("sonnet");
  });

  it("codex: read-only sandbox + skip-git-check, no claude needed, system folded into the prompt, raw stdout", async () => {
    const { spawnImpl, calls } = fakeSpawn("noise\n{\"success\":1}\nmore");
    const out = await agentModel({ agent: "codex", role: "judge", bin: "/x/codex", spawnImpl })("SYS", "USER");
    const a = calls[0].args;
    expect(a).toContain("exec");
    expect(a).toContain("--skip-git-repo-check");
    expect(a[a.indexOf("-s") + 1]).toBe("read-only");   // NOT --dangerously-bypass
    expect(a).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(a[a.length - 1]).toBe("SYS\n\nUSER");          // system folded into prompt
    expect(out).toContain('{"success":1}');              // raw — parsers extract the JSON
  });

  it("hermes: oneshot via provider, ignore-user-config, explicit model", async () => {
    const { spawnImpl, calls } = fakeSpawn("ok");
    await agentModel({ agent: "hermes", role: "proposer", bin: "/x/hermes", spawnImpl })("S", "U");
    const a = calls[0].args;
    expect(a).toContain("-z");
    expect(argVal(a, "--provider")).toBe("openrouter");
    expect(argVal(a, "-m")).toBe("anthropic/claude-haiku-4-5");
    expect(a).toContain("--ignore-user-config");
  });

  it("cursor and pi: print mode with model/provider, system folded in", async () => {
    const cur = fakeSpawn("x");
    await agentModel({ agent: "cursor", role: "judge", bin: "/x/cursor-agent", spawnImpl: cur.spawnImpl })("S", "U");
    expect(cur.calls[0].args).toContain("--print");
    expect(argVal(cur.calls[0].args, "--output-format")).toBe("text");

    const pi = fakeSpawn("x");
    await agentModel({ agent: "pi", role: "judge", bin: "/x/pi", spawnImpl: pi.spawnImpl })("S", "U");
    expect(argVal(pi.calls[0].args, "--provider")).toBe("google");
    expect(argVal(pi.calls[0].args, "--model")).toBe("gemini-2.5-flash");
  });

  it("env override sets the model per agent+role", async () => {
    const { spawnImpl, calls } = fakeSpawn("x");
    const env = { HIVEMIND_SKILLOPT_CLAUDE_CODE_JUDGE_MODEL: "opus" } as unknown as NodeJS.ProcessEnv;
    await agentModel({ agent: "claude_code", role: "judge", bin: "/x/claude", spawnImpl, env })("S", "U");
    expect(argVal(calls[0].args, "--model")).toBe("opus");
  });

  it("env provider+model override (e.g. AWS Bedrock) is applied together", async () => {
    const { spawnImpl, calls } = fakeSpawn("x");
    const env = {
      HIVEMIND_SKILLOPT_HERMES_PROVIDER: "bedrock",
      HIVEMIND_SKILLOPT_HERMES_MODEL: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    } as unknown as NodeJS.ProcessEnv;
    await agentModel({ agent: "hermes", role: "judge", bin: "/x/hermes", spawnImpl, env })("S", "U");
    expect(argVal(calls[0].args, "--provider")).toBe("bedrock");
    expect(argVal(calls[0].args, "-m")).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
  });

  it("codex applies an explicit model override (-m) when one is configured", async () => {
    const { spawnImpl, calls } = fakeSpawn("raw");
    const env = { HIVEMIND_SKILLOPT_CODEX_JUDGE_MODEL: "o3" } as unknown as NodeJS.ProcessEnv;
    await agentModel({ agent: "codex", role: "judge", bin: "/x/codex", spawnImpl, env })("S", "U");
    expect(argVal(calls[0].args, "-m")).toBe("o3"); // the `model ? ["-m", model] : []` present-branch
  });

  it("rejects a harnesses/hermes/pi provider override with NO model (the default id wouldn't match)", async () => {
    const { spawnImpl } = fakeSpawn("x");
    const env = { HIVEMIND_SKILLOPT_HERMES_PROVIDER: "bedrock" } as unknown as NodeJS.ProcessEnv;
    await expect(agentModel({ agent: "hermes", role: "judge", bin: "/x/hermes", spawnImpl, env })("S", "U"))
      .rejects.toThrow(/without a model/);
  });

  it("propagates the injected env to the spawned child (not just global process.env)", async () => {
    const { spawnImpl, calls } = fakeSpawn("x");
    const env = { MY_SCOPED: "1", HIVEMIND_SKILLOPT_CLAUDE_CODE_JUDGE_MODEL: "haiku" } as unknown as NodeJS.ProcessEnv;
    await agentModel({ agent: "claude_code", role: "judge", bin: "/x/claude", spawnImpl, env })("S", "U");
    expect(calls[0].env.MY_SCOPED).toBe("1");
    expect(calls[0].env.HIVEMIND_CAPTURE).toBe("false");
  });

  it("rejects on non-zero exit (caller swallows → no-change)", async () => {
    const { spawnImpl } = fakeSpawn("boom", 1);
    await expect(agentModel({ agent: "claude_code", role: "judge", bin: "/x/claude", spawnImpl })("S", "U"))
      .rejects.toThrow(/exit 1/);
  });

  it("rejects on empty stdout at exit 0 (misconfigured provider surfaces loudly, not silently)", async () => {
    // hermes on a dead Bedrock model exits 0 with blank stdout, swallowing the error.
    const { spawnImpl } = fakeSpawn("   \n", 0);
    await expect(agentModel({ agent: "hermes", role: "judge", bin: "/x/hermes", spawnImpl })("S", "U"))
      .rejects.toThrow(/empty output/);
  });
});

describe("detectScorerAgent", () => {
  it("explicit HIVEMIND_SKILLOPT_AGENT override wins", () => {
    expect(detectScorerAgent({ HIVEMIND_SKILLOPT_AGENT: "hermes", CLAUDECODE: "1" } as never)).toBe("hermes");
  });
  it("ignores a bogus explicit value and falls through to detection", () => {
    expect(detectScorerAgent({ HIVEMIND_SKILLOPT_AGENT: "nonsense", CODEX_HOME: "/h" } as never)).toBe("codex");
  });
  it("detects claude_code and codex from their env signatures", () => {
    expect(detectScorerAgent({ CLAUDECODE: "1" } as never)).toBe("claude_code");
    expect(detectScorerAgent({ CODEX_SESSION_ID: "s" } as never)).toBe("codex");
  });
  it("defaults to claude_code when nothing matches", () => {
    expect(detectScorerAgent({} as never)).toBe("claude_code");
  });
});
