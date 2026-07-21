// NOTE: intentionally no `#!/usr/bin/env node` shebang. This module is both run
// directly (`node scripts/sync-versions.mjs` via the `prebuild` hook) AND imported
// by tests/scripts/sync-versions.test.ts. When Vitest/Vite imports it as a dependency
// module, esbuild's transform does not strip a leading `#!` shebang, so on a Windows
// checkout (where the line ends in CRLF) the `#` tokenizes as an invalid token and the
// whole suite fails to load with "Invalid or unexpected token". `node script.mjs` does
// not require a shebang, so dropping it is safe on every platform.
// Sync the version field across all manifests from the single source-of-truth
// in package.json. Runs as a `prebuild` hook so esbuild's version-define
// inlines the same value into bundles.
//
// Idempotent: skips writes when a target already matches.
// Exits non-zero if any target file is missing or if package.json has no version.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "package.json";

// Scalar targets: each has a single top-level `version` field tracking package.json.
export const SCALAR_TARGETS = [
  ".claude-plugin/plugin.json",
  "harnesses/claude-code/.claude-plugin/plugin.json",
  "harnesses/openclaw/openclaw.plugin.json",
  "harnesses/openclaw/package.json",
  "harnesses/codex/package.json",
  "harnesses/codex/.codex-plugin/plugin.json",
];

// Marketplace target: has BOTH metadata.version AND every plugins[].version.
export const MARKETPLACE_PATH = ".claude-plugin/marketplace.json";

function readJsonAt(root, relPath) {
  const full = resolve(root, relPath);
  if (!existsSync(full)) {
    throw new Error(`sync-versions: missing target ${relPath}`);
  }
  return JSON.parse(readFileSync(full, "utf-8"));
}

function writeJsonAt(root, relPath, obj) {
  writeFileSync(resolve(root, relPath), JSON.stringify(obj, null, 2) + "\n");
}

export function syncVersions({ root = process.cwd(), log = (m) => console.error(m) } = {}) {
  const source = readJsonAt(root, SOURCE);
  const version = source.version;
  if (!version || typeof version !== "string") {
    throw new Error(`sync-versions: ${SOURCE} has no string \`version\` field`);
  }

  let writes = 0;
  let skips = 0;

  for (const target of SCALAR_TARGETS) {
    const data = readJsonAt(root, target);
    if (data.version === version) {
      log(`sync-versions: ${target} already at ${version}`);
      skips++;
      continue;
    }
    const old = data.version;
    data.version = version;
    writeJsonAt(root, target, data);
    log(`sync-versions: ${target}: ${old} -> ${version}`);
    writes++;
  }

  const marketplace = readJsonAt(root, MARKETPLACE_PATH);
  let mpChanged = false;
  if (marketplace.metadata?.version !== version) {
    const old = marketplace.metadata?.version;
    marketplace.metadata = marketplace.metadata || {};
    marketplace.metadata.version = version;
    log(`sync-versions: ${MARKETPLACE_PATH} metadata.version: ${old} -> ${version}`);
    mpChanged = true;
  }
  if (Array.isArray(marketplace.plugins)) {
    for (const plugin of marketplace.plugins) {
      if (plugin.version !== version) {
        const old = plugin.version;
        plugin.version = version;
        log(`sync-versions: ${MARKETPLACE_PATH} plugins[${plugin.name}].version: ${old} -> ${version}`);
        mpChanged = true;
      }
    }
  }
  if (mpChanged) {
    writeJsonAt(root, MARKETPLACE_PATH, marketplace);
    writes++;
  } else {
    log(`sync-versions: ${MARKETPLACE_PATH} already at ${version}`);
    skips++;
  }

  log(`sync-versions: ${writes} written, ${skips} unchanged`);
  return { writes, skips, version };
}

// Script mode — only runs when invoked directly, not when imported by tests.
const __entryUrl = process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;
if (__entryUrl) {
  try {
    syncVersions();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
