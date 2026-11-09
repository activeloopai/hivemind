#!/usr/bin/env node
// audit-untyped-boundaries.mjs - flag `any` and missing zod at IO boundaries.
//
// `any` crossing a function signature defeats strict mode downstream
// (guides/12). External boundaries (parsed JSON, env, file reads, API
// responses) should be zod-validated. This is a heuristic line scan, not a
// type-aware analysis - inspect each finding.
//
// Usage: node scripts/audit-untyped-boundaries.mjs src/
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "bundle") continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (extname(full) === ".ts") out.push(full);
  }
  return out;
}

function scan(file) {
  const findings = [];
  const lines = readFileSync(file, "utf-8").split("\n");
  let sawParse = false;
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/\bas\s+any\b/.test(line)) findings.push([n, "error", "`as any` cast - launder through a zod schema or a type guard"]);
    if (/:\s*any\b/.test(line) && !/\/\//.test(line.split(":")[0] ?? "")) findings.push([n, "error", "`: any` annotation at a signature - use `unknown` then narrow, or a zod schema"]);
    if (/JSON\.parse\(/.test(line)) sawParse = true;
    if (/\.parse\(|\.safeParse\(/.test(line)) sawParse = false; // a zod parse nearby clears the flag
    if (sawParse && /JSON\.parse\(/.test(line) && !/(z\.|Schema)/.test(line)) {
      findings.push([n, "warning", "`JSON.parse` with no zod validation on the same/next line - validate the boundary"]);
    }
  });
  return findings;
}

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("usage: node scripts/audit-untyped-boundaries.mjs <path...>");
  process.exit(2);
}
let total = 0;
for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) {
    for (const [line, sev, msg] of scan(file)) {
      console.log(`${file}:${line}: ${sev}: ${msg}`);
      total++;
    }
  }
}
console.error(`\n${total} untyped-boundary finding(s).`);
process.exit(total ? 1 : 0);
