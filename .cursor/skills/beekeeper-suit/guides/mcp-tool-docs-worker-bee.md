# MCP Tool Docs Worker-Bee - Beekeeper-Suit's Guide

The Beekeeper-Suit routing skill's record of when to invoke `mcp-tool-docs-worker-bee`. Use this guide to decide whether a user request belongs to this Bee.

**Bee:** [`.cursor/agents/mcp-tool-docs-worker-bee.md`](../../../agents/mcp-tool-docs-worker-bee.md)
**Stinger:** [`.cursor/skills/mcp-tool-docs-stinger/`](../../mcp-tool-docs-stinger/)
**Trigger policy:** proactive

---

## Domain

`mcp-tool-docs-worker-bee` owns Hivemind's tool, API, and CLI documentation surface - every artifact that turns real source into a usable reference. It covers MCP tool/resource documentation (honest name, purpose, zod input schema, output shape, side effects, examples), the TypeScript public API rendered with TypeDoc, the `hivemind` CLI command reference, doc-to-code sync, and changelog discipline tied to the `@deeplake/hivemind` npm package. Every doc is transcribed from the source (`src/mcp/server.ts`, `src/cli/index.ts`, the exported types), never paraphrased into something prettier-but-false.

## Trigger phrases

Route to `mcp-tool-docs-worker-bee` when the user says any of:

- "Document the MCP tools" / "document this MCP tool" / "write docs for hivemind_search"
- "Is this tool description honest" / "doc honesty"
- "Generate TypeDoc from the TS source" / "TypeDoc setup"
- "Document the hivemind CLI" / "CLI reference"
- "Keep docs in sync with code" / "doc-sync"

Or when a PR touches `src/mcp/server.ts`, the CLI, or exported TS types and the reference docs need to follow.

## Do NOT route when

- The user wants MCP protocol or transport internals, or to build/audit the server itself - that is `mcp-protocol-worker-bee`. This Bee documents the tool; the protocol Bee builds it.
- The user wants README authoring as a standalone deliverable - that is `readme-writing-worker-bee`.
- The user wants the `library/` knowledge convention or narrative knowledge-capture docs - that is `library-worker-bee` or `knowledge-worker-bee`.
- The user wants Deep Lake dataset schema design - that is `deeplake-dataset-worker-bee`.

If a request straddles two Bees' domains, prefer the narrower-scoped Bee and let this one act as backup.

## Inputs the Bee needs

Before invoking, ensure the user has provided (or you can infer):

- The source in scope (the tool handler, CLI command, or exported type to document).
- Access to `src/mcp/server.ts`, `src/cli/index.ts`, and the TypeDoc config if present.
- Optional: the target audience (npm consumer, harness user) and whether a changelog entry is also needed.

If the source in scope is missing, do not invoke yet - ask the user to point at it.

## Outputs the Bee produces

- MCP tool docs carrying all six parts (name, purpose, input schema, output shape, side effects, example), matched to real behavior.
- TypeDoc-rendered API reference from the TS doc comments (fix the source, regenerate; never a second copy).
- `hivemind` CLI reference and doc-sync findings tied to the npm version.

## Multi-Bee sequences this Bee participates in

- **MCP feature build** - after `mcp-protocol-worker-bee` lands the tool contract, `mcp-tool-docs-worker-bee` documents it honestly; `harness-integration-worker-bee` wires it into hosts.
- **Ship a release** - feeds the changelog discipline that `changelog-release-notes-worker-bee` owns for the user-facing release notes.

## Critical directives the orchestrator should respect

- **Read the source before writing a single line** - a tool doc that does not match `src/mcp/server.ts` is a bug, not documentation.
- **Tool descriptions and schemas must match real behavior** - an MCP client picks tools off their descriptions; a dishonest one fires the wrong tool.
- **Every MCP tool doc carries six parts.**
- **TypeDoc renders from the TS types, not hand-written prose** - fix the doc comment in the source and regenerate.
- **The changelog is tied to the npm version** (`sync-versions.mjs`).
- **Do not scope-creep into protocol internals or README authoring.**

(Full list lives in the Bee file's `## Critical directives` section.)

---

*Part of Beekeeper-Suit's roster. See [`.cursor/skills/beekeeper-suit/SKILL.md`](../SKILL.md) for the full Army.*

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
