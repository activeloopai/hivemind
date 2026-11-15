---
name: beekeeper-suit
description: Routing skill for the Cursor IDE Army. When the user makes a request, consult this skill to decide which Bee (subagent) owns the task and should be invoked. Each registered Bee has a guide in `guides/` describing its domain, trigger phrases, required inputs, outputs, and the situations in which it should NOT be invoked. Trigger this skill when the user's request looks like it might match a Bee's domain, when multiple Bees could plausibly handle the work, or when the user asks "who handles X?" / "which Bee does Y?".
license: MIT
---

# Beekeeper-Suit

The Beekeeper-Suit routing skill is how the primary Cursor orchestrator decides which Bee in the Army to delegate to. Each Bee owns one domain. Each Bee's domain is documented in a guide under `guides/`. This SKILL.md is the roster: a one-line index pointing to each Bee's full guide.

This Army is tuned for the **Hivemind** repo (`@deeplake/hivemind`): a TypeScript/Node (ESM, Node 22) codebase that gives coding agents cloud-backed shared memory powered by Activeloop Deep Lake. The Bees speak that stack: TypeScript + esbuild + Vitest, Deep Lake datasets and embeddings, the MCP server, the six harness integrations, and the `library/` documentation convention. There is no Django, React, Prisma, or Postgres here, and no Bee pretends there is.

**The Army's commitment:** every registered Bee is paired with exactly one Stinger (a Cursor skill). Bees are persona plus guardrails; Stingers are the procedural arsenal. Read the guide before routing, and invoke the Bee by its `name:` frontmatter value.

---

## Roster

