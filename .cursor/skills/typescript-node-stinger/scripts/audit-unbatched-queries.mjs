#!/usr/bin/env node
// audit-unbatched-queries.mjs - flag un-batched Deep Lake queries and
// hand-rolled fetches that bypass the SQL-API client.
//
// A `await api.query(...)` inside a loop serializes through the Semaphore
// (the N+1 of this repo) - batch into one IN (...) statement or Promise.all.
// A raw `fetch(...tables/query...)` bypasses retry + Semaphore + guards
// entirely. See guides/03 and guides/08.
//
// Usage: node scripts/audit-unbatched-queries.mjs src/
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

const LOOP = /\b(for|while)\b|\.map\(|\.forEach\(/;

function scan(file) {
  const findings = [];
  const lines = readFileSync(file, "utf-8").split("\n");
  let loopDepth = 0;
  lines.forEach((line, i) => {
    const n = i + 1;
    // raw fetch to the query endpoint - bypasses the client
    if (/fetch\(/.test(line) && /tables\/query/.test(line)) {
      findings.push([n, "error", "raw fetch to the Deep Lake query endpoint - use the DeeplakeApi client (retry + Semaphore + guards)"]);
    }
    // crude loop tracking
    if (LOOP.test(line)) loopDepth++;
    if (loopDepth > 0 && /await\s+\w+\.query\(/.test(line)) {
      findings.push([n, "warning", "`await ...query(...)` inside a loop - serializes through the Semaphore; batch into one IN(...) or Promise.all"]);
    }
    // close brace heuristic to drop loop depth
    if (/^\s*\}/.test(line) && loopDepth > 0) loopDepth--;
  });
  return findings;
}

const roots = process.argv.slice(2);
if (!roots.length) { console.error("usage: node scripts/audit-unbatched-queries.mjs <path...>"); process.exit(2); }
let total = 0;
for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) for (const [line, sev, msg] of scan(file)) { console.log(`${file}:${line}: ${sev}: ${msg}`); total++; }
}
console.error(`\n${total} query finding(s).`);
process.exit(total ? 1 : 0);
