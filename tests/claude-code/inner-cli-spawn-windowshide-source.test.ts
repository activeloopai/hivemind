import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guards for the inner summarizer-CLI spawns that do NOT go
 * through the wiki-worker-spawn builders (those are unit-asserted in
 * wiki-worker-windows.test.ts). Every one of these runs inside a detached,
 * console-less worker, so without `windowsHide: true` Windows pops a visible
 * console window for the claude/codex child. These call sites `spawn`/
 * `execFileSync` a real binary, so a unit test cannot observe the options
 * object — hence the scoped source guard (same approach as the hermes
 * wiki-worker and skillify gate-runner guards).
 *
 * Each regex ties `windowsHide: true` to the specific spawn/exec call
 * ([^)]* = no closing paren between the call open and the option) so the guard
 * fails if the option ever drifts out of that spawn.
 */
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

describe("inner CLI spawn windowsHide — source guards", () => {
  it("mine-local worker spawns the summarizer claude -p with windowsHide", () => {
    expect(src("src/commands/mine-local.ts")).toMatch(/spawn\(\s*opts\.bin[^)]*windowsHide:\s*true/);
  });

  it("advisor gate spawns claude with windowsHide", () => {
    expect(src("src/skillify/advisor.ts")).toMatch(/spawn\(\s*claudeBin[^)]*windowsHide:\s*true/);
  });

  it("claude-model judge/proposer spawn passes windowsHide", () => {
    expect(src("src/skillify/claude-model.ts")).toMatch(/spawn\(\s*findAgentBin\([^;]*windowsHide:\s*true/);
  });

  // The helper LOOKUPS, not the CLI spawns. These run `where.exe` on Windows
  // on the way to launching a detached worker, so without CREATE_NO_WINDOW
  // each one allocates its own visible window — the same flash the CLI spawns
  // produced, one layer earlier. (resolveCliBin is also called from inside
  // already-detached workers, which have no console to inherit at all.)
  it("resolveCliBin's where/which lookup passes windowsHide", () => {
    expect(src("src/utils/resolve-cli-bin.ts")).toMatch(
      /execFileSync\(isWin \? "where" : "which"[^)]*windowsHide:\s*true/,
    );
  });

  it("the mine-local worker's hivemind lookup passes windowsHide", () => {
    expect(src("src/skillify/spawn-mine-local-worker.ts")).toMatch(
      /execFileSync\(lookup[^)]*windowsHide:\s*true/,
    );
  });

  it("stage-memory threads windowsHide from the invocation into the spawn plan and spawn call", () => {
    const s = src("src/skillify/stage-memory.ts");
    // plan carries it through from the builder's options...
    expect(s).toMatch(/windowsHide:\s*inv\.options\.windowsHide\s*===\s*true/);
    // ...and the spawn call applies it.
    expect(s).toMatch(/spawn\(\s*plan\.file[^)]*windowsHide:\s*plan\.windowsHide/);
  });
});

/**
 * The detached WORKER launches themselves. `detached: true` maps to
 * DETACHED_PROCESS, which makes Windows ignore CREATE_NO_WINDOW — but libuv
 * sets SW_HIDE from `windowsHide` as well, and that still applies, so the
 * option is not a no-op on these. `spawn-detached.ts` has always paired the
 * two; these are the launches that were missing it.
 */
describe("detached worker spawn windowsHide — source guards", () => {
  it("mine-local worker launch passes windowsHide", () => {
    expect(src("src/skillify/spawn-mine-local-worker.ts")).toMatch(/spawn\(cmd,\s*args[^)]*windowsHide:\s*true/);
  });

  it("backfill-memory worker launch passes windowsHide", () => {
    expect(src("src/skillify/spawn-backfill-memory-worker.ts")).toMatch(/spawn\(cmd,\s*cmdArgs[^)]*windowsHide:\s*true/);
  });

  it("the auto-spawned embedding daemon passes windowsHide", () => {
    expect(src("src/embeddings/client.ts")).toMatch(/spawn\(process\.execPath,\s*\[this\.daemonEntry\][^)]*windowsHide:\s*true/);
  });

  it("pi's auto-mine launcher lookup and worker launch both pass windowsHide", () => {
    const pi = src("harnesses/pi/extension-source/hivemind.ts");
    expect(pi).toMatch(/execFileSync\(isWin \? "where" : "which",\s*\["hivemind"\][^)]*windowsHide:\s*true/);
    expect(pi).toMatch(/spawn\(shellCmd,\s*args[^)]*windowsHide:\s*true/);
  });

  it("openclaw's agent lookup and skillify worker launch both pass windowsHide", () => {
    const oc = src("harnesses/openclaw/src/index.ts");
    expect(oc).toMatch(/realExecFileSync\(lookup,\s*\[bin\][^)]*windowsHide:\s*true/);
    expect(oc).toMatch(/realSpawn\(process\.execPath,\s*\[OPENCLAW_SKILLIFY_WORKER_PATH[^)]*windowsHide:\s*true/);
  });
});

/**
 * Hook-triggered detached launches. These fire during an ordinary session
 * (session start, stop, skill reactions, embedding warm-up), so a missing
 * SW_HIDE here is the same user-visible flash #331 reported, from a
 * different worker.
 */
describe("hook-triggered detached launch windowsHide — source guards", () => {
  const CASES: Array<[string, string, RegExp]> = [
    ["shared skillopt worker", "src/skillify/skillopt-trigger.ts", /spawn\(process\.execPath,\s*\[entry\][^)]*windowsHide:\s*true/],
    ["standalone embedding daemon", "src/embeddings/standalone-embed-client.ts", /_spawn\(process\.execPath,\s*\[daemonEntry\][^)]*windowsHide:\s*true/],
    ["codex session-start setup", "src/hooks/codex/session-start.ts", /spawn\("node",\s*\[setupScript\][^)]*windowsHide:\s*true/],
    // autoupdate's spawn target is no longer the bare `cmd`: on Windows the
    // resolved binary is a .cmd, which cannot be spawned without a shell since
    // the CVE-2024-27980 fix, so the file passes shellFile(cmd) under
    // `shell: true`. The guard follows that shape and still pins windowsHide.
    ["shared autoupdate", "src/hooks/shared/autoupdate.ts", /spawn\(\s*needsShell \? shellFile\(cmd\) : cmd,\s*args[^)]*windowsHide:\s*true/],
  ];
  for (const [name, rel, re] of CASES) {
    it(`${name} passes windowsHide`, () => {
      expect(src(rel)).toMatch(re);
    });
  }

  // The other half of the same fix: windowsHide alone was never enough on
  // Windows, because the spawn failed before it could matter. A .cmd shim needs
  // shell mode, and shell mode needs the path quoted (Node concatenates file and
  // args into one unescaped string, and the default npm global bin contains a
  // space for any account whose user name does). Losing either of these puts
  // Windows users back on a version that can never update itself.
  it("shared autoupdate spawns .cmd shims through a shell, with the path quoted", () => {
    const s = src("src/hooks/shared/autoupdate.ts");
    expect(s).toMatch(/shell:\s*needsShell/);
    expect(s).toMatch(/const needsShell = binNeedsShell\(cmd\)/);
    expect(s).toMatch(/shellFile\(cmd\)/);
  });

  it("cli update spawns .cmd shims through a shell, with the path quoted", () => {
    const s = src("src/cli/update.ts");
    expect(s).toMatch(/shell:\s*needsShell/);
    expect(s).toMatch(/binNeedsShell\(bin\)/);
    expect(s).toMatch(/shellFile\(bin\)/);
  });

  it("openclaw's graph build and pull workers both pass windowsHide", () => {
    const oc = src("harnesses/openclaw/src/graph-lifecycle.ts");
    expect(oc).toMatch(/sp\(process\.execPath,\s*\[workerPath\][^)]*windowsHide:\s*true/);
    // nohup is POSIX-only: on Windows it ENOENT'd, so the pull worker never
    // ran there and windowsHide was moot. Must spawn node directly.
    expect(oc).not.toContain('"nohup"');
    expect(oc).toMatch(/sp\(process\.execPath,\s*\[workerPath,\s*"--cwd",\s*cwd\][^)]*windowsHide:\s*true/);
  });

  it("pi's four detached launches all pass windowsHide", () => {
    const pi = src("harnesses/pi/extension-source/hivemind.ts");
    // embedding daemon, skillopt worker, wiki worker, skillify worker
    expect(pi).toMatch(/spawn\(process\.execPath,\s*\[EMBED_DAEMON_ENTRY\][^)]*windowsHide:\s*true/);
    expect(pi).toMatch(/spawn\(process\.execPath,\s*\[PI_SKILLOPT_WORKER_PATH\][^)]*windowsHide:\s*true/);
    expect(pi).toMatch(/spawn\(process\.execPath,\s*\[PI_WIKI_WORKER_PATH,\s*configPath\][^)]*windowsHide:\s*true/);
    expect(pi).toMatch(/spawn\(process\.execPath,\s*\[PI_SKILLIFY_WORKER_PATH,\s*configPath\][^)]*windowsHide:\s*true/);
  });
});

/**
 * The launcher lookups hardcoded Unix `which`, so on Windows they threw on
 * every call — pi's auto-mine fallback and openclaw's agent detection were
 * not merely noisy there, they never resolved a binary at all.
 */
describe("platform-correct binary lookups — source guards", () => {
  it("pi mirrors resolve-cli-bin's .exe -> .cmd/.bat selection on Windows", () => {
    const pi = src("harnesses/pi/extension-source/hivemind.ts");
    expect(pi).toContain('const isWin = process.platform === "win32";');
    expect(pi).toMatch(/execFileSync\(isWin \? "where" : "which",\s*\["hivemind"\]/);
    // an extensionless shim is not runnable on Windows, so .exe wins, then .cmd/.bat
    expect(pi).toMatch(/find\(\(m\) => m\.toLowerCase\(\)\.endsWith\("\.exe"\)\)/);
    expect(pi).toMatch(/find\(\(m\) => \/\\\.\(cmd\|bat\)\$\/i\.test\(m\)\)/);
  });

  it("pi shells a .cmd/.bat launcher, win32-gated and quoted", () => {
    const pi = src("harnesses/pi/extension-source/hivemind.ts");
    // win32-gated, mirroring binNeedsShell: a POSIX file merely named *.cmd
    // must still spawn directly
    expect(pi).toMatch(/const needsShell = process\.platform === "win32" && \/\\\.\(cmd\|bat\)\$\/i\.test\(cmd\)/);
    expect(pi).toMatch(/\.\.\.\(needsShell \? \{ shell: true \} : \{\}\)/);
    // quoted: shell:true concatenates without escaping, so a path containing
    // a space would otherwise be parsed as two tokens
    expect(pi).toMatch(/const shellCmd = needsShell \? `"\$\{cmd\}"` : cmd;/);
  });

  it("openclaw selects where/which by platform", () => {
    const oc = src("harnesses/openclaw/src/index.ts");
    expect(oc).toContain('const lookup = process.platform === "win32" ? "where" : "which";');
    expect(oc).toMatch(/realExecFileSync\(lookup,\s*\[bin\]/);
  });
});
