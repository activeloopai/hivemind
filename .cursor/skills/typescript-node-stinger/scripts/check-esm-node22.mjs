#!/usr/bin/env node
// check-esm-node22.mjs - flag CJS, extensionless relative imports, fetch
// polyfills, bare builtin imports, and Node-version drift.
//
// This repo is strict ESM on Node >=22 (guides/01, guides/16). Relative
// imports need a .js extension under Node16 resolution; require/module.exports
// are CJS; a fetch polyfill is dead weight on Node 22; builtins should carry
// the node: prefix.
//
// Usage: node scripts/check-esm-node22.mjs src/
import { readFileSync, statSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "bundle"].includes(name)) continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, out) : [".ts", ".mjs"].includes(extname(full)) && out.push(full);
  }
  return out;
}

const BUILTINS = ["fs", "path", "url", "crypto", "os", "child_process", "http", "https", "stream", "util", "events"];

function scan(file) {
  const findings = [];
  readFileSync(file, "utf-8").split("\n").forEach((line, i) => {
    const n = i + 1;
    if (/\brequire\(/.test(line) || /module\.exports/.test(line)) findings.push([n, "error", "CJS (require/module.exports) in an ESM module - use import/export"]);
    if (/\b__dirname\b|\b__filename\b/.test(line)) findings.push([n, "error", "__dirname/__filename in ESM - use import.meta.url + fileURLToPath"]);
    const rel = line.match(/from\s+['"](\.\.?\/[^'"]+)['"]/);
    if (rel && !/\.(js|json|mjs)['"]?$/.test(rel[1])) findings.push([n, "warning", `extensionless relative import "${rel[1]}" - add .js (Node16 resolution needs it)`]);
    if (/from\s+['"]node-fetch['"]/.test(line)) findings.push([n, "warning", "fetch polyfill on Node 22 - fetch is built in"]);
    const bare = line.match(/from\s+['"](fs|path|url|crypto|os|child_process|http|https|stream|util|events)['"]/);
    if (bare && BUILTINS.includes(bare[1])) findings.push([n, "warning", `bare builtin import "${bare[1]}" - use "node:${bare[1]}"`]);
  });
  return findings;
}

const roots = process.argv.slice(2);
if (!roots.length) { console.error("usage: node scripts/check-esm-node22.mjs <path...>"); process.exit(2); }
let total = 0;
for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) for (const [line, sev, msg] of scan(file)) { console.log(`${file}:${line}: ${sev}: ${msg}`); total++; }
}
// Node-version drift check
if (existsSync("package.json")) {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const node = pkg.engines?.node ?? "";
  if (!/>=\s*2[2-9]/.test(node) && !/>=\s*[3-9]\d/.test(node)) {
    console.log(`package.json: warning: engines.node is "${node}" - Hivemind targets Node >=22`);
    total++;
  }
}
console.error(`\n${total} ESM/Node22 finding(s).`);
process.exit(total ? 1 : 0);
