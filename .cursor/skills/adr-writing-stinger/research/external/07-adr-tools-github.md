---
source_url: https://github.com/adr/adr-tools
retrieved_on: 2026-05-20
source_type: github-readme
authority: official
relevance: high
topic: tooling
stinger: adr-writing-stinger
---

# adr-tools - Command-Line Tool for ADRs (npryce / adr.github.io fork)

## Summary

The original `npryce/adr-tools` bash CLI for managing ADRs, now maintained under the `adr` GitHub organization. The README explicitly states it is "Superseeded [sic] by log4brains." Key commands: `adr init <dir>` (creates directory and ADR-0001 about using ADRs), `adr new <title>` (creates sequentially numbered ADR and opens in editor), `adr new -s 9 <title>` (creates superseding ADR, marks ADR 9 as superseded). ADRs stored in `doc/adr` by default. The `-s` flag for supersession is the key CLI feature.

## Key quotations / statistics

- "Superseeded by log4brains" (official deprecation notice in README)
- `adr init doc/architecture/decisions` - creates directory and first ADR (about using ADRs)
- `adr new Implement as Unix shell scripts` - creates a new numbered ADR
- `adr new -s 9 Use Rust for performance-critical functionality` - supersedes ADR 9
- "This will create a new ADR file that is flagged as superceding ADR 9, and changes the status of ADR 9 to indicate that it is superceded by the new ADR."
- `adr help` for full command reference
- ADRs stored in `doc/adr` by default (Nygard's convention; Log4brains uses `docs/adr`)
- The tool is implemented as Unix shell scripts; requires bash (not Windows-native)

## Annotations for stinger-forge

- `guides/05-tooling-integration.md`: Include adr-tools as the "legacy/minimal option" for teams that prefer a pure bash CLI with no Node dependency. Flag the Windows incompatibility.
- The `-s <N>` supersession flag is the key feature to document: it atomically marks the old ADR superseded and creates the new one. This should appear in the supersession workflow guide too.
- `guides/04-supersession-workflow.md`: The `adr new -s 9` pattern shows that tooling enforces bidirectional linking automatically - this is a strong argument for using tooling over manual management.
- Important: the tool is officially deprecated in favour of log4brains. Stinger-forge should position this as "historical/minimal" with a clear recommendation to prefer log4brains for new projects.
- The convention of ADR-0001 being a meta-ADR about the decision to use ADRs is enforced by `adr init` - this is the canonical onboarding pattern worth carrying forward.
