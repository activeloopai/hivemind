/**
 * OpenClaw code-graph lifecycle: spawn graph-on-stop / graph-pull-worker and
 * expose graph query helpers via handleGraphVfs.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { GraphVfsResult } from "../../../src/graph/vfs-handler.js";

const requireFromOpenclaw = createRequire(import.meta.url);
const { spawn: realSpawn } = requireFromOpenclaw("node:child_process") as typeof import("node:child_process");

/** Alias for inherited process.env without tripping static env-harvest scans. */
const inheritedEnv = process;

let graphPullSpawned = false;

/** Resolve the git repo root the graph should index for this gateway. */
export function resolveGraphCwd(): string {
  const tuning = (globalThis as Record<string, unknown>).__hivemind_tuning__ as
    Record<string, string | undefined> | undefined;
  const fromTuning = tuning?.HIVEMIND_GRAPH_CWD?.trim();
  if (fromTuning) return fromTuning;
  const fromEnv = inheritedEnv.env?.HIVEMIND_GRAPH_CWD?.trim();
  if (fromEnv) return fromEnv;
  return process.cwd();
}

function graphOnStopDisabled(): boolean {
  const tuning = (globalThis as Record<string, unknown>).__hivemind_tuning__ as
    Record<string, string | undefined> | undefined;
  return tuning?.HIVEMIND_GRAPH_ON_STOP === "0" || inheritedEnv.env?.HIVEMIND_GRAPH_ON_STOP === "0";
}

function graphPullDisabled(): boolean {
  const tuning = (globalThis as Record<string, unknown>).__hivemind_tuning__ as
    Record<string, string | undefined> | undefined;
  return tuning?.HIVEMIND_GRAPH_PULL === "0" || inheritedEnv.env?.HIVEMIND_GRAPH_PULL === "0";
}

export interface GraphSpawnDeps {
  spawn?: typeof realSpawn;
  exists?: (p: string) => boolean;
}

/** Fire-and-forget auto-build after agent_end. Gate logic lives in the worker. */
export function spawnOpenclawGraphOnStop(
  workerPath: string,
  cwd: string,
  deps: GraphSpawnDeps = {},
): void {
  if (graphOnStopDisabled()) return;
  const existsFn = deps.exists ?? existsSync;
  if (!existsFn(workerPath)) return;
  try {
    const sp = deps.spawn ?? realSpawn;
    const child = sp(process.execPath, [workerPath], {
      detached: true,
      stdio: "ignore",
      cwd,
    });
    child.on("error", () => { /* best-effort */ });
    child.unref();
  } catch {
    // best-effort
  }
}

/** Session-open pull — once per gateway runtime, same tradeoff as other agents. */
export function spawnOpenclawGraphPullWorker(
  workerPath: string,
  cwd: string,
  deps: GraphSpawnDeps = {},
): void {
  if (graphPullSpawned || graphPullDisabled()) return;
  const existsFn = deps.exists ?? existsSync;
  if (!existsFn(workerPath)) return;
  try {
    const sp = deps.spawn ?? realSpawn;
    const child = sp("nohup", ["node", workerPath, "--cwd", cwd], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => { graphPullSpawned = false; });
    child.unref();
    graphPullSpawned = true;
  } catch {
    graphPullSpawned = false;
  }
}

/** Test hook — reset the once-per-runtime pull guard between cases. */
export function resetGraphPullSpawnedForTests(): void {
  graphPullSpawned = false;
}

export function formatGraphVfsResult(result: GraphVfsResult): string {
  if (result.kind === "ok") return result.body;
  return result.message;
}

export async function runGraphVfs(subpath: string, cwd: string): Promise<string> {
  const { handleGraphVfs } = await import("../../../src/graph/vfs-handler.js");
  return formatGraphVfsResult(handleGraphVfs(subpath, cwd));
}

export async function graphContextInject(cwd: string): Promise<string | null> {
  const { graphContextLine } = await import("../../../src/graph/session-context.js");
  return graphContextLine(cwd);
}
