---
name: hivemind-graph
description: Query the local code graph (functions, classes, calls, imports) through the Deeplake mount at memory/graph/. Use when the user asks structural questions about the codebase — "what calls X?", "what does Y import?", "where is Z defined?", "what's the architecture / which subsystems exist?", "what's the impact of changing this?". The graph is an AST-derived map of the repo, queried as files (no build needed — it rebuilds automatically).
allowed-tools: Read Bash
---

# Hivemind Code Graph

A deterministic, AST-derived map of the current repository — every function,
class, method, interface, type, enum, const, and module, plus the edges between
them (`calls`, `imports`, `extends`, `implements`, `method_of`). It is queried as
synthesized files under the Deeplake mount; there are no real files on disk and
no network call in the read path.

The graph **builds and refreshes automatically** (on Stop / SessionEnd, gated by
a rate limit + git diff). You never run a build command — just read it.

Use it as a fast **INDEX** to locate the few files/symbols that matter, then open
them with `Read` to answer. It is not a substitute for the source.

## When to use this skill

Activate when the user asks a *structural / relational* question about the code:

- "What calls `pushSnapshot`?" / "Who uses this function?"
- "What does `deeplake-pull.ts` import?" / "What depends on X?"
- "Where is `GraphSnapshot` defined?" / "Find the function that handles Y."
- "What are the main subsystems / the architecture here?"
- "If I change this signature, what's affected?" → use `impact/<symbol>` (transitive blast radius)

## When NOT to use this skill

- Reading the **body** of a symbol you already located → use `Read` on the real
  source file. The graph gives location + relationships, not full source.
- Code that isn't **committed/built** yet — the graph can lag uncommitted edits.
  If a file's mtime is newer than the build timestamp, read the live source.
- Languages outside **TypeScript, JavaScript, and Python** (Go, Rust, …) — the
  extractor covers those three, with cross-file `calls`/`imports` resolved for
  named imports. For anything else, fall back to grep/read.

## Path cheat sheet

```bash
cat ~/.deeplake/memory/graph/index.md
#   Overview: node/edge counts, kind breakdown, top files by node count.

cat ~/.deeplake/memory/graph/query/<pattern>   # START HERE (the 2-in-1)
#   Search + expand the top matches with their 1-hop neighbors (callers,
#   callees, imports, heritage). Multi-token AND: query/<a>+<b>.

cat ~/.deeplake/memory/graph/find/<pattern>
#   Case-insensitive substring search on node id + label (max 50 hits).
#   Prints numbered handles [1] [2] ... saved for this worktree.

cat ~/.deeplake/memory/graph/show/<handle-or-pattern>
#   <handle>: a digit from a prior find/ (e.g. 3).
#   <pattern>: a substring → unique node detail, or a candidate list.
#   Output: the node + its 1-hop neighbors grouped by edge relation.

cat ~/.deeplake/memory/graph/neighborhood/<file>
#   Every symbol in a file + its cross-file neighbors (callers/callees/imports).

cat ~/.deeplake/memory/graph/impact/<pattern>
#   Transitive dependents — the blast radius of changing a symbol.

cat ~/.deeplake/memory/graph/path/<from>/<to>
#   Shortest dependency path between two symbol patterns (trace a flow across files).

cat ~/.deeplake/memory/graph/layers      # architectural layers / subsystems
cat ~/.deeplake/memory/graph/tour        # deterministic guided walkthrough
```

## Workflow

1. Broad? Start at `index.md` to see subsystems and the biggest files.
2. Looking for a symbol? `find/<name>` (or `query/<name>`) → pick the handle.
3. Want relationships? `show/<handle>` / `neighborhood/<file>` → callers/callees, imports.
4. Tracing a flow? `path/<from>/<to>`. Change impact? `impact/<symbol>`.
5. Need the actual code? Take the `source_file:line` and `Read` it — don't answer from the graph alone.

## Anti-patterns (read these)

- **"Incoming (0)" does NOT mean dead code.** Cross-file `calls` are resolved for
  *named imports* (TS/JS/Python), but **instance-method dispatch** (`obj.method()`),
  dynamic calls, and nested/inner functions are NOT — a zero-incoming symbol may
  still be reached via one of those. Confirm in the source before calling it unused.
- **The graph can be stale.** It rebuilds at most once per rate-limit window. The
  SessionStart inject prints the build age; if it's old or you've just edited a
  file, prefer the live source for that file.
- **Don't try to build it.** There is no user-facing build step in normal use;
  the hooks handle it. Just read the mount.
- **`find/` is lexical, not semantic.** It matches substrings, not meaning —
  `find/auth` won't surface `login`/`credentials` unless those strings appear in
  the id/label. Try multiple keywords if the first misses.
