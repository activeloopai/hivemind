---
source: external
type: standard
authority: high
relevance: high
topic: semantic-versioning
url: https://semver.org/spec/v2.0.0.html
retrieved: 2026-06-16
---

# Source: Semantic Versioning 2.0.0

**URL:** https://semver.org/spec/v2.0.0.html
**Why it matters:** @deeplake/hivemind is published to npm and depended on by harnesses and agents. The version number is a machine-and-human contract; getting the bump wrong breaks downstream installs silently.

## Core rules (MAJOR.MINOR.PATCH)

- **PATCH** - backward-compatible bug fixes only.
- **MINOR** - backward-compatible new functionality; existing callers keep working.
- **MAJOR** - any backward-incompatible change to the public API/contract.
- Pre-release and build metadata may be appended (`-rc.1`, `+build`), but the package's release flow ships clean `MAJOR.MINOR.PATCH`.
- `0.y.z` is for initial development; the spec permits breaking changes without a `1.0.0` bump, but a stable consumer base means breaks must still be signaled deliberately and documented. This repo's convention: bump the leading version segment for true breaks rather than ship them under an auto-patch.

## Mapping to Hivemind's contract surfaces

Semver says "public API." For this package the public API is wider than a typical library. A non-backward-compatible change to any of these is a MAJOR:

1. **CLI** - commands, flags, exit codes, `--json` output shape.
2. **Library / API** - exported functions, types, options, signatures, returned shapes.
3. **Harness contracts** - the interface the six harnesses use to call into Hivemind; plugin manifest shapes a harness reads.
4. **MCP tool surface** - tool names, input schemas, result shapes. Wired agents break the instant a tool's contract shifts.
5. **Deep Lake schema** - the dataset/tensor schema captured memory is written to and read from. If old and new clients cannot read each other's data, that is breaking.

## Practical guidance

- A breaking change needs a Deprecated -> Removed lineage plus migration notes; do not ship a bare removal.
- The `release.yaml` pipeline auto-bumps **patch** on routine pushes. Minor and breaking releases must set `package.json` deliberately so the auto-patch does not mislabel them.
- When unsure whether a harness/MCP/schema change is backward compatible, stop and confirm before labeling the bump.

## Applicability to stinger guides

- `guides/00-principles.md` - principle 4 (semver is a contract).
- `guides/02-semver-decisions.md` - the entire decision flow and the contract-surface list.
- `guides/05-audit-playbook.md` - the semver-accuracy dimension.
