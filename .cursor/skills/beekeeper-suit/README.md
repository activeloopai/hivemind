# Beekeeper-Suit

The master routing skill for the Beekeeper-Suit repository Cursor setup.

Beekeeper-Suit does not perform work. It routes the primary Cursor agent's tasks to the correct Bee (subagent) in the Army, passing along the paired Stinger (skill) so every delegation arrives fully equipped.

## Entry point

- [`SKILL.md`](./SKILL.md): the skill definition Cursor loads.

## Roster

25 Bees registered. Each Bee has a dedicated, in-depth guide:

- [`guides/typescript-node-worker-bee.md`](guides/typescript-node-worker-bee.md)
- [`guides/deeplake-dataset-worker-bee.md`](guides/deeplake-dataset-worker-bee.md)
- [`guides/retrieval-worker-bee.md`](guides/retrieval-worker-bee.md)
- [`guides/embeddings-runtime-worker-bee.md`](guides/embeddings-runtime-worker-bee.md)
- [`guides/mcp-protocol-worker-bee.md`](guides/mcp-protocol-worker-bee.md)
- [`guides/mcp-tool-docs-worker-bee.md`](guides/mcp-tool-docs-worker-bee.md)
- [`guides/harness-integration-worker-bee.md`](guides/harness-integration-worker-bee.md)
- [`guides/ci-release-worker-bee.md`](guides/ci-release-worker-bee.md)
- [`guides/wiki-worker-bee.md`](guides/wiki-worker-bee.md)
- [`guides/dependency-audit-worker-bee.md`](guides/dependency-audit-worker-bee.md)
- [`guides/cursor-ide-worker-bee.md`](guides/cursor-ide-worker-bee.md)
- [`guides/changelog-release-notes-worker-bee.md`](guides/changelog-release-notes-worker-bee.md)
- [`guides/library-worker-bee.md`](guides/library-worker-bee.md)
- [`guides/knowledge-worker-bee.md`](guides/knowledge-worker-bee.md)
- [`guides/quality-worker-bee.md`](guides/quality-worker-bee.md)
- [`guides/security-worker-bee.md`](guides/security-worker-bee.md)
- [`guides/git-worker-bee.md`](guides/git-worker-bee.md)
- [`guides/branching-strategy-worker-bee.md`](guides/branching-strategy-worker-bee.md)
- [`guides/code-review-pr-worker-bee.md`](guides/code-review-pr-worker-bee.md)
- [`guides/github-repo-health-worker-bee.md`](guides/github-repo-health-worker-bee.md)
- [`guides/readme-writing-worker-bee.md`](guides/readme-writing-worker-bee.md)
- [`guides/adr-writing-worker-bee.md`](guides/adr-writing-worker-bee.md)
- [`guides/runbook-writing-worker-bee.md`](guides/runbook-writing-worker-bee.md)
- [`guides/technical-writing-craft-worker-bee.md`](guides/technical-writing-craft-worker-bee.md)
- [`guides/terminal-bash-worker-bee.md`](guides/terminal-bash-worker-bee.md)

## Adding new Bees

The `hive-registrar` skill forges new Bees end to end. To register a new Bee with Beekeeper-Suit after the artifacts exist:

1. Add the Bee to the roster table in [`SKILL.md`](./SKILL.md).
2. Author a new guide under [`guides/`](./guides/) using [`templates/guide-template.md`](./templates/guide-template.md).
3. Update the multi-Bee orchestration section in `SKILL.md` if the new Bee fits an existing sequence.

## Philosophy

See [`references/philosophy.md`](./references/philosophy.md) for the rationale behind routing over generalization.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
