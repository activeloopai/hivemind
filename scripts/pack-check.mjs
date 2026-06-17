#!/usr/bin/env node
// Refuse a publish if `npm pack` would include filenames that should
// never ship to npm — credentials, CI workflows, git internals.
// Catches a future PR widening package.json's `files` array (or
// switching to a permissive .npmignore) before any token is touched.

import { execFileSync } from 'node:child_process';

const FORBIDDEN = [
  // Case-insensitive on the secret-bearing names: on case-insensitive
  // filesystems (macOS/Windows) `.ENV`, `ID_RSA`, `Credentials.JSON`, etc. are
  // the same sensitive file, so the gate must catch them regardless of case.
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.env($|\.)/i,
  /(^|\/)secrets?(\/|$)/i,
  /(^|\/)\.github(\/|$)/,
  /(^|\/)\.git(\/|$)/,
  // Private-key / credential material: never belongs in a published tarball.
  /(^|\/)(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i,
  /\.(pem|key|p12|pfx)$/i,
  /(^|\/)credentials\.json$/i,
];

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const entries = JSON.parse(raw)[0].files.map((f) => f.path);
const hits = entries.filter((p) => FORBIDDEN.some((rx) => rx.test(p)));

if (hits.length) {
  console.error('Refusing to publish — forbidden filenames in tarball:');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log(`pack-check OK — ${entries.length} files, no forbidden patterns`);
