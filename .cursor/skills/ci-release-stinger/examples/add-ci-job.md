# Example: adding a new CI job (end-to-end)

Scenario: we want CI to fail a PR if an esbuild output drifts out of the `files` allowlist. We'll add a `bundle-allowlist` job to `ci.yaml` that mirrors a local script. This shows the "local == CI" discipline in action.

## 1. Establish the local check first

The check must be runnable locally before it becomes a CI job. We use the Stinger's `audit-bundle.sh` (or wire a project script). Locally:

```bash
bash scripts/audit-bundle.sh
# OK    bundle
# OK    harnesses/codex/bundle
# MISS  harnesses/hermes/bundle  (built but NOT in files allowlist - will not ship)
```

That MISS is exactly the class of bug the job will guard. If a real script is preferred, add it to `package.json` scripts (e.g. `"check:bundle": "bash scripts/audit-bundle.sh"`) so the CI step calls `npm run check:bundle` and a developer runs the identical command.

## 2. Author the job from the template

Start from `templates/new-actions-job.yaml`. Filled in:

```yaml
bundle-allowlist:
  name: Bundle vs files allowlist
  runs-on: ubuntu-latest
  permissions:
    contents: read
  steps:
    - name: Checkout
      uses: actions/checkout@<pinned-sha>          # pin it
    - name: Setup Node.js
      uses: actions/setup-node@v6.4.0              # match repo pin
      with:
        node-version: 22
        cache: npm
    - name: Install dependencies
      run: npm ci
    - name: Build (typecheck + emit bundle artefacts)
      run: npm run build                            # needed so outdirs exist on disk
    - name: Check bundle is in the files allowlist
      run: npm run check:bundle                     # mirrors the local command
```

## 3. Honor the conventions

- **Pinned `setup-node@v6.4.0`**, Node `22` - matches every other `ci.yaml` job (`guides/04-workflows.md`).
- **`permissions: contents: read`** - this job only reads; no PR comment, no write. Least privilege.
- **`npm ci`**, not `npm install` - reproducible install.
- **`npm run build` before the check** - `audit-bundle.sh` needs the `outdir`s on disk; `build` runs `prebuild` (sync-versions) -> tsc -> esbuild.
- **The CI step calls the same `npm run` script** a developer runs locally. No CI-only logic.

## 4. Verify

- `bash scripts/audit-workflow.sh .github/workflows` - confirms the new job's action/node pinning and `permissions:` block pass.
- Push, confirm the job runs and fails on the seeded MISS, then fix the allowlist and confirm green.

## Findings shape if this were an audit instead

If asked to *review* an existing job rather than author one:

- **Must-fix** if it used `actions/setup-node@v6` (floating major) or no Node pin.
- **Should-refactor** if it had no `permissions:` block, or ran a check with no local-parity script.
- **Style** if the step name didn't match the repo's "Verb + object" convention.
