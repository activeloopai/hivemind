# Guide 04 - Entity Extraction by Type

The comprehensive 13-type catalog, retargeted for a TypeScript / Node / Deep Lake / MCP codebase (Hivemind). For each `entity_type` value in [`references/frontmatter-schema.md`](../references/frontmatter-schema.md), this guide names the detection heuristic, the tree-sitter node/edge surface to read, the required frontmatter, the body sections to populate, and the gotchas.

**Extraction engine:** tree-sitter, the same engine `src/graph/extract/*` already runs. Nine grammars are wired (c, cpp, go, java, javascript, python, ruby, rust, typescript). The TS/TSX extractor (`src/graph/extract/typescript.ts`) walks the AST and emits declaration nodes (`function`, `class`, `method`, `interface`, `type_alias`, `enum`, `const`, `module`) plus edges (`imports`, `calls`, `extends`, `implements`, `method_of`). wiki-worker-bee reads those nodes/edges and classifies them into the 13 catalog sub-types below. Files in a language with no wired grammar get filename-only stubs per [`guides/08-stub-pages-for-unsupported-langs.md`](08-stub-pages-for-unsupported-langs.md).

**Reading the AST:** the extractor exposes each declaration as a `GraphNode` (`id`, `label`, `kind`, `source_file`, `source_location` like `L12-40`, `language`, `exported`, `signature`). Edges are `GraphEdge` (`source`, `target`, `relation`, `confidence`). Use `exported` to decide whether a symbol is part of the public surface; use the `imports`/`calls` edges to populate `depends_on`; use the per-node `source_location` for `file:line` citations. Cross-file callers (`used_by`) come from the driver's reverse-lookup post-pass after `src/graph/resolve/cross-file.ts` runs - the agent does NOT scan the whole repo for callers.

**The pairing rule (read this first):** Atomicity says every entity gets its own page. The pairing rule says every entity also lists its sibling pairs in frontmatter. Queues/workers pair with handlers via `triggers:`. Scheduled hooks pair with their target. Deep Lake tables pair with their `data-model` interface. Feature-flag entities pair with concept pages via `read_at_via:` when accessed via a bulk hook. ADRs pair `supersedes` / `superseded_by`. Lint mode catches missing pairs as a first-class finding.

---

## function

**Detection heuristic:** tree-sitter declaration nodes with `kind: "function"`. The extractor already covers both `function_declaration` AND `const f = () => {}` / `const f = function(){}` (arrow/function-expression-valued `lexical_declaration` declarators are tagged as callers and emitted as `const`/`function` nodes). Treat a `const` node whose `signature` shows an arrow/function value as a function entity.

**Extraction:** read the `GraphNode` `signature` (one-line declaration, body stripped) for the parameter list and return type. Read outgoing `calls` edges for `depends_on`. Read the `doc` field (leading JSDoc/TSDoc first line) for the Overview seed.

**Frontmatter:** `entity_type: function`, `path`, `language`, `depends_on` (targets of outgoing `calls` edges resolved in-file or cross-file), `used_by` (left empty in `document` mode; populated by the reverse-lookup post-pass).

**Body sections:** Overview / Signature / Behavior / Connections / Tested by / History / Sources.

