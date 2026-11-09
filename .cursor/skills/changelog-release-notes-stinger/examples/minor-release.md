# Example: Hivemind Minor Release Entry

> Demonstrates: impact-first structure, user-centric language, what to omit, honest scope note.
> Guide references: `guides/01-changelog-format.md`, `guides/02-semver-decisions.md`, `guides/03-copy-craft.md`

---

## Input (what the team provided)

```
PRs merged since 0.7.96:
- Add `recall --since <date>` flag to scope recall by capture time (#812)
- Add `memory.search` MCP tool so agents can query without the CLI (#820)
- Speed up capture on large repos by batching embeddings (#805)
- Fix recall dropping the top result when >50 memories match (#818)
- Bump deeplake SDK 4.1 -> 4.2 (#809)
- Internal: split capture writer into its own module (#811)
- Started cross-repo recall, not shipping yet
```

---

## Semver decision

- New flag + new MCP tool = additive -> **MINOR** candidate.
- No contract removed or changed incompatibly. The deeplake SDK bump is internal (no schema change visible to clients).
- Highest candidate is MINOR -> `0.8.0`. Note: `release.yaml` auto-bumps patch by default, so this release must set `package.json` to `0.8.0` deliberately (`guides/04-release-mechanics.md`).

---

## Output (the CHANGELOG entry)

```markdown
## [0.8.0] - 2026-06-16

Recall got smarter, capture got faster, and agents can now query memory directly over MCP.

### Added
- **`recall --since <date>`:** scope recall to memory captured after a given date, so you can ask "what did we learn this week."
- **`memory.search` MCP tool:** agents can query memory directly over MCP instead of shelling out to the CLI.

### Improved
- Capture is up to 4x faster on repos over 10k files (embeddings are now batched).

### Fixed
- Recall no longer drops the most relevant memory when more than 50 match a query.
```

---

## What was deliberately omitted

- **Bump deeplake SDK 4.1 -> 4.2** - no user-visible behavior changed and the schema is unchanged. Omit.
- **Internal: split capture writer into its own module** - pure refactor, invisible to installers and harness users. Omit.

---

## Honest scope note (appended to the GitHub Release body, optional in CHANGELOG)

> **Coming next:** we started work on cross-repo recall but it is not ready for the quality bar we want. No ETA yet.

It names the capability, says it is not ready, gives no hard date, and does not apologize or cite an issue number.

---

## Release follow-through

- Heading `0.8.0` matches the deliberately-set `package.json` version (not the auto-patch).
- GitHub Release body = this entry (cut by `release.yaml`).
- README note: add `recall --since` and `memory.search` to the usage section.
- Slack: a short note that the new MCP tool is available, since harness users wiring agents will want it. No migration needed - purely additive.
