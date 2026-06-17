import { homedir } from "node:os";
import { join } from "node:path";

export const HOME = homedir();

export function cursorHome(): string {
  return join(HOME, ".cursor");
}

export function cursorHooksPath(): string {
  return join(cursorHome(), "hooks.json");
}

export function cursorPluginDir(): string {
  return join(cursorHome(), "hivemind");
}

export function cursorBundleDir(): string {
  return join(cursorPluginDir(), "bundle");
}

export function deeplakeConfigDir(): string {
  return join(HOME, ".deeplake");
}

export function credentialsPath(): string {
  return join(deeplakeConfigDir(), "credentials.json");
}

export function wikiWorkerLogPath(): string {
  return join(deeplakeConfigDir(), "wiki-worker.log");
}

export function hivemindGraphsHome(): string {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join(HOME, ".hivemind", "graphs");
}

export function monorepoRoot(): string {
  return join(__dirname, "..", "..", "..", "..");
}

export function hivemindCursorBundleSrc(): string {
  return join(monorepoRoot(), "harnesses", "cursor", "bundle");
}

export function workspaceRoot(fallback?: string): string {
  return fallback ?? process.cwd();
}