| Bee | Domain | Trigger keywords | Guide |
|---|---|---|---|
| `typescript-node-worker-bee` | Modern TypeScript/Node as practiced in Hivemind: strict ESM on Node 22, tsconfig (Node16/ES2022/strict), esbuild multi-harness bundling with sync-versions, Vitest discipline, zod boundary validation, and the lean tsc + jscpd + husky gate (no ESLint/Prettier) | "review this TS", "fix an ESM import", "write a Vitest suite", "add a zod schema", "tsconfig strict", "jscpd duplication", "esbuild bundle" | [`guides/typescript-node-worker-bee.md`](guides/typescript-node-worker-bee.md) |
| `deeplake-dataset-worker-bee` | Deep Lake data architecture: the 7-table ColumnDef schema (`USING deeplake`), FLOAT4[768] embeddings, additive schema healing (no `IF NOT EXISTS` because 500-not-409), append-only version-bump, deeplake_index/vector/hybrid search, DeeplakeApi querying, SQL guards, dataset versioning, and BYOC storage | "design a Deep Lake table", "add a column", "schema healing", "hybrid search query", "append-only versioning", "BYOC storage", "DeeplakeApi" | [`guides/deeplake-dataset-worker-bee.md`](guides/deeplake-dataset-worker-bee.md) |
| `retrieval-worker-bee` | Retrieval and codify: hybrid lexical plus semantic recall over the `memory` and `sessions` tables, BM25/ILIKE fallback, embeddings integration, the skillify gate (KEEP/MERGE/SKIP) and propagation, and tree-sitter chunking for the codebase graph | "tune recall", "semantic vs lexical", "why did this query miss", "audit the skillify gate", "recall is noisy", "fix propagation", "score retrieval quality" | [`guides/retrieval-worker-bee.md`](guides/retrieval-worker-bee.md) |
| `embeddings-runtime-worker-bee` | Embeddings runtime: the local `@huggingface/transformers` plus nomic-embed-text-v1.5 (q8, 768-dim) daemon, socket IPC and lifecycle, Hivemind-scoped model and quantization selection, the embeddings-on vs BM25-fallback decision, and the dim-must-match-schema constraint | "embeddings daemon", "swap embedding model", "nomic-embed", "q8 quantization", "768-dim", "enable semantic search", "BM25 fallback" | [`guides/embeddings-runtime-worker-bee.md`](guides/embeddings-runtime-worker-bee.md) |
| `mcp-protocol-worker-bee` | MCP protocol authority: building and auditing MCP servers and tool contracts with `@modelcontextprotocol/sdk`, zod/v3 input schemas, stdio vs HTTP transport, JSON-RPC error model, capability negotiation, and cross-harness contract stability | "audit MCP server", "add a hivemind_ tool", "tool schema (zod/v3)", "stdio vs HTTP transport", "JSON-RPC error code", "tool vs resource" | [`guides/mcp-protocol-worker-bee.md`](guides/mcp-protocol-worker-bee.md) |
| `mcp-tool-docs-worker-bee` | Tool, API, and CLI documentation: honest MCP tool docs (name/purpose/zod-schema/output/side-effects/examples), the TypeScript public API via TypeDoc, the `hivemind` CLI reference, doc-to-code sync, and changelog discipline tied to the npm version | "document this MCP tool", "TypeDoc setup", "CLI reference", "doc honesty", "doc-sync", "tool schema docs" | [`guides/mcp-tool-docs-worker-bee.md`](guides/mcp-tool-docs-worker-bee.md) |
| `harness-integration-worker-bee` | Multi-harness integration: per-host adapters (installers, capability detection, hook lifecycle, native extensions, MCP registration, AGENTS.md markers) that plug Hivemind into Claude Code, Codex, Cursor, Hermes, pi, and OpenClaw while keeping the tool/hook contract identical across hosts | "wire a new harness", "add a hook event", "capability detection", "register MCP in hermes", "ClawHub bundle audit", "install-*.ts" | [`guides/harness-integration-worker-bee.md`](guides/harness-integration-worker-bee.md) |
| `ci-release-worker-bee` | Build, CI, and npm release: the esbuild multi-harness bundle plus sync-versions single-sourcing, the tsc + jscpd + Vitest quality gate, the GitHub Actions workflow architecture, npm publish discipline (files allowlist, prepack, pack-check), and tree-sitter native-dep healing | "the build is slow", "design our CI", "npm release", "files allowlist", "pack-check", "cross-node-install", "sync-versions" | [`guides/ci-release-worker-bee.md`](guides/ci-release-worker-bee.md) |
| `wiki-worker-bee` | Per-repo code-entity cartographer: uses Hivemind's tree-sitter codebase-graph extractor to file atomic, backlinked knowledge pages (entities, concepts, ADRs) into `library/knowledge/`, with ADR detection and the four-artifact contradiction protocol | TS driver: `mode: document / update / scan-directory / lint`. "extract entities from {file/dir}", "document this module's exports", "add this to the knowledge graph", "lint the wiki" | [`guides/wiki-worker-bee.md`](guides/wiki-worker-bee.md) |
| `dependency-audit-worker-bee` | npm supply-chain hygiene: Renovate vs Dependabot for this package, `npm audit` triage, the tree-sitter/optionalDependencies install-time risk (ensure-tree-sitter postinstall), SBOM from the tarball, npm provenance, and the publish-time guards (files allowlist, pack-check, audit:openclaw, CodeQL) | "audit our dependencies", "set up Renovate", "npm audit is noisy", "generate an SBOM", "tree-sitter postinstall", "npm provenance", "audit:openclaw" | [`guides/dependency-audit-worker-bee.md`](guides/dependency-audit-worker-bee.md) |
| `cursor-ide-worker-bee` | Cursor platform and harness: Cursor hooks (`hooks.json` 1.7+ wired by `install-cursor.ts`), the first-party `harnesses/cursor/extension` build, registering the Hivemind MCP server in Cursor, and the `.cursor/` Bee Army layout (rules `.mdc`, agents, skills, commands, model matrix) | "cursor hooks", "hooks.json", ".cursor/rules .mdc", "register Hivemind MCP in Cursor", "cursor extension", "Bee Army layout" | [`guides/cursor-ide-worker-bee.md`](guides/cursor-ide-worker-bee.md) |
| `changelog-release-notes-worker-bee` | Release communication for `@deeplake/hivemind`: a Keep-a-Changelog CHANGELOG.md, semver discipline across the CLI/library/harness/MCP/schema contract surfaces, impact-first release notes, and the sync-versions plus release.yaml mechanics | "write a changelog entry", "version bump", "semver decision", "breaking change", "release notes", "we just shipped" | [`guides/changelog-release-notes-worker-bee.md`](guides/changelog-release-notes-worker-bee.md) |
| `library-worker-bee` | Documentation lifecycle for `library/`: scaffolds the canonical structure, ingests GitHub issues into IRDs, authors PRDs, reverse-engineers code into backwards-PRDs, maintains the knowledge base, and runs drift audits | "initialize the library", "write a PRD", "ingest GitHub issues", "backwards-PRD this module", "document Z in the knowledge base", "docs sync audit" | [`guides/library-worker-bee.md`](guides/library-worker-bee.md) |
| `knowledge-worker-bee` | Narrative knowledge docs under `library/knowledge/private/<domain>/` (system overviews, the Deep Lake schema, the recall pipeline, the harness architecture, coding standards); works from ADRs and PRDs, never authors PRDs/IRDs/ADRs/QA | "document the auth architecture", "write the system overview", "create knowledge docs for this repo", "document how recall works internally" | [`guides/knowledge-worker-bee.md`](guides/knowledge-worker-bee.md) |
| `quality-worker-bee` | Quality assurance: verifies a completed implementation against the source plan (completeness, correctness, alignment, regressions); the final checkpoint of every plan execution loop, runs after `security-worker-bee` | "QA this", "check the implementation", "audit against the plan", "is this done?" | [`guides/quality-worker-bee.md`](guides/quality-worker-bee.md) |
| `security-worker-bee` | Security audit and remediation for the Hivemind surface: SQL injection into the Deep Lake API (sqlIdent/sqlStr/sqlLike), the string-based pre-tool-use VFS gate and its dynamic-path weakness, credentials/JWT/org-RBAC, PII in captured traces, prompt injection via recalled memory, and the npm/OpenClaw supply chain; second-to-last step in every implementation plan, runs before `quality-worker-bee` | "audit for security", "check for vulnerabilities", "scan for PII in traces", "OWASP review", "fix this Critical finding" | [`guides/security-worker-bee.md`](guides/security-worker-bee.md) |
| `git-worker-bee` | Git mastery: interactive rebase (squash, fixup, autosquash), conflict resolution (rerere, mergetool, diff3), history rewriting (git filter-repo, BFG), reset/reflog recovery, worktrees, hooks (Husky, lefthook), Git LFS, partial clone, sparse checkout, submodules vs subtrees | "squash my commits", "I pushed a secret", "my repo is huge", "undo that rebase", "recover my deleted branch", "work on two branches at once", "set up Git hooks" | [`guides/git-worker-bee.md`](guides/git-worker-bee.md) |
| `branching-strategy-worker-bee` | Branching strategy advisor: model selection (trunk-based development, GitHub Flow, GitFlow), release/hotfix branch patterns, the merge-vs-rebase argument, the long-lived-branch trap, and the feature-flag vs feature-branch decision | "which branching model should we use", "GitFlow or trunk-based?", "merge or rebase?", "feature flag or branch?", "set up Merge Queue", "migrate from GitFlow" | [`guides/branching-strategy-worker-bee.md`](guides/branching-strategy-worker-bee.md) |
| `code-review-pr-worker-bee` | Code review culture and PR lifecycle: PR descriptions, review checklists (blocker/suggestion/nit taxonomy), async-first review norms, the small-PR discipline, rubber-stamp detection, and the review-as-mentorship lens | "audit our PR culture", "write a PR description", "create a review checklist", "coach this review comment", "is this PR too large?", "improve code review" | [`guides/code-review-pr-worker-bee.md`](guides/code-review-pr-worker-bee.md) |
| `github-repo-health-worker-bee` | GitHub repository hygiene auditor: branch protection rulesets, Conventional Commits adherence, CODEOWNERS coverage, CI workflow density, docs presence, .gitignore, issue/PR templates, and repo settings; produces a scored report with a priority-ranked remediation plan | "audit this repo", "repo health check", "check branch protection", "CODEOWNERS audit", "CI checks configured", "GitHub repo hygiene" | [`guides/github-repo-health-worker-bee.md`](guides/github-repo-health-worker-bee.md) |
| `readme-writing-worker-bee` | README as conversion surface: authors, audits, and restructures `README.md` files using the canonical section order, badge discipline, OSS/internal register split, and README-driven development; emits a done checklist | "write a README", "audit my README", "README for this project", "README-driven development", "badges are broken", "quickstart doesn't work" | [`guides/readme-writing-worker-bee.md`](guides/readme-writing-worker-bee.md) |
| `adr-writing-worker-bee` | Architecture Decision Records: Nygard format (Context / Decision / Consequences / Alternatives), MADR extended template, Y-statement framing, supersession lifecycle, and the "decisions, not docs" discipline | "write an ADR", "record this decision", "supersede ADR-NNN", "set up our ADR log", "which ADR format?", "Nygard vs MADR" | [`guides/adr-writing-worker-bee.md`](guides/adr-writing-worker-bee.md) |
| `runbook-writing-worker-bee` | Operational runbook authorship: exact-command discipline, no-implied-context rule, escalation path architecture, rollback procedures, game-day methodology, and postmortem-to-runbook linkage (embeddings daemon, schema-heal, npm release ops) | "write a runbook", "audit this runbook", "our runbooks are out of date", "we need a runbook for this alert", "turn this postmortem into a runbook", "schedule a game day" | [`guides/runbook-writing-worker-bee.md`](guides/runbook-writing-worker-bee.md) |
| `technical-writing-craft-worker-bee` | Documentation craft: the Diataxis framework (tutorial/how-to/reference/explanation), inverted-pyramid prose, code-example discipline, voice and tone consistency, the reader-lens diagnostic, ghostwriting discipline, and docs-as-code PR review | "review this document", "is this doc well-written", "apply Diataxis", "ghostwrite this guide", "rewrite this introduction", "code example review" | [`guides/technical-writing-craft-worker-bee.md`](guides/technical-writing-craft-worker-bee.md) |
| `terminal-bash-worker-bee` | Terminal productivity surface: Bash/Zsh/Fish configuration, modern CLI tools (ripgrep, fd, fzf, bat, eza, zoxide), shell scripting, dotfile architecture, tmux/Zellij, just/Make task automation | "improve my dotfiles", "review this shell script", "set up tmux", "modern CLI tools", "bash best practices", "just vs make" | [`guides/terminal-bash-worker-bee.md`](guides/terminal-bash-worker-bee.md) |

