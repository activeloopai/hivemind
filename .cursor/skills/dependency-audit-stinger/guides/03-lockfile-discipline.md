# Lockfile Discipline (package-lock.json + tree-sitter pins)

> **Research sources:** `research/external/01-renovate-vs-dependabot-2026.md` (HIGH), `research/external/04-npm-provenance-sigstore-2026.md` (HIGH)

`package-lock.json` is the first line of defense in this package's supply chain. A repo that runs `npm install` in CI instead of `npm ci`, or that does not commit the lockfile, has no reproducible builds and no defense against a compromised registry serving a different package than what was tested. For `@deeplake/hivemind` the lockfile also pins the native tree-sitter grammars, which makes its integrity doubly important.

---

## The five lockfile rules

### Rule 1: Always commit `package-lock.json`

- It is committed and must stay committed - never add it to `.gitignore`.
- Even though this is a published library, the lockfile pins the dev/build/native-grammar resolution that CI and contributors depend on.

### Rule 2: Use `npm ci` in CI, never `npm install`

```yaml
# Correct - installs exactly from package-lock.json, fails on drift
- run: npm ci

# Wrong - lets the resolver upgrade within semver ranges
- run: npm install
```

| Command | Behavior |
|---|---|
| `npm install` | Resolves dependencies, may rewrite `package-lock.json` |
| `npm ci` | Installs exactly from `package-lock.json`; fails if it is missing or inconsistent |

`ci.yaml` already does a cross-node install - confirm it uses `npm ci` on every node version it tests.

### Rule 3: Catch lockfile drift before it lands

Run `npm ci` (or `npm install --package-lock-only` and diff) in a pre-commit hook or PR check, and fail if `package-lock.json` would change unexpectedly. This package already uses `husky` + `lint-staged`, so the hook plumbing exists - add a lockfile-drift check there.

### Rule 4: Use Renovate `lockFileMaintenance`

Renovate's `lockFileMaintenance` opens a weekly PR that refreshes `package-lock.json` within declared semver ranges without touching `package.json`. This stops lockfile drift accumulating silently.

```json
{
  "lockFileMaintenance": {
    "enabled": true,
    "schedule": ["before 5am on monday"]
  }
}
```

### Rule 5: Set `minimumReleaseAge` to protect against rush-the-window attacks

The XZ backdoor (2024) and the axios hijack (2026) both succeeded partly because malicious versions reached consumers before the community reacted. Delay Renovate PRs for packages published less than N days ago:

```json
{ "minimumReleaseAge": "7 days" }
```

This is the most valuable single control for this package's native-dependency surface: a tampered tree-sitter or `@huggingface/transformers` release sits for a week before Renovate will even open the PR, giving socket.dev and the community time to flag it. For genuinely urgent security packages you can override `minimumReleaseAge` per package.

---

## The optionalDependencies / tree-sitter discipline

This package's `optionalDependencies` carry the real native risk: `@huggingface/transformers` and the tree-sitter grammar set, with `tree-sitter-c`, `tree-sitter-python`, and `tree-sitter-rust` pinned exactly in `overrides`. The `postinstall` hook runs `scripts/ensure-tree-sitter.mjs` to heal native ABI / arm64 build failures.

**Rules:**

- **Do not let Renovate auto-bump the pinned grammars.** `templates/renovate-base-config.json` includes a guarded rule that disables automerge for `tree-sitter-c`, `tree-sitter-python`, and `tree-sitter-rust` and keeps them aligned with the `overrides` block. Any bump there is a manual, reviewed change.
- **Keep `overrides` and `optionalDependencies` in sync.** If you bump a pinned grammar, update both places in the same PR, or `npm ci` resolution and the override diverge.
- **Never bypass `scripts/ensure-tree-sitter.mjs`.** It is the heal path for native build failures; removing it to "fix" a flaky install replaces a known control with silent breakage.
- **A failing tree-sitter postinstall is a triage event,** not just a CI annoyance - confirm the failure is an ABI/build issue (expected, healed by the script) and not an unexpected source or behavior change.

---

## Pinning vs semver ranges

| Context | Strategy | Reason |
|---|---|---|
| Pinned native grammars (`tree-sitter-c/python/rust`) | Exact pin via `overrides` | ABI stability + supply-chain control; the highest-risk surface |
| Other `optionalDependencies` (transformers, remaining grammars) | Range + `minimumReleaseAge` | Updatable, but held for the release-age window |
| Runtime `dependencies` | Range as declared, validated by `npm ci` | Reproducible via the lockfile |
| `devDependencies` | Range, Renovate automerge for patch/minor | Acceptable drift; build/test only |

---

*Previous: `guides/02-sbom-workflow.md`. Next: `guides/04-provenance-verification.md`.*
