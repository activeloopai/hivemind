# 08 - Native Deps (tree-sitter ABI healing)

Hivemind parses code with tree-sitter, which means native bindings, which means ABI and arch headaches. This guide is the analogue of "make the build reproducible across machines" - but for compiled native modules.

## Why this exists

`scripts/ensure-tree-sitter.mjs` (run on `postinstall`) heals tree-sitter native bindings. The concrete problems it solves, per the script's own header:

- `tree-sitter@0.21.x` ships **no linux-arm64 prebuild**.
- `tree-sitter-typescript@0.23.x` ships a **mislabeled (x86-64) prebuild**.
- On linux-arm64 both must be compiled from source, and under **Node >=22** that compile needs **C++20**, which `tree-sitter@0.21`'s `binding.gyp` does not request.

## The design

- **tree-sitter and its grammars are `optionalDependencies`.** So the expected arm64 prebuild failure does **not** abort `npm install` - npm tolerates an optional-dep build failure. This is deliberate. Moving them to `dependencies` would make every arm64 install hard-fail. **Do not** propose that move.
- **`postinstall` heals afterward.** `scripts/ensure-tree-sitter.mjs` runs after install, detects whether the bindings actually load (it constructs a `Parser`, sets each language, and parses a trivial string), and if not, recompiles from source with the right toolchain flags.
- **Non-fatal by contract.** On x64 / darwin / CI where the prebuilds work, it's a fast no-op. If no toolchain is available, it **warns and exits 0** rather than breaking the install. Hivemind degrades to no-tree-sitter rather than failing the consumer's `npm install`.

## The grammars it covers

`tree-sitter` plus `tree-sitter-{typescript,javascript,python,go,rust,java,ruby,c,cpp}`. The `package.json` `overrides` pin several grammar versions to exact patches to avoid the mislabeled-prebuild class of bug.

## Why `scripts` is in the `files` allowlist

`ensure-tree-sitter.mjs` must exist in the consumer's installed package for `postinstall` to run. That's why `scripts` is shipped (see `guides/06-npm-release.md`). It also means `scripts` must stay clean of anything secret - it's published.

## `rebuild:native` for manual repair

`npm run rebuild:native` = `node scripts/ensure-tree-sitter.mjs` - the same heal logic, runnable on demand if a developer's bindings break after a Node upgrade.

## Audit checklist

- **Don't remove `postinstall`.** Removing it so consumers must rebuild manually is **Must-fix** - it breaks the install-and-go contract.
- **Keep tree-sitter optional.** Promoting it to a hard dependency is a regression.
- **Keep it non-fatal.** A change that makes the heal script `exit 1` on a missing toolchain breaks installs on machines without a compiler - **Must-fix**.
- **CI proves it across Node versions.** `cross-node-install` (Node 22, 24) is where a regression in native install/heal surfaces. See `guides/04-workflows.md`.

## Cross-reference

- `research/2026-06-16-tree-sitter-native-abi-healing.md` - the ABI/arch problem space and the heal pattern.
- `guides/07-failure-modes.md` §4 - native-dep ABI break diagnosis.
