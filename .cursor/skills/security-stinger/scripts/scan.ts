#!/usr/bin/env -S node --loader tsx
// scripts/scan.ts - TypeScript port of scan.sh, tuned for the Hivemind codebase.
//
// Prefer this on Windows / non-Bash environments. Same outputs, same intent:
// populate .scan-output/ with deterministic findings so the Bee can focus on
// judgment calls (missing sqlIdent, gate path weakness, scope coercion).
//
// Usage (from the Hivemind repo root):
//   npx tsx .cursor/skills/security-stinger/scripts/scan.ts
//
// Exits with code 0 regardless. The Bee decides what is fatal.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT_DIR = resolve('.scan-output');
mkdirSync(OUT_DIR, { recursive: true });

const write = (name: string, body: string) =>
  writeFileSync(join(OUT_DIR, name), body.endsWith('\n') ? body : body + '\n', 'utf8');

const hr = (label: string) =>
  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`);

const safeExec = (cmd: string): string => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
  catch (e: any) { return (e.stdout?.toString() ?? '') + '\n' + (e.stderr?.toString() ?? ''); }
};

// ---------------------------------------------------------------------------
// 1. npm audit
// ---------------------------------------------------------------------------
hr('1. npm audit');
let auditJson = 'no package-lock.json found';
if (existsSync('package-lock.json')) auditJson = safeExec('npm audit --audit-level=high --json');
write('npm-audit.json', auditJson);
console.log('  ->', join(OUT_DIR, 'npm-audit.json'));

// ---------------------------------------------------------------------------
// 2. OpenClaw bundle static scan (ClawHub parity)
// ---------------------------------------------------------------------------
hr('2. OpenClaw bundle scan');
let openclaw = 'audit:openclaw script not found in package.json';
if (existsSync('package.json')) {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.scripts && pkg.scripts['audit:openclaw']) openclaw = safeExec('npm run audit:openclaw');
}
write('openclaw-audit.txt', openclaw);
console.log('  ->', join(OUT_DIR, 'openclaw-audit.txt'));

// ---------------------------------------------------------------------------
// 3. Rules File Backdoor - hidden Unicode
// ---------------------------------------------------------------------------
hr('3. Unicode scan (AI rules files)');
const UNICODE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const RULE_TARGETS = [
  '.cursor/rules',
  '.cursorrules',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
];
const unicodeHits: string[] = [];
const walk = (p: string) => {
  if (!existsSync(p)) return;
  const st = statSync(p);
  if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
  else if (st.isFile()) {
    const body = readFileSync(p, 'utf8');
    body.split('\n').forEach((line, i) => {
      if (UNICODE_RE.test(line)) {
        UNICODE_RE.lastIndex = 0;
        unicodeHits.push(`${p}:${i + 1} - hidden Unicode detected`);
      }
    });
  }
};
for (const t of RULE_TARGETS) walk(t);
write('unicode-scan.txt',
  unicodeHits.length
    ? unicodeHits.join('\n')
    : 'clean - no zero-width or bidirectional Unicode detected');
console.log('  ->', join(OUT_DIR, 'unicode-scan.txt'));

// ---------------------------------------------------------------------------
// 4. Pattern sweeps - Hivemind-specific
// ---------------------------------------------------------------------------
hr('4. Vulnerable-pattern sweep');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage']);
const CODE_EXT = /\.(ts|mjs|cjs|js)$/i;

const files: string[] = [];
const collect = (dir: string) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (IGNORE_DIRS.has(e)) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) collect(p);
    else if (st.isFile() && (CODE_EXT.test(e) || e.startsWith('.env'))) files.push(p);
  }
};
collect('src');
collect('scripts');
for (const f of ['.env', '.env.local', '.env.production']) if (existsSync(f)) files.push(f);

const patterns: { name: string; re: RegExp; pathFilter?: RegExp }[] = [
  { name: 'Interpolated SQL identifiers (must be sqlIdent-wrapped)',
    re: /(FROM|INTO|UPDATE|TABLE)\s+"\$\{/ },
  { name: 'Token / Bearer / JWT in source',
    re: /(Bearer\s+\$\{|\beyJ[A-Za-z0-9._-]{10,}|sk_(live|test)_[A-Za-z0-9]{10,}|-----BEGIN)/ },
  { name: 'console.* near auth / api / hooks (token-in-logs risk)',
    re: /console\.(log|error|info|warn)\(/,
    pathFilter: /(deeplake-api|[\\/](cli|commands|hooks)[\\/])/ },
  { name: 'Credential file references (check explicit 0600/0700 mode)',
    re: /(credentials\.json|\.deeplake)/ },
  { name: 'Capture sites (must honor HIVEMIND_CAPTURE=false)',
    re: /HIVEMIND_CAPTURE/ },
  { name: 'Org id / scope sourced from input (scope coercion risk)',
    re: /(orgId|org_id|scope)\s*[:=]\s*(toolArgs|args|req|input|params)\./ },
  { name: 'Runtime-computed paths near the gate (gate bypass risk)',
    re: /(os\.homedir\(\)|process\.env\.HOME)\s*[+,]/,
    pathFilter: /[\\/](hooks|shell)[\\/]/ },
  { name: 'Child-process / spawn (confirm only the documented gate-runner bypass)',
    re: /(child_process|execFileSync|execSync|spawn\(|exec\(\s*`)/ },
  { name: 'Prototype pollution sinks',
    re: /(Object\.assign\(.*JSON\.parse|_\.merge\(|_\.defaultsDeep\()/ },
];

const sections: string[] = [];
for (const p of patterns) {
  const hits: string[] = [];
  for (const f of files) {
    if (p.pathFilter && !p.pathFilter.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      if (p.re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`);
    });
  }
  sections.push(`--- ${p.name} ---\n${hits.length ? hits.join('\n') : '(no hits)'}\n`);
}
write('grep-findings.txt', sections.join('\n'));
console.log('  ->', join(OUT_DIR, 'grep-findings.txt'));

// ---------------------------------------------------------------------------
// 5. Env summary
// ---------------------------------------------------------------------------
hr('5. Env files summary');
const envFiles = ['.env', '.env.local', '.env.production', '.env.development', '.env.example'];
let envReport = '';
for (const f of envFiles) {
  if (existsSync(f)) {
    envReport += `--- ${f} (keys only, values stripped) ---\n`;
    envReport += readFileSync(f, 'utf8').replace(/=.*/g, '=***') + '\n';
  }
}
try {
  const tracked = safeExec('git ls-files').split('\n').filter((l) => /^\.env(\.|$)/.test(l));
  if (tracked.length) envReport += `\nWARNING: .env* files tracked by git:\n${tracked.join('\n')}\n`;
} catch { /* no git */ }
write('env-summary.txt', envReport || '(no .env files found)');
console.log('  ->', join(OUT_DIR, 'env-summary.txt'));

// ---------------------------------------------------------------------------
// 6. SQL guard integrity
// ---------------------------------------------------------------------------
hr('6. SQL guard integrity check');
let sqlReport = '';
if (existsSync('src/utils/sql.ts')) {
  const body = readFileSync('src/utils/sql.ts', 'utf8');
  const hasGuards = /export function sqlStr/.test(body)
    && /export function sqlLike/.test(body)
    && /export function sqlIdent/.test(body);
  const identIntact = /\[a-zA-Z_\]\[a-zA-Z0-9_\]\*/.test(body) || /\[A-Za-z_\]\[A-Za-z0-9_\]\*/.test(body);
  sqlReport += `sqlStr/sqlLike/sqlIdent present: ${hasGuards}\n`;
  sqlReport += identIntact
    ? 'sqlIdent regex looks intact ([A-Za-z_][A-Za-z0-9_]*)\n'
    : 'WARNING: confirm sqlIdent regex still rejects anything outside [A-Za-z_][A-Za-z0-9_]*\n';
} else {
  sqlReport = 'src/utils/sql.ts not found - confirm escaping layer location\n';
}
write('sql-guards.txt', sqlReport);
console.log('  ->', join(OUT_DIR, 'sql-guards.txt'));

hr(`scan.ts complete - outputs in ${OUT_DIR}/`);
process.exit(0);
