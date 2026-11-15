# 07, Common Gaps Catalog

A catalog of "implied but missing" patterns that recur across audits. Check these proactively on every Gaps-axis evaluation (see `04-five-axis-evaluation.md`).

Each pattern below lists:
- The gap (what's missing).
- The signature (what to grep / look at).
- The usual severity (can escalate to Critical based on context).

---

## CLI and output gaps

### Missing empty-result handling
- **Gap:** A retrieval or list command that prints nothing (or crashes) when the result set is empty.
- **Signature:** `results.map(...)` or `for (const r of results)` with no `if (results.length === 0)` branch.
- **Severity:** Warning. Critical if plan explicitly described the empty case.

### Missing degraded-mode handling
- **Gap:** A read path that assumes embeddings are available, with no BM25 fallback branch.
- **Signature:** A dense-similarity call with no `catch` or `if (!embeddingsAvailable)` path to BM25.
- **Severity:** Warning. Critical if the plan required graceful degradation.

### Missing error handling on a write
- **Gap:** A dataset or daemon mutation with no path for the error case.
- **Signature:** `try/catch` that swallows to `console.error`; an `await` on a dataset write with no rejection handling.
- **Severity:** Warning. Critical if an unhandled error corrupts the Deep Lake dataset.

### Missing gate on a new tool call
- **Gap:** A new tool dispatch path that bypasses the pre-tool-use gate.
- **Signature:** A tool call constructed and dispatched without routing through the gate that the plan implies.
- **Severity:** Critical (if the call is state-changing) or Warning.

### Missing feature-flag guard
- **Gap:** Plan describes a staged rollout but the feature ships unflagged.
- **Signature:** New command or runtime path without the flag check the plan specified.
- **Severity:** Warning. Critical if the plan said "behind flag until Xth."

---

## Data and validation gaps

### Missing input validation
- **Gap:** User input (form, query param, request body) used without schema validation.
- **Signature:** A tool-call payload, CLI arg, or request body accessed directly without a `zod` / `valibot` parse (Hivemind uses TS schema validation, not runtime guesswork).
- **Severity:** Warning in general; Critical when input reaches a dataset write or file path.

### Missing scope filter on a dataset read
- **Gap:** A dataset query touches more rows than the plan authorizes (e.g., reads all versions when only the latest is wanted, or all libraries when scoped to one).
- **Signature:** A `dataset.query`/`findMany`-style read with no `embedding_version` or scope filter where the plan implies one.
- **Severity:** **Critical** when it leaks or mixes unrelated data; Warning for over-reads on a cold path.

### Missing gate check
- **Gap:** A state-changing tool path runs without the pre-tool-use gate verifying it.
- **Signature:** A dispatch that reaches `harness-integration-worker-bee` without passing the gate.
- **Severity:** Critical.

### Missing pagination / limit
- **Gap:** A list or scan returns the entire dataset.
- **Signature:** A `findMany`/scan without `take`, limit, or cursor; an output shape with no `nextCursor` / `hasMore` / `page`.
- **Severity:** Warning. Critical if the dataset grows unbounded with user content.

---

## Performance gaps

### N+1 dataset reads
See `research/2026-04-24-prisma-n-plus-one.md` for the general ORM/dataset pattern.
- **Gap:** One read for a list, then one read per item for related data.
- **Signature:**
  - `for/map` over a list of ids calling a single-record `get`/`findUnique` per element.
  - A batch read followed by a per-item lookup in a loop instead of one batched query.
  - Re-embedding the same document inside a loop instead of one batch embed.
- **Severity:** Critical on a hot path (retrieval, embeddings daemon); Warning on cold paths.

### Re-embedding when unchanged
- **Gap:** A document is re-embedded even though its content hash is unchanged, wasting provider calls.
- **Signature:** An embed call with no content-hash or `embedding_version` short-circuit.
- **Severity:** Warning.

### Waterfall awaits
- **Gap:** Sequentially awaiting N independent dataset or embeddings calls.
- **Signature:** Multiple `const x = await ...` in a row where the calls don't depend on each other; should be `Promise.all`.
- **Severity:** Warning.

### CommonJS require in an ESM module
- **Gap:** A `require(...)` in an ESM file, or a missing import extension the build needs.
- **Signature:** `require(` or a relative import with no extension in an ESM source file.
- **Severity:** Suggestion (Warning if it breaks the build).

---

## Correctness and regression gaps

### Caller not updated after signature change
- **Gap:** Modified function has a new signature; at least one caller elsewhere in the repo wasn't updated.
- **Signature:** Grep repo for `<functionName>(` and compare arg shapes.
- **Severity:** Critical (build break) or Critical (silent type change, e.g., return nullable).

### Deleted file with surviving imports
- **Gap:** File deleted in the diff but still imported somewhere.
- **Signature:** `git diff --name-status` shows a `D`; grep for the old import path.
- **Severity:** Critical (build break).

### Silent catch
- **Gap:** `try/catch` that logs or swallows, losing errors.
- **Signature:** `catch (e) { console.error(e) }` with no re-throw, structured log, or surfaced error.
- **Severity:** Warning. Critical if inside a dataset-mutation or embeddings-write path.

---

## Testing and observability gaps

### Plan required tests, none shipped
- **Gap:** Plan explicitly called for unit / integration tests; none in the diff.
- **Signature:** No `.test.ts` / `.spec.ts` siblings for new source files.
- **Severity:** Warning.
- **Note:** If the plan did NOT call for tests, missing tests is a Suggestion (not Warning).

### Missing log / metric / trace the plan required
- **Gap:** Plan described observability signals; diff lacks them.
- **Signature:** Plan mentions "emit metric X" or "log Y event"; grep the diff for the signal.
- **Severity:** Warning.

### Leftover debugging artifacts
- **Gap:** `console.log`, `debugger`, `alert`, `// TODO: remove` in the diff.
- **Signature:** Grep the diff for these strings.
- **Severity:** Suggestion (single instance) or Warning (systematic).

---

## Scope and documentation gaps

### Out-of-scope change
- **Gap:** Files changed that the plan didn't authorize.
- **Signature:** Cross-reference Files Changed against the plan's scope section.
- **Severity:** Warning; Critical if the out-of-scope file is high-risk (the pre-tool-use gate, dataset schema/migration code, the embeddings daemon core).

### Missing .env.example update
- **Gap:** New env var required by the code but not documented in `.env.example`.
- **Signature:** Grep diff for `process.env.X_NEW_VAR` and check if `.env.example` was updated.
- **Severity:** Warning.

### Plan required docs update, none shipped
- **Gap:** Plan said "update README / CHANGELOG / architecture doc"; not done.
- **Signature:** Plan's task list mentions a doc change; diff has no touched `.md` in that path.
- **Severity:** Warning.

---

## How to use this catalog

During the Gaps axis pass in `04-five-axis-evaluation.md`:

1. Skim this list.
2. For each pattern, ask: "Is this applicable here?" (If the plan didn't touch auth, skip auth gaps.)
3. For applicable patterns, grep / inspect the diff.
4. Record findings with the severity above, adjusted for context.

Add new patterns to this file as they recur across audits. The file is a living catalog.

---

## See also

- Examples: `examples/02-blocker-heavy-audit.md` demonstrates several patterns from this catalog.
- Research: `research/2026-04-24-react-nextjs-review-checklist.md`, `research/2026-04-24-prisma-n-plus-one.md`, `research/2026-04-24-regression-without-tests.md` (external source notes; the detection patterns are applied here to the TypeScript/Deep Lake stack).
