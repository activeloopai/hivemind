# Examples - wiki-stinger

Worked invocations of wiki-worker-bee and the resulting page writes. Each file shows: the invocation payload, the source code chunk, the git context, and the resulting page writes (entity / concept / decision / contradiction-report as applicable).

Used by wiki-worker-bee to mirror structure, tone, and frontmatter completeness when authoring real pages. All examples extract with tree-sitter and file pages into `library/knowledge/`.

## Examples in this folder

- `01-document-mode-typescript-module.md` - `document` mode against a small TS module from `src/graph/`; happy path; produces 1 module + function/data-model entities + 1 concept page.
- `02-update-mode-with-contradiction.md` - `update` mode where a function's return type changed; produces 1 contradiction with all four artifacts.
- `03-direct-mention-with-confirmation.md` - `@`-mention from a Cursor user; shows the scope-confirmation flow and the `partial_scan: true` response.

## Other invocation shapes to mirror

- ADR inferred from a high-confidence commit message -> a `library/knowledge/private/architecture/ADR-<n>-<slug>.md` page (Phase 5).
- A chunk with a file in a language with no wired grammar -> the stub-page reflex (guide 08).
- An `mcp-tool` entity (e.g. `hivemind_search`) that also creates the handler-function entity and links via `handler:`.
- A `deeplake-table` entity (e.g. `codebase`) linked to its paired `data-model` and backing `HIVEMIND_*_TABLE` env var.
- A `feature-flag` entity (e.g. `HIVEMIND_GRAPH_PUSH`) with `read_at:` branch sites and `gates:` pointing at the worker it enables.