> **25 Bees registered.** Every Bee in this roster has a spawnable agent in `.cursor/agents/`, a paired Stinger in `.cursor/skills/`, and a guide in `guides/`. To register another, add a row above and author its `guides/<bee-name>.md` from `templates/guide-template.md`.

---

## How to use this skill

1. **Match the request to a roster row.** Read the trigger keywords and the guide's "Trigger phrases" plus "Do NOT route when" sections. The negative section is as important as the positive section: it disambiguates near-overlapping Bees (for example `retrieval-worker-bee` owns recall quality while `embeddings-runtime-worker-bee` owns the embedding model that feeds it, and `deeplake-dataset-worker-bee` owns the schema underneath both).
2. **Verify the Bee's required inputs are present.** Each guide's "Inputs the Bee needs" section lists what must be supplied or inferable. If a required input is missing, batch a clarifying question rather than invoking with placeholders.
3. **Invoke the Bee by name.** The Bee's `name:` frontmatter is the routing handle (for example `typescript-node-worker-bee`).
4. **Watch for multi-Bee sequences.** Some requests legitimately need two Bees in series (build, audit, deploy). The "Multi-Bee orchestration" section below lists known sequences.

If no roster Bee matches, do not improvise a Bee. Handle the request inline, or register a new Bee (see "Adding a new Bee to the roster" below).