**Gotchas:**
- Anonymous arrow functions count as function entities only when the binding is `exported` or referenced by another node's edge.
- Overloaded declarations are ONE entity page (the extractor's `pushNode` dedups by `id` and keeps the first/implementation signature). List all signatures in the Signature block.
- Curried functions are still one entity unless the inner function is separately exported.

---

## class

**Detection heuristic:** tree-sitter nodes with `kind: "class"`.

**Extraction:** the extractor emits `method_of` edges (class -> method node) for every method, and `extends` / `implements` edges from the `class_heritage` clause. Read methods via the `method_of` edges; read the parent class via the `extends` edge target; read interfaces via `implements` edge targets.

**Frontmatter:** `entity_type: class`, `path`, `language`, `extends:` (parent class wikilink from the `extends` edge), `implements:` (interface wikilinks from `implements` edges), `depends_on`, `used_by`.

**Body sections:** Overview / Class signature / Public methods / Properties / Inheritance / Connections / Tested by / History / Sources.

**Gotchas:**
- The extractor only marks public methods as `exported` (private `#name` and `private`/`protected`-modified methods are flagged non-exported). A class in a `services/` directory or with a clear DI/registration pattern hints at promotion to `service` - re-classify before writing.
- Abstract classes are still entities; mark in body, not in frontmatter.
- Methods do NOT get their own entity pages by default - they are a sub-section of the class. Promote a method to a standalone `function` entity only if it is exported separately or has independent significance.

---

## module

**Detection heuristic:** every file gets exactly one synthetic `module` node (`id` = `<path>::module`) from the extractor, which is the container for top-level declarations and the source of all `imports` edges. File a `module` entity for any file with a non-empty export surface.

**Extraction:** read outgoing `imports` edges from the module node for the import graph (targets look like `external:<specifier>` for third-party imports; the cross-file resolver upgrades intra-repo ones). Read which declaration nodes in the file are `exported: true` for the export list.

**Frontmatter:** `entity_type: module`, `path`, `language`, `exports:` (list of entity wikilinks for everything the module exports), `imports:` (list of module wikilinks for the modules it depends on), `last_commit_hash`.

**Body sections:** Overview (one paragraph: this module's responsibility) / Exports / Imports / Connections / History / Sources.

**Gotchas:**
- The longer-form module narrative is library-worker-bee's job under `library/knowledge/private/<domain>/`. wiki-worker-bee's `module` entity is a stub-style index pointing at the per-callable entities inside the file.
- Files with zero exports (test files, pure config) do NOT get a module entity. Their callables get individual entities under their own sub-types.

---

## service

**Detection heuristic:** a `class` node located in a `services/` directory, OR a module whose primary export is a long-lived stateful object (e.g. the embeddings daemon, the API client in `src/deeplake-api.ts`, a notifications dispatcher). Hivemind is plain TypeScript with no DI framework, so the directory/role convention is the signal - not decorators.

**Extraction:** tree-sitter class/module nodes + their outgoing `imports` and `calls` edges. Pair the service with the MCP tools it backs (`mcp-tool` entities) and the env vars it reads (`env-var` entities).

**Frontmatter:** `entity_type: service`, `path`, `language`, `mcp_tools:` (list of `[[entities/<mcp-tool>]]` this service backs, if any), `env_vars:` (list of `[[entities/<env-var>]]` it reads), `deeplake_tables:` (list of `[[entities/<deeplake-table>]]` it reads/writes), `depends_on` (modules/services it imports).

**Body sections:** Overview / Class or module signature / MCP tools / Env vars / Deep Lake tables / Dependencies / Connections / Tested by / History / Sources.

**Gotchas:**
- A service often pairs with one or more `mcp-tool` entities - link them via `mcp_tools:`.
- Hivemind services are inferred from directory/role convention; if a file is plainly a utility module, file it as `module`, not `service`.

---

## mcp-tool

(Replaces the old `endpoint` sub-type. Hivemind exposes MCP tools, not HTTP routes.)

**Detection heuristic:** tool registration in the MCP server. In `src/mcp/server.ts` each tool is registered with a `name:` (e.g. `hivemind_search`, `hivemind_read`, `hivemind_index`) and an input schema. tree-sitter surfaces these as `call_expression` / object-literal nodes inside the server module; match the registration call shape and pull the first string-arg tool name.

**Extraction:** read the registration `call_expression` and its config object - tool `name`, description, input schema (a Zod object or JSON schema), and the handler function it dispatches to. The handler is a separate `function` entity.

**Frontmatter:** `entity_type: mcp-tool`, `path` (source file), `language`, `tool_name` (e.g. `hivemind_search`), `input_schema:` (`[[entities/<data-model>]]` if the schema is a named model, else inline summary), `handler:` (`[[entities/<handler-function>]]`), `server:` (`[[entities/<mcp-server-module>]]`).

**Body sections:** Overview / Tool name / Input schema / Handler / Output shape / Connections / Tested by / History / Sources.

**Gotchas:**
- The `handler:` is a separate `function` entity. Always create both. The mcp-tool links to the handler via `handler:`; the handler's `used_by:` includes the mcp-tool.
- Tool names are the stable contract consumed by every harness adapter (Claude Code, Cursor, Codex, Hermes). A rename is a contract change - run the contradiction protocol.

---

## env-var

**Detection heuristic:** tree-sitter `member_expression` matching `process.env.X` (Hivemind's env convention is `HIVEMIND_*`, e.g. `HIVEMIND_API_URL`, `HIVEMIND_TOKEN`, `HIVEMIND_CODEBASE_TABLE`). Aggregate by name across the chunk. The extractor walks `member_expression`/`property_identifier` nodes; filter where the object identifier chain is `process.env`.

**Extraction:** collect each unique key name and every `{file, line}` access site (from each node's `source_location`). Detect a default from a `process.env.X || 'default'` / `?? 'default'` binary-expression neighbor.

**Frontmatter:** `entity_type: env-var`, `name` (e.g. `HIVEMIND_API_URL`), `read_at:` (list of `{file, line}` call sites), `default_value:` (if set in code), `is_required:` (heuristic - true if any access lacks a default), `language`, `last_commit_hash`.

**Body sections:** Overview / Default value / Required vs optional / Read sites / Connections / Sources.

**Gotchas:**
- The `path` field for `env-var` is the FIRST file where it appears; `read_at:` is the full list. Be explicit.
- Aggregate across the chunk: one env var read in five files is ONE entity page with five `read_at:` entries - not five pages.
- Hivemind groups env vars by subsystem (`HIVEMIND_GRAPH_*` for the graph driver, `HIVEMIND_EMBED_*` for embeddings). Note the subsystem in the body.

---

## config-key

**Detection heuristic:** keys read through Hivemind's own config loader rather than raw `process.env`. v1 covers:
- `src/config.ts` / `src/user-config.ts` accessors (e.g. `getConfig().<key>` / property access on the loaded config object)
- a config object imported from a JSON/TS config module then property-accessed

**Extraction:** tree-sitter `call_expression` / `member_expression` walk + per-loader pattern matching. Aggregate by key name.

**Frontmatter:** `entity_type: config-key`, `name` (e.g. `graph.pullTimeoutMs`), `loader:` (`hivemind-config | user-config | json | other`), `read_at:` (list of `{file, line}`), `default_value:` (if discoverable from the config schema/defaults), `language`, `last_commit_hash`.

**Body sections:** Overview / Loader / Default / Read sites / Schema source (if applicable) / Connections / Sources.

**Gotchas:**
- The config schema/defaults are centralized in `src/config.ts` / `src/user-config.ts` - file that file as a `data-model` entity and link from each `config-key` via `schema_source:`.
- Distinguish a config-key (read through the loader) from a raw `env-var` (read via `process.env`). Some keys are backed by an env var; note the backing var in the body and link via `related:`.

---

## data-model

**Detection heuristic:** tree-sitter nodes with `kind: "interface"` or `kind: "type_alias"`, OR a `call_expression` matching `z.object({...})` (Zod) - Hivemind uses Zod for MCP tool input schemas and the Deep Lake schema column definitions in `src/deeplake-schema.ts` are a closely related model surface.

**Extraction:** read `interface` / `type_alias` nodes directly; for Zod schemas read the `z.object` call expression. The `signature` field carries the one-line shape.

**Frontmatter:** `entity_type: data-model`, `path`, `language`, `schema_library:` (`typescript | zod | other`), `fields:` (list of field names - for grep-ability), `used_by:` (entities that consume this model).

**Body sections:** Overview / Schema definition / Fields / Validation rules / Connections / Sources.

**Gotchas:**
- Cross-link a `data-model` to a `deeplake-table` when the model describes the same shape as a Deep Lake table's columns (e.g. the `GraphSnapshot`/`GraphNode` types in `src/graph/types.ts` relate to the `codebase` table's `snapshot_jsonb`). Both entities exist; link via `related:`.
- The column-definition arrays in `src/deeplake-schema.ts` (`CODEBASE_COLUMNS`, `MEMORY_COLUMNS`, ...) are filed as `deeplake-table` entities, not `data-model` - but each has a paired data-model where the TS type exists.

---

## exported-symbol

(Replaces the old `react-component` sub-type. Hivemind has no React UI; the closest analog is a meaningful exported value/symbol that is not a plain function, class, interface, or type - e.g. an exported `const` factory, a frozen schema object, a singleton, an enum.)

**Detection heuristic:** tree-sitter `const` / `enum` nodes with `exported: true` that carry independent significance (a config object, a registry, a frozen constant array like `CODEBASE_COLUMNS`, a builder, an enum used across modules). Plain internal consts are NOT entities.

**Extraction:** read the `const`/`enum` node `signature` and value shape. Read incoming edges to gauge significance (referenced by other modules -> worth a page).

**Frontmatter:** `entity_type: exported-symbol`, `path`, `language`, `symbol_kind:` (`const | enum | object | factory | singleton`), `is_default_export` (boolean), `shape_summary` (comma-separated key/member names for grep), `used_by:`.

**Body sections:** Overview / Definition / Shape (markdown table - member, type, meaning) / Usage / Connections / Tested by / History / Sources.

**Gotchas:**
- Render the shape as ONE markdown table sub-section, NOT per-member entity pages - that would explode the knowledge area.
- An exported `const` whose value is an arrow/function expression is a `function` entity, not `exported-symbol`.
- A frozen column-definition array that defines a Deep Lake table (e.g. `CODEBASE_COLUMNS`) is filed as `deeplake-table`, not `exported-symbol`.

---

## deeplake-table

(Replaces the old `sql-table` sub-type. Hivemind's persistence is the Deep Lake cloud store; tables are declared as column arrays in `src/deeplake-schema.ts` and created via `buildCreateTableSql(...) USING deeplake`.)

**Detection heuristic:** a `COLUMNS` array in `src/deeplake-schema.ts` (`MEMORY_COLUMNS`, `SESSIONS_COLUMNS`, `SKILLS_COLUMNS`, `RULES_COLUMNS`, `GOALS_COLUMNS`, `KPIS_COLUMNS`, `CODEBASE_COLUMNS`), OR a table name string passed to `buildCreateTableSql` / referenced via `HIVEMIND_*_TABLE` env vars (e.g. `HIVEMIND_CODEBASE_TABLE`).

**Extraction:** tree-sitter array/object-literal walk over the `ColumnDef[]` entries - pull each `{ name, sql }` for the column list, primary key (the identity-key comment block), and the `USING deeplake` clause. The `codebase` table specifically stores the graph snapshot: `snapshot_jsonb` (NetworkX node-link JSON), `snapshot_sha256`, `node_count`, `edge_count`.

**Frontmatter:** `entity_type: deeplake-table`, `path` (`src/deeplake-schema.ts`), `language` (`ts`), `table_name` (e.g. `codebase`, or the value of the backing `HIVEMIND_*_TABLE` env var), `columns:` (list of column names - for grep), `primary_key:`, `data_model:` (`[[entities/<paired-data-model>]]` if a TS type mirrors the row shape).

**Body sections:** Overview / Column definitions (markdown table - name, sql type, meaning) / Primary key / Schema healing notes / Connections / Sources.

**Gotchas:**
- Columns are added via lazy schema healing (`ALTER TABLE ADD COLUMN` only for genuinely missing columns) - note the healing behavior in the body; do not present the column list as immutable.
- The `codebase` table is the one this very skill feeds: the graph snapshot is written there. Link the `deeplake-table:codebase` entity to the graph-snapshot concept page via `related:`.
- Link each table to its backing env var (e.g. `codebase` <-> `HIVEMIND_CODEBASE_TABLE`) via `related:`.

---

## queue

(Adapted to Hivemind's background-worker model - there is no BullMQ/Inngest. The repo spawns workers and runs daemons: the pull worker (`src/graph/spawn-pull-worker.ts`), the embeddings daemon (`HIVEMIND_EMBED_DAEMON`), and the graph push/pull lifecycle.)

**Detection heuristic:**
- A spawned worker process (e.g. `spawn-pull-worker.ts`, `deeplake-pull.ts`/`deeplake-push.ts` invoked off the main thread).
- A long-lived daemon gated by an env flag (`HIVEMIND_EMBED_DAEMON`, `HIVEMIND_EMBED_WARMUP`).

**Extraction:** tree-sitter `call_expression` for the spawn/child-process call + the entrypoint module it runs. Pair the worker with the handler/entrypoint function it drives.

**Frontmatter:** `entity_type: queue`, `path`, `language`, `worker_kind: spawned-process | daemon | lifecycle-hook`, `worker_name:` (the entrypoint/identifier), `triggers:` (`[[entities/<handler-function>]]`), `gated_by:` (`[[entities/<env-var>]]` if an env flag enables it).

**Body sections:** Overview / Worker kind / Entrypoint / Handler / Lifecycle (start/stop/idle) / Connections / Tested by / History / Sources.

**Gotchas:**
- The handler/entrypoint is ALWAYS a separate `function` (or `module`) entity. The queue page links to it via `triggers:`; the handler's `used_by:` includes the queue.
- A daemon gated by an env flag pairs with that `env-var` entity via `gated_by:` and with the `feature-flag` entity if the flag is boolean-on/off.

---

## scheduled-hook

(Adapted from the old `cron-job` sub-type. Hivemind has no cron framework; instead it runs interval ticks and lifecycle hooks - the graph tick interval (`HIVEMIND_GRAPH_TICK_INTERVAL_MS`), graph-on-stop (`HIVEMIND_GRAPH_ON_STOP`), and the harness hooks under `src/hooks/`.)

**Detection heuristic:**
- An interval/timer driven by an env-configured period (`HIVEMIND_GRAPH_TICK_INTERVAL_MS`, `HIVEMIND_ACTIVE_SESSION_WINDOW_MS`).
- A lifecycle hook registered in `src/hooks/` (e.g. Cursor `pre-tool-use`, SessionStart/Stop hooks, graph begin/end hooks `HIVEMIND_GRAPH_HOOK_BEGIN` / `HIVEMIND_GRAPH_HOOK_END`).

**Extraction:** tree-sitter `call_expression` for `setInterval`/timer setup or the hook registration, plus the env var that configures the period/enablement. Validate that the configured interval value resolves to a number.

**Frontmatter:** `entity_type: scheduled-hook`, `path`, `language`, `hook_kind: interval-tick | lifecycle-hook | session-hook`, `interval_source:` (`[[entities/<env-var>]]` for the period, if any), `event:` (the lifecycle event for hooks, e.g. `SessionStart`, `pre-tool-use`, `Stop`), `triggers:` (`[[entities/<target-handler>]]`).

**Body sections:** Overview / Hook kind / Trigger (interval period or lifecycle event) / Target handler / Connections / Tested by / History / Sources.

**Gotchas:**
- A scheduled-hook ALWAYS pairs with a target handler entity - same atomic-pairing rule as queue/handler.
- For interval ticks, the period env var is its own `env-var` entity; link via `interval_source:`.
- An invalid/missing interval value is a `gap` in the response payload, not a silent skip.

---

## feature-flag

(Adapted to Hivemind's boolean `HIVEMIND_*` env-flag convention - there is no LaunchDarkly/OpenFeature. Flags are env vars read as on/off switches: `HIVEMIND_CAPTURE`, `HIVEMIND_AUTOPULL_DISABLED`, `HIVEMIND_GRAPH_PUSH`, `HIVEMIND_GRAPH_PULL`, `HIVEMIND_EMBEDDINGS`, `HIVEMIND_DEBUG`, etc.)

**Detection heuristic:** an `HIVEMIND_*` env var consumed as a boolean toggle - read at a branch site (`if (process.env.HIVEMIND_X === '1')`, `=== 'true'`, truthiness checks, or a `!== undefined` enable check). Distinguish from a value-carrying `env-var` (URL, token, table name): a flag gates behavior on/off.

**Extraction:** tree-sitter `member_expression` for the env read + the enclosing branch/binary expression that interprets it as boolean. Aggregate by flag name across the chunk; capture the default (off unless code defaults it on).

**Frontmatter:** `entity_type: feature-flag`, `name` (flag env var, e.g. `HIVEMIND_GRAPH_PUSH`), `flag_kind: env-toggle`, `default_value:` (on/off), `read_at:` (list of `{file, line}` branch sites), `read_at_via:` (list of `[[concepts/<bulk-read-concept>]]` if read through a central config helper), `gates:` (`[[entities/<queue-or-hook>]]` the flag enables/disables), `language`, `last_commit_hash`.

**Body sections:** Overview / Default state / Branch sites / What it gates / Connections / Sources.

**Gotchas:**
- A flag read through a central config helper (rather than directly at each site) gets a `concept` page for the helper, with individual flag entities linked via `read_at_via:`.
- The `path` field is the FIRST file where the flag appears (alphabetically); `read_at:` is the canonical full list.
- A flag that enables a daemon/worker (`HIVEMIND_EMBED_DAEMON`, `HIVEMIND_GRAPH_PUSH`) pairs with that `queue`/`scheduled-hook` entity via `gates:`.

---

## Pairing reference

The pairs that lint mode catches as missing-pair findings:

| Sub-type | Pair |
|---|---|
| `mcp-tool` | `handler:` -> `function` entity |
| `service` | `mcp_tools:` -> list of `mcp-tool` entities (if any) |
| `service` | `env_vars:` -> list of `env-var` entities |
| `service` | `deeplake_tables:` -> list of `deeplake-table` entities |
| `queue` | `triggers:` -> `function` (the handler) |
| `scheduled-hook` | `triggers:` -> `function` (the target handler) |
| `deeplake-table` | `data_model:` -> `data-model` entity (if a TS type mirrors the row) |
| `feature-flag` | `gates:` -> `queue` / `scheduled-hook` it enables |
| `decision` | `supersedes:` / `superseded_by:` |
| `class` | `extends:`, `implements:` |

When a pair is declared on one side, the other side's frontmatter MUST include the reverse link. Lint mode catches asymmetries.

## History sections (every entity)

Per [`templates/entity.md`](../templates/entity.md), every entity body has a History section populated from `git_context`:

- **Created:** `commit_sha`, author, date.
- **Last touched:** `commit_sha`, author, date.
- **Recent activity:** top 3-5 recent commits affecting the file.
- **Top contributors:** from `blame_summary.top_authors` - list top 3.
- **Churn rate:** from `blame_summary.churn_rate`.

## Source

Per-type guidance distilled from the synthesis at `research/2026-04-29-synthesis.md` and the live extractor at `src/graph/extract/typescript.ts`. The node/edge surface (`GraphNode`, `GraphEdge`, `NodeKind`, `EdgeRelation`) is defined in `src/graph/types.ts`.
