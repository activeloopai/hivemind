# Example: auditing what the npm tarball actually ships

Scenario: a PR added a new `hermes` harness to `esbuild.config.mjs` but nobody updated `package.json`. We audit the publish surface before it ships a half-broken package. Pair with `templates/bundle-audit.md`, `guides/01-build-and-bundle.md`, and `guides/06-npm-release.md`.

## 1. Build, then enumerate the outputs

```bash
npm run build
bash scripts/audit-bundle.sh
```

Output:

```
== esbuild outdirs vs files allowlist ==
  OK    bundle
  OK    harnesses/codex/bundle
  OK    harnesses/cursor/bundle
  MISS  harnesses/hermes/bundle  (built but NOT in files allowlist - will not ship)
  OK    harnesses/openclaw/dist
  OK    mcp/bundle
  ...
```

## 2. The finding

**Must-fix - `harnesses/hermes/bundle` built but not shipped.**
`esbuild.config.mjs` emits `harnesses/hermes/bundle` (an `outdir`), but `package.json` `files` does not list it. The bundle exists on disk after `npm run build`, passes tests locally, and is completely absent from the published tarball. A consumer installing the package gets no hermes harness.

- Reason: `guides/06-npm-release.md` - the `files` allowlist is the ship contract; an esbuild output not in `files` never reaches consumers.
- Fix: add `harnesses/hermes/bundle` to the `files` array in `package.json`.

## 3. Check the other direction too

```bash
npm pack --dry-run
```

Confirm nothing shouldn't-ship rode along - no `dist/`, no source, no test fixtures, no `.env`. `pack-check` enforces forbidden filenames, but `--dry-run` is the human eyeball:

```bash
npm run pack:check
```

Suppose this surfaced a `.env.example` accidentally added under a shipped `scripts/` path. Even an example env file in a published `scripts/` dir is noise at best and a leak risk at worst:

**Should-refactor (Must-fix if it carried real values) - `scripts/.env.example` in the tarball.**
- Reason: `scripts/` ships (for the postinstall heal) and must stay clean; `guides/06-npm-release.md`.
- Fix: remove it, or add a pack-check rule. If it ever carried a real value, surface to `security-worker-bee`.

## 4. Version sanity while we're here

```bash
bash scripts/check-version-sync.sh
```

Confirms the new hermes manifest (if it has one) reads the same version as root - proving `sync-versions.mjs` covered it. A DRIFT here would mean the new harness manifest wasn't wired into sync-versions (`guides/02-sync-versions.md`).

## 5. Report

Produce the audit with `templates/bundle-audit.md`: one Must-fix (hermes not shipped), any allowlist hygiene findings, version-sync status, and the close-out handoff to `security-worker-bee` if a secret-bearing path appeared.
