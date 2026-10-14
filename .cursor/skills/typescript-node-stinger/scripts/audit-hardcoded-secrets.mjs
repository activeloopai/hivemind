#!/usr/bin/env node
// audit-hardcoded-secrets.mjs - flag hardcoded tokens/keys and logged secrets.
//
// Tokens come from env/config, never a literal in src/, and are never logged
// (guides/17). This is a heuristic scan: common token prefixes, long opaque
// literals, Authorization/Bearer literals, and console.* lines that
// interpolate a token-ish variable.
//
// Usage: node scripts/audit-hardcoded-secrets.mjs src/
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

const TOKEN_PREFIX = /(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,})/;
const LONG_OPAQUE = /['"][A-Za-z0-9_\-]{32,}['"]/;
const AUTH_LITERAL = /(Authorization|Bearer)\s*[:=].*['"][^'"]+['"]/i;
const LOG_SECRET = /console\.\w+\([^)]*\b(token|secret|apiKey|api_key|password|bearer|authorization)\b/i;

function scan(file) {
  const findings = [];
  readFileSync(file, "utf-8").split("\n").forEach((line, i) => {
    const n = i + 1;
    if (TOKEN_PREFIX.test(line)) findings.push([n, "error", "hardcoded token/key literal - read from env/config, never embed"]);
    else if (AUTH_LITERAL.test(line)) findings.push([n, "error", "hardcoded Authorization/Bearer literal - read the token from config"]);
    else if (LONG_OPAQUE.test(line) && /(token|key|secret|password|auth)/i.test(line)) findings.push([n, "warning", "long opaque literal near a secret-ish name - verify it is not a hardcoded credential"]);
    if (LOG_SECRET.test(line)) findings.push([n, "error", "logging a token/secret - never log credentials or the Authorization header"]);
  });
  return findings;
}

const roots = process.argv.slice(2);
if (!roots.length) { console.error("usage: node scripts/audit-hardcoded-secrets.mjs <path...>"); process.exit(2); }
let total = 0;
for (const root of roots) {
  const files = statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of files) for (const [line, sev, msg] of scan(file)) { console.log(`${file}:${line}: ${sev}: ${msg}`); total++; }
}
console.error(`\n${total} secret finding(s).`);
process.exit(total ? 1 : 0);
