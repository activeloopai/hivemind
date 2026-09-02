import {
  deriveProjectKey,
  readLastBuild,
  repoDir
} from "./graph-chunks/chunk-6KPB5S3H.js";

// dist/src/hooks/graph-on-stop.js
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join2 } from "node:path";

// dist/src/graph/build-lock.js
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var STALE_LOCK_MS = 5 * 60 * 1e3;
function lockPath(baseDir) {
  return join(baseDir, ".build.in-flight");
}
function acquireBuildLock(baseDir) {
  const path = lockPath(baseDir);
  try {
    mkdirSync(baseDir, { recursive: true });
  } catch {
    return { acquired: false, reason: "fs-error" };
  }
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: "wx" });
    return { acquired: true, reason: "acquired" };
  } catch (err) {
    const code = err.code;
    if (code !== "EEXIST") {
      return { acquired: false, reason: "fs-error" };
    }
  }
  let ageMs;
  try {
    const stat = statSync(path);
    ageMs = Date.now() - stat.mtime.getTime();
  } catch {
    return { acquired: false, reason: "fs-error" };
  }
  if (ageMs <= STALE_LOCK_MS) {
    return { acquired: false, reason: "held-by-other" };
  }
  try {
    unlinkSync(path);
  } catch (err) {
    const code = err.code;
    if (code !== "ENOENT") {
      return { acquired: false, reason: "fs-error" };
    }
  }
  try {
    writeFileSync(path, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: "wx" });
    return { acquired: true, reason: "stale-recovered" };
  } catch (err) {
    const code = err.code;
    if (code === "EEXIST") {
      return { acquired: false, reason: "held-by-other" };
    }
    return { acquired: false, reason: "fs-error" };
  }
}
function releaseBuildLock(baseDir) {
  const path = lockPath(baseDir);
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.pid !== process.pid)
      return;
    unlinkSync(path);
  } catch (err) {
    const code = err.code;
    if (code === "ENOENT")
      return;
  }
}

// dist/src/utils/direct-run.js
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
function isDirectRun(metaUrl) {
  const entry = process.argv[1];
  if (!entry)
    return false;
  try {
    return resolve(fileURLToPath(metaUrl)) === resolve(entry);
  } catch {
    return false;
  }
}

// dist/src/hooks/graph-on-stop.js
function workTreeIdFor(cwd) {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}
function tickIntervalMs() {
  const raw = process.env.HIVEMIND_GRAPH_TICK_INTERVAL_MS;
  if (raw === void 0)
    return 10 * 60 * 1e3;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 10 * 60 * 1e3;
}
var SOURCE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs", "*.py", "*.pyi", ":(exclude)*.d.ts"];
function decideGate(ctx) {
  if (ctx.envDisable)
    return { fire: false, reason: "disabled (HIVEMIND_GRAPH_ON_STOP=0)" };
  const { key: repoKey } = deriveProjectKey(ctx.cwd);
  const baseDir = repoDir(repoKey);
  const last = readLastBuild(baseDir, workTreeIdFor(ctx.cwd));
  const head = readGitCommit(ctx.cwd);
  if (head === null) {
    return { fire: false, reason: "not in a git repo" };
  }
  if (last === null) {
    return { fire: true, reason: "first build (no prior .last-build.json)" };
  }
  if (ctx.now - last.ts < ctx.intervalMs) {
    return { fire: false, reason: `rate limit (${Math.round((ctx.now - last.ts) / 1e3)}s < ${Math.round(ctx.intervalMs / 1e3)}s)` };
  }
  if (head === last.commit_sha) {
    return { fire: false, reason: "HEAD unchanged since last build" };
  }
  const changedSourceCount = countSourceDiff(ctx.cwd, last.commit_sha, head);
  if (changedSourceCount < 1) {
    return { fire: false, reason: "no source files changed since last build" };
  }
  return { fire: true, reason: `${changedSourceCount} source file(s) changed since last build` };
}
function countSourceDiff(cwd, from, to) {
  if (from === null)
    return 1;
  try {
    const out = execFileSync("git", ["diff", "--name-only", `${from}..${to}`, "--", ...SOURCE_GLOBS], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out === "" ? 0 : out.split("\n").length;
  } catch {
    return 0;
  }
}
function readGitCommit(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
async function main(deps = {}) {
  const acquireFn = deps.acquireBuildLock ?? acquireBuildLock;
  const releaseFn = deps.releaseBuildLock ?? releaseBuildLock;
  const gateFn = deps.decideGate ?? decideGate;
  const envDisable = process.env.HIVEMIND_GRAPH_ON_STOP === "0";
  const ctx = {
    cwd: process.cwd(),
    now: Date.now(),
    intervalMs: tickIntervalMs(),
    envDisable
  };
  let decision;
  try {
    decision = gateFn(ctx);
  } catch (err) {
    logToFile(ctx.cwd, `decideGate threw: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  logToFile(ctx.cwd, `gate: ${decision.fire ? "FIRE" : "SKIP"} (${decision.reason})`);
  if (!decision.fire)
    return;
  const { key: repoKey } = deriveProjectKey(ctx.cwd);
  const baseDir = repoDir(repoKey);
  const lock = acquireFn(baseDir);
  if (!lock.acquired) {
    logToFile(ctx.cwd, `build skipped: lock ${lock.reason}`);
    return;
  }
  logToFile(ctx.cwd, `lock: ${lock.reason}`);
  try {
    const runBuildFn = deps.runBuildCommand ?? (await import("./graph-chunks/graph-TRV3V3VR.js")).runBuildCommand;
    await runBuildFn(["--trigger", "session-end"]);
  } catch (err) {
    logToFile(ctx.cwd, `build threw: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    releaseFn(baseDir);
  }
}
function logToFile(cwd, line) {
  try {
    const { key } = deriveProjectKey(cwd);
    const dir = repoDir(key);
    mkdirSync2(dir, { recursive: true });
    appendFileSync(join2(dir, ".graph-on-stop.log"), `[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}
`);
  } catch {
  }
}
if (isDirectRun(import.meta.url)) {
  main().catch((err) => {
    console.error(`graph-on-stop fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(0);
  });
}
export {
  decideGate,
  main
};