---

## Dispatching a Bee (the arming contract)

This is the canonical definition of how any orchestrator (`/the-beekeeper`, `/the-smoker`, or any future entry point) spawns a worker-bee. Follow it exactly; do not duplicate or paraphrase it in the calling command.

**Spawn at top level.** Use the Task tool at the main agent level. Do not nest sub-agents inside other sub-agents; Cursor cannot reliably nest-spawn.

**Arm every Bee before it starts.** Cursor does not auto-attach a skill to an agent. The spawn prompt MUST begin with this arming line:

> You are `<bee-name>`. Before doing anything else, read your paired Stinger at `.cursor/skills/<stinger-name>/SKILL.md` in full and follow it as your operating manual. Then: [scoped task, exact files in scope, definition of done, how the work will be verified].

**Resolve `<stinger-name>`.** Use the "Paired Stinger" link in the Bee's guide at `.cursor/skills/beekeeper-suit/guides/<bee-name>.md`, or apply the convention `<base>-worker-bee` -> `<base>-stinger` (for example `dependency-audit-worker-bee` -> `dependency-audit-stinger`).

**Failed dispatch rule.** A Bee dispatched without its Stinger loaded is a failed dispatch. Terminate and re-dispatch with the arming line present.

**Standard close-out.** Every implementation task ends with `security-worker-bee` (armed with `security-stinger`) first, then `quality-worker-bee` (armed with `quality-stinger`). Never run quality before security; security fixes can invalidate the QA result. See the "Plan execution loop" sequence below.

