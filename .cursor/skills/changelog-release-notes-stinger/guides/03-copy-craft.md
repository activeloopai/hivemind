# Guide 03: Copy Craft

> Use when writing a CHANGELOG entry or GitHub Release notes. Apply every time, regardless of release size.

*Derived from: `research/external/changelog-copy-craft.md`, `research/external/keep-a-changelog.md`*

---

## The impact-first entry

A Hivemind entry leads with the most meaningful change, then fills the Keep-a-Changelog sections:

```markdown
## [0.8.0] - 2026-06-16

Recall got smarter and capture got faster. One new MCP tool for agents.

### Added
- **`recall --since`**: scope recall to memory captured after a given date.
- **`memory.search` MCP tool**: agents can now query memory without shelling out to the CLI.

### Improved
- Capture is up to 5x faster on repos over 10k files.

### Fixed
- Recall no longer drops the most relevant memory when more than 50 match a query.

### Changed
- `skillify` now writes skills to `.hivemind/skills/` instead of the repo root. Existing skills are read from both locations; move them at your convenience.
```

Drop sections that have nothing in them. `Improved` is an acceptable alias for additive `Changed` items that are pure upside; reserve `Changed` for behavior shifts users must notice.

## Hivemind verb table - replace implementation verbs with impact verbs

| Implementation phrasing | Replace with |
|---|---|
| "refactored the recall ranker" | "recall returns more relevant results" (if true) - or omit if invisible |
| "bumped the deeplake SDK" | name the user-facing effect, or omit if none |
| "fixed race condition in capture writer" | "capture no longer occasionally loses the last memory of a session" |
| "patched CVE-XXXX in <dep>" | "Fixed a security vulnerability in <component>" (Security section) |
| "resolved #1234" | describe the symptom, not the issue number |
| "optimized the embedding batch" | "capture is now <N>x faster on large repos" |

## The before / after test

For every bullet, ask: "if I read this without knowing the Hivemind internals, do I understand what changed for me as a user of the CLI / library / harness / MCP tools?"

- **Pass:** "Recall no longer returns stale results after you re-capture the same file."
- **Fail:** "Invalidate the recall cache key on capture upsert."

## Quantify when you can

- "Capture is up to 5x faster on repos over 10k files" beats "improved capture performance."
- "Recall latency down from ~800ms to ~120ms on warm datasets" beats "faster recall."

No metric? Qualitative is still better than an implementation note: "noticeably faster" is fine; "perf improvements" is not.

## Honest scope note

When to include it:
- A capability was discussed publicly or is heavily requested and did NOT ship.
- A break is coming and you want to set expectations (pair with `Deprecated`).
- There was a rollback users might notice.

Format:

> "We started work on cross-repo recall but it is not ready for the quality bar we want. No ETA yet."

Do NOT: give a hard date you are not confident in, apologize, over-explain, or name an issue number.

## Audience: speak to installers and harness users

Two readers:
1. **Developers who `npm i -g @deeplake/hivemind`** - care about CLI commands, library API, install/upgrade safety.
2. **Six-harness users** - care about harness-contract changes, the MCP tool surface, and whether their wired setup still works.

When a change is harness- or MCP-specific, say so explicitly ("Harness contract:", "MCP:") so the right reader knows it is theirs.

## Tone calibration

1. Read the last two or three CHANGELOG entries; match register and length.
2. Keep the engineer voice: concise, concrete, no marketing fluff.
3. Strip jargon the reader will not know: internal module names, dependency names they do not call directly, issue IDs.

## Anti-patterns

- Pasting raw `git log --oneline` as bullets.
- Marketing adjectives ("revolutionary", "game-changing"). This is a developer tool; state what changed.
- Future tense about the current release ("we will add X") - it shipped (past/present) or it is an honest scope note.
- Listing internal-only changes (refactors, CI, tests) unless the team explicitly wants to signal transparency.
- A version heading that does not match the shipped version (see `guides/04-release-mechanics.md`).
