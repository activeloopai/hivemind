# Guide 08 - Stub Pages for Unsupported-Language Files

Entity extraction runs on **tree-sitter** with grammars for nine languages: c, cpp, go, java, javascript, python, ruby, rust, typescript (see `src/graph/extract/index.ts`). Files in those languages get full extraction. Files in a language with NO wired grammar (`.lua`, `.swift`, `.kt`, `.php`, `.sql`, `.yml`, `.toml`, shell scripts, etc.) get **filename-only stub pages** so the knowledge area acknowledges their existence and a future grammar addition can find and upgrade them in place.

## When to write a stub

In Phase 1 (Parse the chunk), for each file in the chunk whose extension routes to NO extractor in `src/graph/extract/index.ts` - and is also NOT a known special case handled elsewhere (Deep Lake table column arrays go to `deeplake-table`; config JSON read by the loader may yield `config-key` entities):

1. Detect the language from the extension.
2. Write a stub entity page per the rules below.
3. Skip ALL further phases for that file - no concept extraction, no contradiction check, no per-file ADR detection (chunk-level commits are still scanned for ADR signals, just not per-file).

## Stub filename pattern

**Basename only, source extension recorded in frontmatter.**

```
Source file:           scripts/migrate.sh
Stub page:             entities/migrate.md
```

NOT `entities/migrate.sh.md`. The basename is the page name; the original extension lives in `source_extension:` frontmatter.

This keeps page names stable when a grammar is added later: `entities/migrate.md` becomes a real entity page with full extraction, but the filename and any wikilinks pointing at it remain valid.

## Stub frontmatter (template)

```yaml
---
type: entity
title: "migrate"
entity_type: module               # default for stubs; full extraction may re-classify
status: stub                      # tells lint mode this is awaiting a grammar upgrade
created: "2026-04-29"
updated: "2026-04-29"
path: "scripts/migrate.sh"        # full source path, repo-relative
language: shell                    # from extension detection
source_extension: ".sh"           # original extension preserved
last_commit_hash: "abc123"
depends_on: []
used_by: []
tags:
  - entity
  - stub
related: []
sources: []
---

# migrate

> [!gap]
> This file is in a language with no wired tree-sitter grammar (`shell`).
> A stub page has been filed so the knowledge area acknowledges its existence and incoming wikilinks remain valid.
> Adding a tree-sitter grammar for this language will upgrade this page in place.

## Source

`scripts/migrate.sh` - last touched in commit `abc123` ({author}, {date}).
```

That is it. No body extraction. No connections. No history beyond the last_commit fact.

## Filename collision handling

If two files in different folders share a basename (`scripts/migrate.sh` and `tools/migrate.sh`), the basename-only convention collides. Resolution:

1. First file processed wins the bare name: `entities/migrate.md`.
2. Subsequent files get a path-disambiguated suffix: `entities/migrate-tools.md`, `entities/migrate-scripts.md` (suffix is the parent directory name).
3. The collision is also flagged in the response payload's `gaps:` array as `{entity: "migrate", referenced_in: "<second-file-path>", reason: "basename collision with <first-file-path>"}` so the user can decide whether to rename or accept the disambiguation.

This collision logic only applies to stubs. Extracted entities are uniquely named by their symbol name, so basename collisions are a stub-specific problem.

## What the stub page implies for lint mode

[`guides/09-lint-mode.md`](09-lint-mode.md) treats `status: stub` as a known incomplete state. A stub is NOT an orphan even if no other page links to it - its presence is the marker, and a future grammar upgrade will populate `used_by:` from real extraction.

Lint mode does flag a stub if:
- `last_commit_hash` is older than the source file's actual last commit (the stub is stale and needs a refresh).
- The `source_extension` field is missing or empty.

## Why not just skip unsupported-language files

Three reasons:

1. **Wikilink integrity.** If a TS file references a shell script via a comment (`// see: scripts/migrate.sh`), the agent might wikilink to it. Without a stub page, the link is dead.
2. **Coverage visibility.** When the user runs an initial scan on a polyglot repo, the knowledge area should reflect that reality even where no grammar is wired yet.
3. **Upgrade path.** When a grammar is added, the upgrade walks `entities/*.md` looking for `status: stub`, identifies the source file via `path:`, and upgrades in place. Without stubs, the upgrade has no anchor.

## What is NOT a stub

These get full treatment in v1, NOT stubs:

- Any file in one of the nine wired tree-sitter grammars (c/cpp/go/java/js/python/ruby/rust/ts) -> full extraction per [`guides/04-entity-extraction-by-type.md`](04-entity-extraction-by-type.md).
- Deep Lake table column arrays in `src/deeplake-schema.ts` -> `deeplake-table` entities.
- `.json` config read at runtime by Hivemind's config loader -> may yield `config-key` entities.

Everything else outside the nine grammars and the special cases above -> stub.

## Source

Stub filename pattern: basename-only convention. The supported-language set comes directly from `src/graph/extract/index.ts` (the live extractor dispatch).
