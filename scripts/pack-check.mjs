#!/usr/bin/env node
// Refuse a publish if `npm pack` would include filenames that should
// never ship to npm — credentials, CI workflows, git internals.
// Catches a future PR widening package.json's `files` array (or
// switching to a permissive .npmignore) before any token is touched.

import { execFileSync } from 'node:child_process';

const FORBIDDEN = [
  /(^|\/)\.npmrc$/,
  /(^|\/)\.env($|\.)/,
  /(^|\/)secrets?(\/|$)/,
  /(^|\/)\.github(\/|$)/,
  /(^|\/)\.git(\/|$)/,
];

// On Windows `npm` is the `npm.cmd` shim, which execFileSync can't launch
// directly (ENOENT for a bare name, EINVAL for `.cmd` without a shell on
// modern Node). Route through the shell there; the args are static, so
// there's no injection surface. Unix stays shell-free.
const isWin = process.platform === 'win32';
const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  shell: isWin,
});
const entries = JSON.parse(raw)[0].files.map((f) => f.path);
const hits = entries.filter((p) => FORBIDDEN.some((rx) => rx.test(p)));

if (hits.length) {
  console.error('Refusing to publish — forbidden filenames in tarball:');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log(`pack-check OK — ${entries.length} files, no forbidden patterns`);
