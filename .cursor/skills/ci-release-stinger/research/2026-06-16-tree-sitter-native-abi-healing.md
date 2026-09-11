# tree-sitter native ABI / arm64 healing on postinstall

**Date:** 2026-06-16
**Feeds:** `guides/08-native-deps.md`, `guides/07-failure-modes.md`

## Claim

Hivemind heals tree-sitter native bindings on install so a consumer never has to manually rebuild native modules, and degrades gracefully when no toolchain is present.

## Evidence (from the repo, `scripts/ensure-tree-sitter.mjs` header + body)

- The script's own header states: `tree-sitter@0.21.x` ships no linux-arm64 prebuild; `tree-sitter-typescript@0.23.x` ships a mislabeled (x86-64) prebuild; on linux-arm64 both must compile from source, and under Node >=22 that compile needs C++20, which `tree-sitter@0.21`'s `binding.gyp` does not request.
- tree-sitter + grammars are declared as `optionalDependencies` precisely so the expected arm64 build failure does not abort `npm install`; the script then heals afterward.
- `package.json`: `"postinstall": "node scripts/ensure-tree-sitter.mjs"`, `"rebuild:native": "node scripts/ensure-tree-sitter.mjs"`.
- The script tries to load the bindings (constructs a `Parser`, sets each language, parses a trivial string) and recompiles from source only if that fails. On platforms where the prebuilds work it is a fast no-op. It is non-fatal: with no toolchain it warns and exits 0.
- `overrides` pin several grammar versions to exact patches to dodge the mislabeled-prebuild bug class.

## Why it matters

- Keeping tree-sitter optional + healing on postinstall is what makes `npm i -g @deeplake/hivemind` "just work" across x64/arm64 and Node 22/24. Promoting it to a hard dependency, or making the heal `exit 1` on a missing compiler, would break installs - both are Must-fix regressions.
- `cross-node-install` (Node 22, 24) is where a regression in this path surfaces in CI.

## Sources

- node-tree-sitter: https://github.com/tree-sitter/node-tree-sitter
- Node N-API / ABI versioning: https://nodejs.org/api/n-api.html
- Repo: `scripts/ensure-tree-sitter.mjs`, `package.json`.
