---
title: Wikilink resolution algorithms
date: 2026-04-29
sources:
  - https://forum.obsidian.md/t/settings-new-link-format-what-is-shortest-path-when-possible/6748
  - https://github.com/obsidianmd/obsidian-releases/pull/66
  - https://github.com/penfieldlabs/obsidian-wikilink-types/blob/main/prompts/verify-and-repair.md
---

# Wikilink resolution algorithms

## Summary
Obsidian's wikilink resolution is the de facto standard wiki-worker-bee must mirror because Cursor previews wikilinks via the same convention. Three rules govern resolution: (1) bare name `[[Foo]]` resolves to any file named `Foo.md` regardless of folder; (2) on collisions, "shortest path when possible" picks the file with the shortest unique repo-relative path; (3) folder-prefixed names `[[folder/Foo]]` resolve only to that path. Wikilinks are case-insensitive and may include heading anchors (`[[Foo#Heading]]`) and aliases (`[[Foo|display text]]`). For lint-mode dead-link detection, the algorithm splits link -> path + subpath, then resolves against the file index.

## Key facts
- Three wikilink syntaxes:
  - `[[Note]]` - bare name; resolves to any matching `Note.md`.
  - `[[folder/Note]]` - partial path; matches files where the suffix matches.
  - `[[../relative/Note]]` - relative path; matches by walking from current file.
- Aliases: `[[Note|display text]]` - pipe character separates target from rendered text.
- Anchors: `[[Note#Heading]]`, `[[Note#Heading#Subheading]]`, `[[Note#^block-id]]` - strip everything after `#` to find file target. `[[#Heading]]` (no file) is a same-file anchor - always valid.
- Embeds: `![[Note]]` - same resolution rules but inline-embedded.
- Case-insensitive matching: `[[my note]]` matches `My Note.md`.
- Obsidian's "Shortest path when possible" mode (the default since 2020): if the file name is unique, only the bare name; if not unique, the absolute path from vault root.
- Resolution algorithm pseudo-code:
  1. Strip trailing `#anchor` and `|alias` from raw link text -> `pathPart`.
  2. Build a vault-wide index `Map<lowercaseFilename, file[]>` where the key is the basename (without `.md`) and the value is the array of files with that name.
  3. If `pathPart` contains `/`, do a suffix match against repo-relative paths.
  4. Else lookup by basename: if 1 match, resolve; if >1, pick "shortest unique path"; if 0, broken link.
- Obsidian API surfaces (for porting):
  - `getLinkpath(rawLink)` -> strips anchor/alias, returns path-only string.
  - `MetadataCache.getFirstLinkpathDest(linkpath, sourcePath)` -> resolves to the target `TFile` or `null`.
  - `MetadataCache.unresolvedLinks` -> built-in dead-link map (not exposed publicly, but documented).
- Near-match heuristics for lint repair (from the penfieldlabs/obsidian-wikilink-types prompt):
  - Case difference -> fix.
  - Levenshtein distance ≤ 2 -> fix if unambiguous; flag otherwise.
  - Plural/singular difference -> flag, don't auto-fix.
  - Missing folder prefix -> fix to actual location.

## Recommended approach for wiki-worker-bee

For **authoring** wikilinks: always emit the full repo-relative form `[[entities/foo]]` (with the `entities/` prefix). This avoids the shortest-path ambiguity entirely and makes grep-based scans trivial. The graph driver can compress to bare names at render time if desired. For **lint-mode dead-link detection**, implement this algorithm (in the graph driver, not the agent - the agent reports gaps it noticed in-flight, not the global lint sweep):

```ts
function resolveWikilink(link: string, sourcePath: string, vaultIndex: Map<string, string[]>): string | null {
  // 1. Strip alias and anchor
  const pathPart = link.split('|')[0].split('#')[0].trim();
  if (!pathPart) return null;  // same-file anchor - always valid, no file resolution

  // 2. Lowercase + slash-normalize
  const key = pathPart.toLowerCase().replace(/\\/g, '/');

  // 3. Suffix-match if path-like
  if (key.includes('/')) {
    const matches = [...vaultIndex.values()].flat()
      .filter(f => f.toLowerCase().endsWith(key + '.md') || f.toLowerCase() === key + '.md');
    return pickShortest(matches) ?? null;
  }

  // 4. Bare-name lookup
  const basenameMatches = vaultIndex.get(key);
  if (!basenameMatches) return null;
  return pickShortest(basenameMatches);
}
```

For lint-finding categories (matching the brief's 8-category list for the `Scan Directory` button):
- **Dead link** - `resolveWikilink` returns `null`.
- **Ambiguous link** - multiple basename matches with same path depth (genuinely ambiguous, not just colliding bare names where shortest-path picks a winner).
- **Case-mismatch link** - resolves but wrong case in text.
- **Orphan page** - page with no incoming wikilinks (no other page links to it).

For wiki-worker-bee itself in `document`/`update` modes: when a wikilink in the chunk references an entity not yet authored, emit a `gap` in the response payload with `{entity, referenced_in: file:line, reason}` per the brief. Don't try to resolve it in-flight - the driver runs reconciliation.

## Sources
- [Obsidian forum: Settings: New Link Format: What is "Shortest path when possible"?](https://forum.obsidian.md/t/settings-new-link-format-what-is-shortest-path-when-possible/6748) - date retrieved 2026-04-29 - definitive answer from Obsidian devs on resolution semantics.
- [obsidian-dangling-links PR #66](https://github.com/obsidianmd/obsidian-releases/pull/66) - date retrieved 2026-04-29 - Obsidian dev guidance on `getLinkpath` + `getFirstLinkpathDest` API.
- [penfieldlabs/obsidian-wikilink-types verify-and-repair prompt](https://github.com/penfieldlabs/obsidian-wikilink-types/blob/main/prompts/verify-and-repair.md) - date retrieved 2026-04-29 - production ruleset for wikilink lint with near-match heuristics.

## Quotes worth preserving
> "If the file name is unique, then it's just the filename. If it's not unique, then it's the absolute path from the vault root." - Obsidian devs, on shortest-path resolution
> "The link resolution algorithm is a lot more complicated than what you seem to be testing for `!allFiles.has(link.link)`. It splits the link into path & subpath and then resolves relative/absolute/unique file names case insensitive." - graydon, Obsidian dev, PR #66
> "Wikilinks are case-insensitive for matching (`[[my note]]` matches `My Note.md`)." - penfieldlabs verify-and-repair prompt

## Open questions / gaps
- For Cursor's preview, does shortest-path resolution apply, or does Cursor only render `[[bare-name]]` literally? Tested briefly - Cursor renders wikilinks as plain text in markdown preview unless an extension is installed. Recommend wiki-worker-bee treat wikilinks as machine-greppable internal anchors first, human-readable second; the graph driver can offer a "render-as-Obsidian" preview mode.
- Should wiki-worker-bee dedupe near-name entities (e.g., `getUser` vs `get-user`)? Recommend kebab-case for filenames AND camelCase preserved in body - this avoids 90% of dedup ambiguity. Document in the Bee guide.
