---
name: hivemind-graph
description: Query the local AST-derived code graph (functions, classes, calls, imports) for structural codebase questions — what calls X, what does Y import, where is Z defined, blast radius of a change. The graph rebuilds automatically after each agent turn; use hivemind_graph_search and hivemind_graph_neighborhood tools (no manual build step).
allowed-tools: hivemind_graph_search, hivemind_graph_neighborhood
---

# Hivemind Code Graph (OpenClaw)

A deterministic, AST-derived map of the current repository — every function,
class, method, interface, type, enum, const, and module, plus the edges between
them (`calls`, `imports`, `extends`, `implements`, `method_of`).

The graph **builds and refreshes automatically** after each turn (gated by rate
limit + git diff). You never run a build command — just call the graph tools.

Set `plugins.entries.hivemind.config.tuning.HIVEMIND_GRAPH_CWD` in
`~/.openclaw/openclaw.json` to the git root of the project you want indexed
when the gateway's working directory is not the repo (then restart the gateway).

Use the graph as a fast **INDEX** to locate the few files/symbols that matter,
then use the host's read/exec tools on the real source. It is not a substitute
for reading source files.

## When to use this skill

Activate when the user asks a *structural / relational* question about the code:

- "What calls `pushSnapshot`?" / "Who uses this function?"
- "What does `deeplake-pull.ts` import?" / "What depends on X?"
- "Where is `GraphSnapshot` defined?" / "Find the function that handles Y."
- "What are the main subsystems / the architecture here?"
- "If I change this signature, what's affected?"

## Tools

- `hivemind_graph_search({ pattern })` — search symbols by substring (or
  multi-token AND with `+`, e.g. `auth+handler`). Returns matches with 1-hop
  neighbors (callers, callees, imports). **Start here.**
- `hivemind_graph_neighborhood({ file })` — every symbol in a repo-relative
  file path plus its cross-file neighbors.

## Workflow

1. Broad structural question? `hivemind_graph_search({ pattern: "<symbol>" })`.
2. Know the file? `hivemind_graph_neighborhood({ file: "src/hooks/capture.ts" })`.
3. Need the actual code? Open the `source_file:line` from the tool output with
   the host read tool — don't answer from the graph alone.

## When NOT to use this skill

- Reading the **body** of a symbol you already located → use the host read tool.
- Code that isn't **committed/built** yet — the graph can lag uncommitted edits.
- Languages outside **TypeScript, JavaScript, and Python** — fall back to grep.

## Anti-patterns

- **Zero incoming callers does NOT mean dead code.** Instance-method dispatch and
  dynamic calls are not fully resolved.
- **The graph can be stale.** Prefer live source for files edited in this session.
- **`pattern` is lexical, not semantic** — try multiple keywords if the first misses.
