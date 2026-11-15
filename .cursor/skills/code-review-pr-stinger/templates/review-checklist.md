# Review Checklist Template

Customize this checklist for the specific PR. Keep all items from Phase 1 and 2. Add context-specific items from the "Context-specific additions" section based on the file types and concerns in the diff. Remove Phase 3 items that do not apply.

For generation guidance see `guides/02-review-checklist.md`.

---

## Phase 1: Author checklist (before opening the PR)

- [ ] PR description has all six elements (motivation, context, what changed, what did NOT change, testing proof, reviewer hints)
- [ ] PR is under 400 changed lines - if not, I've documented why it cannot be split
- [ ] PR has a single logical concern - no mixed-scope changes
- [ ] All CI checks pass on my branch
- [ ] I have self-reviewed the diff: no debug artifacts, no `console.log`, no `TODO` without a tracking issue
- [ ] I have added or updated tests for new logic branches
- [ ] I have updated documentation for any public API changes

---

## Phase 2: Reviewer checklist (during review)

### Correctness (highest priority - review first)
- [ ] Does the code do what the PR description says it does?
- [ ] Are all edge cases handled? (null/undefined, empty collections, auth failures, timeouts)
- [ ] Are there race conditions or shared-state mutations without proper synchronization?
- [ ] Are all error paths handled explicitly? No silent failures (swallowed exceptions, unchecked null returns)?

### Design
- [ ] Does the change follow established architectural patterns in this codebase?
- [ ] Is the public API surface (function signatures, exports, REST endpoints) intentional and documented?
- [ ] Is there duplication that should be extracted into a shared utility?
- [ ] Does the change respect the single responsibility principle at the module level?

### Performance (flag if applicable to the changed code)
- [ ] Are there N+1 query patterns? (ORM lookups inside loops)
- [ ] Are there unbounded loops over collections that could be large in production?
- [ ] Are there synchronous blocking calls on an async hot path?
- [ ] Is caching appropriate? (Is the data stable enough? Is this path read-heavy?)

### Security (surface to `security-worker-bee` if findings are found)
- [ ] Are user inputs validated and sanitized before use in queries, templates, or commands?
- [ ] Are secrets and credentials managed via env vars or secret stores - not hardcoded?
- [ ] Is PII handled appropriately? (Not logged, not over-exposed in API responses)

### Style and readability (nit-tier)
- [ ] Are variable and function names self-documenting at the call site?
- [ ] Are there non-obvious logic blocks without a "why" comment?
- [ ] Is the diff consistent with the surrounding code style?

---

## Context-specific additions

Add the relevant section(s) below based on the file types in the diff.

### TypeScript / Node (ESM) additions
- [ ] No stray `any`; types are strict and exported where they cross module boundaries
- [ ] Relative imports include the explicit `.js` extension (ESM resolution)
- [ ] No accidental CommonJS interop pitfalls (default-import shape, `__dirname` in ESM)
- [ ] `tsc --noEmit` passes and no new `jscpd` duplication is introduced

### Deep Lake dataset additions
- [ ] Tensor schema and commit semantics are correct; no orphaned commits
- [ ] Recall query filters are bounded and embedding dimensions match the index
- [ ] Writes are idempotent and safe to retry

### Harness integration additions
- [ ] Adapter honors the shared integration contract across all six harnesses
- [ ] Transcript parsing handles empty and malformed inputs

### MCP tool / protocol additions
- [ ] Tool schema matches the documented shape in `mcp-tool-docs`
- [ ] Error envelopes follow the protocol; payloads are bounded
- [ ] Session management uses the existing session library - no bespoke session logic
- [ ] Privilege escalation paths are validated

### API route additions
- [ ] Status codes are accurate (200 for success, 201 for create, 404 for not found, not 200-for-everything)
- [ ] Input is validated at the route layer before hitting business logic
- [ ] Auth middleware is applied - endpoint is not accidentally public

### Config / environment additions
- [ ] No secrets hardcoded in config files
- [ ] New env var names are documented in `.env.example` or the relevant config guide

### Test additions
- [ ] Tests cover the new logic branches (not just the happy path)
- [ ] Assertions are behavior-based, not implementation-coupled
- [ ] No tests that always pass (assert True, assert is not None on a non-nullable field)

---

## Phase 3: Team process checklist (when merging)

- [ ] All `blocker:` comments addressed or explicitly escalated
- [ ] At least one reviewer other than the author has approved
- [ ] CI passes (green)
- [ ] Merge strategy is appropriate: squash for feature branches, merge commit for long-lived branches

---

*Template