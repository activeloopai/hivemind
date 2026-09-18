#!/usr/bin/env node
// audit-schema-drift.mjs - flag Deep Lake schema drift vs deeplake-schema.ts.
//
// The schema is single-sourced in src/deeplake-schema.ts; column adds go
// through healMissingColumns, never a hand-rolled ALTER (guides/15). This
// flags any ALTER TABLE / ADD COLUMN string outside deeplake-schema.ts, and
// any column-list literal that looks like a second copy of the canonical
// definitions.
//
// Usage: node scripts/audit-schema-drift.mjs src/
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "bundle"].includes(name)) continue;
    const full = join(dir, name);
    statSync(full).isDirectory() ? walk(full, out) : extname(full) === ".ts" && out.push(full);
  }
  return out;
}

function scan(file) {
  const findings = [];
  const isSchemaFile = basename(file) === "deeplake-schema.ts";
  readFileSync(file, "utf-8").split("\n").forEach((line, i) => {
    const n = i + 1;
    if (/ALTER\s+TABLE/i.test(line) && !isSchemaFile) {
      findings.push([n, "error", "ALTER TABLE outside deeplake-schema.ts - add a ColumnDef and let healMissingColumns apply it"]);
    }
    if (/ADD\s+COLUMN/i.test(line) && !isSchemaFile) {
      findings.push([n, "error", "ADD COLUMN outside deeplake-schema.ts - schema is single-sourced"]);
    }
    if (!isSchemaFile && /\b(MEMORY_COLUMNS|SESSIONS_COLUMNS)\b\s*[:=]\s*\[/.test(line)) {
      findings.push([n, "error", "a second copy of a canonical column list - the schema lives only in deeplake-schema.ts"]);
    }
  });
  return findings;
}

const roots = process.argv.slice(2);
if (!roots.length) { console.error("usage: node scripts/audit-schema-drift.mjs <path...>"); process.exit(2); }
let total = 0;
for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) for (const [line, sev, msg] of scan(file)) { console.log(`${file}:${line}: ${sev}: ${msg}`); total++; }
}
console.error(`\n${total} schema-drift finding(s).`);
process.exit(total ? 1 : 0);
