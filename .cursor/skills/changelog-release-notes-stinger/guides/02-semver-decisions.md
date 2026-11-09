# Guide 02: Semver Decisions

> Use when deciding the version bump for a set of changes, or when asked "is this breaking?"

*Derived from: `research/external/semver.md`, `research/internal/command-brief-notes.md`*

---

## The rule

@deeplake/hivemind follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html): `MAJOR.MINOR.PATCH`.

- **PATCH** (`0.7.2` -> `0.7.3`): backward-compatible bug fix. Nothing a correct caller relied on changes.
- **MINOR** (`0.7.3` -> `0.8.0`): backward-compatible new functionality. Existing callers keep working.
- **MAJOR** (`0.7.3` -> `1.0.0`): a backward-incompatible change to any public contract.

While on `0.x`, the project still uses these categories; a breaking change at `0.x` is signaled by bumping the **minor** if you treat `0.x` as pre-1.0 per the semver spec, but this repo's convention is to bump the leading number for true breaks once stable. **When in doubt, ask before labeling a break** - getting it wrong breaks downstream installs silently.

## The breaking-change surface (wider than a normal library)

Hivemind is consumed by harnesses and by agents at runtime. A change is **breaking** if it is not backward compatible on any of these contract surfaces:

### 1. CLI surface
- Removing or renaming a command or flag.
- Changing the meaning of an existing flag, or its default in a way that changes output.
- Changing exit codes or the shape of machine-readable (`--json`) output that scripts parse.

### 2. Library / API surface
- Removing or renaming an exported function, type, or option.
- Changing a function signature or a required option.
- Narrowing accepted input or changing returned shape.

### 3. Harness contracts
- The interface each of the six harnesses relies on to call into Hivemind. Renaming a hook, changing the arguments a harness passes, or changing what Hivemind hands back is breaking for that harness even if the npm install "works."
- Plugin manifest shape changes that a harness reads.

### 4. MCP tool surface
- Removing or renaming an MCP tool.
- Changing a tool's input schema (required params, types) or its result shape.
- Agents wired to a tool break the moment its contract shifts. Treat the MCP tool schema like a public API.

### 5. Deep Lake schema
- Changing the dataset/tensor schema that captured memory is written to or read from in a way that old clients cannot read new data, or new clients cannot read old data.
- Migrations that are not transparent. If a user on the old version cannot recall memory written by the new version (or vice versa), that is breaking.

## Decision flow

```
For each change in the release:

Does it change behavior a correct caller relied on, on ANY surface above?
  No  -> is it new capability?
           Yes -> MINOR candidate
           No  -> PATCH candidate (bug fix / internal only)
  Yes -> is it backward compatible (old callers/data still work)?
           Yes -> MINOR candidate (additive change)
           No  -> MAJOR / breaking. Needs Deprecated -> Removed path + migration notes.

Release bump = the highest candidate across all changes.
```

## Patch vs minor vs breaking: Hivemind examples

| Change | Bump | Why |
|---|---|---|
| Fix recall dropping a relevant result | PATCH | Bug fix; correct behavior was always intended. |
| Speed up capture on large repos | PATCH | No contract change. |
| Add a `--since` flag to `recall` | MINOR | Additive; existing callers unaffected. |
| Add a new MCP tool | MINOR | Additive to the tool surface. |
| Add an optional field to the Deep Lake schema that old clients ignore | MINOR | Backward compatible. |
| Rename the `skillify` command to `skill` | MAJOR | CLI break. Deprecate first, then remove. |
| Change an MCP tool's required input param | MAJOR | Tool-surface break; wired agents fail. |
| Change the capture tensor schema so old CLI can't read new datasets | MAJOR | Schema break; needs migration notes. |
| Change a harness hook signature | MAJOR | Harness contract break. |

## Breaking changes need a path

A breaking change is never just a CHANGELOG `Removed` bullet. It needs:

1. A `Deprecated` entry in an earlier release naming the replacement and the removal version, where feasible.
2. A `Removed` (or `Changed`) entry at the break, with migration steps.
3. Migration notes in the GitHub Release body and, for harness/MCP/schema breaks, a callout in the README and a Slack post.

See `examples/breaking-change.md` for a worked harness/MCP/schema break.

## When to escalate

If a change touches the harness contracts, MCP tool surface, or Deep Lake schema and you cannot confirm it is backward compatible, **stop and ask** before labeling the bump. A wrong call here is the most expensive mistake this Bee can make.
