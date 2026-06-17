import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildHookConfig, isHivemindEntry } from "./checker";
import {
  cursorBundleDir,
  cursorHooksPath,
  cursorPluginDir,
  hivemindCursorBundleSrc,
} from "../utils/paths";
import { readJson, writeJsonIfChanged } from "../utils/fs-json";

const HIVEMIND_MARKER_KEY = "_hivemindManaged";

export interface WireResult {
  ok: boolean;
  changed: boolean;
  message: string;
  reloadRequired: boolean;
}

function readExtensionVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function mergeHooks(existing: Record<string, unknown> | null, pluginDir: string, version: string): Record<string, unknown> {
  const root = (existing ?? { version: 1, hooks: {} }) as {
    version?: number;
    hooks?: Record<string, unknown[]>;
  };
  if (!root.version) root.version = 1;
  if (!root.hooks) root.hooks = {};
  const ours = buildHookConfig(pluginDir, version);
  for (const [event, entries] of Object.entries(ours)) {
    const prior = Array.isArray(root.hooks[event]) ? root.hooks[event] : [];
    const stripped = prior.filter((e) => !isHivemindEntry(e));
    root.hooks[event] = [...stripped, ...entries];
  }
  (root as Record<string, unknown>)[HIVEMIND_MARKER_KEY] = { version };
  return root as unknown as Record<string, unknown>;
}

export function stripHooksFromConfig(existing: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!existing) return null;
  const root = existing as { hooks?: Record<string, unknown[]> };
  if (root.hooks) {
    for (const event of Object.keys(root.hooks)) {
      root.hooks[event] = (root.hooks[event] ?? []).filter((e) => !isHivemindEntry(e));
      if (root.hooks[event].length === 0) delete root.hooks[event];
    }
    if (Object.keys(root.hooks).length === 0) delete root.hooks;
  }
  delete (existing as Record<string, unknown>)[HIVEMIND_MARKER_KEY];
  return existing;
}

function bundleAlreadyProvisioned(src: string, dest: string): boolean {
  const destCapture = join(dest, "capture.js");
  if (!existsSync(destCapture)) return false;
  const srcCapture = join(src, "capture.js");
  if (!existsSync(srcCapture)) return true;
  try {
    return statSync(destCapture).mtimeMs >= statSync(srcCapture).mtimeMs;
  } catch {
    return false;
  }
}

let bundledExtensionSrc: string | undefined;

/** Called once at extension activate so marketplace installs can provision
 *  the hook bundle shipped inside the VSIX. */
export function setBundledExtensionSrc(src: string | undefined): void {
  bundledExtensionSrc = src;
}

function resolveBundleSource(): { src: string; ok: boolean; message: string } {
  const monorepoSrc = hivemindCursorBundleSrc();
  if (existsSync(join(monorepoSrc, "capture.js"))) {
    return { src: monorepoSrc, ok: true, message: "Bundle provisioned from monorepo source." };
  }
  if (bundledExtensionSrc && existsSync(join(bundledExtensionSrc, "capture.js"))) {
    return { src: bundledExtensionSrc, ok: true, message: "Bundle provisioned from extension package." };
  }
  const dest = cursorBundleDir();
  if (existsSync(join(dest, "capture.js"))) {
    return { src: dest, ok: true, message: "Using existing CLI-provisioned bundle." };
  }
  return {
    src: monorepoSrc,
    ok: false,
    message: `Cursor bundle missing. Run 'hivemind cursor install' or build harnesses/cursor/bundle in the hivemind repo.`,
  };
}

function provisionBundle(): { ok: boolean; message: string } {
  const resolved = resolveBundleSource();
  if (!resolved.ok) {
    return { ok: false, message: resolved.message };
  }

  const dest = cursorBundleDir();
  if (resolved.src === dest) {
    return { ok: true, message: resolved.message };
  }

  if (bundleAlreadyProvisioned(resolved.src, dest)) {
    return { ok: true, message: "Bundle already up to date." };
  }

  mkdirSync(cursorPluginDir(), { recursive: true });
  cpSync(resolved.src, dest, { recursive: true, force: true });
  const version = readExtensionVersion();
  writeFileSync(join(cursorPluginDir(), ".hivemind_version"), `${version}\n`, "utf-8");
  return { ok: true, message: resolved.message };
}

export async function autoWireHooks(): Promise<WireResult> {
  const provision = provisionBundle();
  if (!provision.ok) {
    return { ok: false, changed: false, message: provision.message, reloadRequired: false };
  }

  const version = readExtensionVersion();
  const existing = readJson<Record<string, unknown>>(cursorHooksPath());
  const merged = mergeHooks(existing, cursorPluginDir(), version);
  const changed = writeJsonIfChanged(cursorHooksPath(), merged);

  return {
    ok: true,
    changed,
    message: changed
      ? "Hooks wired. Reload Cursor to activate the new hooks."
      : "Hooks already up to date; hooks.json was not rewritten.",
    reloadRequired: changed,
  };
}

export async function unwireHooks(): Promise<WireResult> {
  const existing = readJson<Record<string, unknown>>(cursorHooksPath());
  if (!existing) {
    return { ok: true, changed: false, message: "No hooks.json to clean.", reloadRequired: false };
  }
  const stripped = stripHooksFromConfig(existing);
  const meaningfulKeys = stripped
    ? Object.keys(stripped).filter((k) => k !== "version").length
    : 0;

  if (!stripped || meaningfulKeys === 0) {
    if (existsSync(cursorHooksPath())) {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(cursorHooksPath());
    }
    return { ok: true, changed: true, message: "Hivemind hooks removed.", reloadRequired: true };
  }

  const changed = writeJsonIfChanged(cursorHooksPath(), stripped);
  return {
    ok: true,
    changed,
    message: "Hivemind hooks stripped; foreign hooks preserved.",
    reloadRequired: changed,
  };
}