---

## Multi-Bee orchestration

Known sequences where multiple Bees run in order. Sequences are how the Army produces results larger than any single Bee.

### Plan execution loop (canonical close-out for every implementation)

1. The implementation Bee (any domain Bee) produces the code change.
2. **`security-worker-bee`** audits the Hivemind surface (SQL into Deep Lake, the pre-tool-use gate, credentials, trace PII, prompt injection, supply chain); remediates Critical and High findings in place.
3. **`quality-worker-bee`** verifies the final implementation against the source plan (completeness, correctness, alignment, regressions) and writes the QA report.

This is the canonical "is it done?" loop. Routing `quality-worker-bee` before `security-worker-bee` is a documented anti-pattern: security fixes may invalidate the QA report.

### Memory / retrieval feature

1. **`retrieval-worker-bee`** reviews, refactors, or extends recall and the skillify codify pipeline (hybrid search, BM25 fallback, the gate, propagation).
2. **`embeddings-runtime-worker-bee`** owns any change to the embedding model or daemon that feeds the FLOAT4[] columns (dim changes are a schema event).
3. **`deeplake-dataset-worker-bee`** designs or heals the tables and columns the feature reads or writes.
4. **`typescript-node-worker-bee`** owns the TypeScript implementation patterns underneath.
5. **`security-worker-bee`** then **`quality-worker-bee`** close out per the Plan execution loop.

### Compounding documentation (codebase graph + narrative)

1. **`wiki-worker-bee`** runs across code chunks using Hivemind's tree-sitter graph driver (`src/graph`), writing atomic entity pages, concept pages, ADR-detection pages, and contradiction-protocol artifacts into `library/knowledge/`.
2. **`library-worker-bee`** authors per-module narrative documentation under `library/knowledge/`, reading the entity pages at query time to enrich its narratives.

Together: `wiki-worker-bee` builds the atomic cross-reference graph; `library-worker-bee` writes the human-readable story around it. Neither replaces the other. `knowledge-worker-bee` writes the deeper private-domain narratives from ADRs and PRDs.

### Schema-touching feature

1. **`deeplake-dataset-worker-bee`** designs the table, columns, indexing, and additive heal shape (no `IF NOT EXISTS`; NOT NULL columns need a DEFAULT; append-only version-bump for skills/rules/goals/kpis).
2. The implementation Bee (`typescript-node-worker-bee`, `retrieval-worker-bee`, etc.) implements the DeeplakeApi data-access side.
3. **`embeddings-runtime-worker-bee`** is pulled in when the change touches an EMBEDDING column dimension.
4. **`security-worker-bee`** then **`quality-worker-bee`** close out per the Plan execution loop.

### Ship a release

1. The implementation Bees land the change and pass the Plan execution loop.
2. **`changelog-release-notes-worker-bee`** writes the CHANGELOG entry and release notes, and confirms the semver bump against the contract surface (CLI, library API, harness contracts, MCP tools, Deep Lake schema).
3. **`ci-release-worker-bee`** drives the build, the GitHub Actions workflows, and the npm publish (sync-versions, files allowlist, pack-check, publish-smoke-test).

> Add a sequence here whenever a new Bee is registered that fits an existing flow, or whenever a recurring multi-Bee pattern emerges in practice.

---

## Folder layout

- `SKILL.md` - this file (the roster plus orchestration index).
- `guides/<bee-name>.md` - one guide per registered Bee. Authored from `templates/guide-template.md`.
- `templates/guide-template.md` - the stub used to write a new Bee's Beekeeper-Suit-side guide.

---

## Adding a new Bee to the roster

To register another Bee (it must already have an agent in `.cursor/agents/` and a paired Stinger in `.cursor/skills/`):

1. Add a row to the **Roster** table above with the Bee name, domain, trigger keywords, and a link to its guide.
2. Copy `templates/guide-template.md` to `guides/<bee-name>.md` and fill it in from the Bee's agent file plus the Stinger's SKILL.md.
3. If the Bee fits an existing multi-Bee sequence (or starts a new one), update the **Multi-Bee orchestration** section.

The Bee is now discoverable. The orchestrator can find it.

---

*Part of the Cursor IDE Army curated by [Mario Aldayuz a.k.a @thenotoriousllama](https://github.com/thenotoriousllama).*
