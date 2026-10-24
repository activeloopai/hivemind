#!/usr/bin/env node
// audit-swallowed-catch.mjs - flag empty / swallowed catch blocks.
//
// Empty `catch {}` or a catch that drops the error with no log, rethrow, or
// documented reason hides a Deep Lake failure as silent data loss (guides/09).
// The one sanctioned silent catch is the documented already-exists race in
// deeplake-schema.ts - those carry an explanatory comment.
//
// Usage: node scripts/audit-swallowed-catch.mjs src/
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "bundle"].includes(name)) continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, out) : extname(full) === ".ts" && out.push(full);
  }
  return out;
}

function scan(file) {
  const src = readFileSync(file, "utf-8");
  const lines = src.split("\n");
  const findings = [];
  lines.forEach((line, i) => {
    const n = i + 1;
    // empty catch on one line: catch {} or catch (e) {}
    if (/catch\s*(\([^)]*\))?\s*\{\s*\}/.test(line)) {
      findings.push([n, "error", "empty catch block - narrow on `err instanceof Error` and surface/rethrow"]);
      return;
    }
    // catch that opens a block; peek at the next few lines for a swallow
    const m = line.match(/catch\s*\(\s*(\w+)\s*\)\s*\{/);
    if (m) {
      const binding = m[1];
      const body = lines.slice(i + 1, i + 5).join("\n");
      const usesBinding = new RegExp(`\\b${binding}\\b`).test(body);
      const hasComment = /\/\//.test(line) || /\/\//.test(lines[i + 1] ?? "");
      const closesEmpty = /^\s*\}/.test(lines[i + 1] ?? "");
      if ((closesEmpty || !usesBinding) && !hasComment) {
        findings.push([n, "warning", `catch (${binding}) that never uses the error and has no explanatory comment - swallowed error?`]);
      }
    }
  });
  return findings;
}

const roots = process.argv.slice(2);
if (!roots.length) { console.error("usage: node scripts/audit-swallowed-catch.mjs <path...>"); process.exit(2); }
let total = 0;
for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) for (const [line, sev, msg] of scan(file)) { console.log(`${file}:${line}: ${sev}: ${msg}`); total++; }
}
console.error(`\n${total} swallowed-catch finding(s).`);
process.exit(total ? 1 : 0);
