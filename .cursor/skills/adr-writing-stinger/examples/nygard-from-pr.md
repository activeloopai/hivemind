# Example: Authoring a Nygard ADR from a PR Description

This example walks through the full workflow of deriving an ADR from a PR that introduces a significant architectural change.

---

## Input: PR description

> **PR #247: Add a string-based pre-tool-use gate to the harness**
>
> We keep letting unsafe tool calls reach worker bees before any check runs. This PR adds a pre-tool-use gate that inspects the serialized tool-call string and blocks disallowed patterns before dispatch:
> - Pure string/regex matching, no parsing of the tool payload into an AST
> - Runs in the harness before the call ever reaches `harness-integration-worker-bee`
> - Fail-closed: an unmatched-but-suspicious call is blocked, not allowed
>
> Considered a full structured-AST validator and a post-hoc audit log as alternatives. The AST validator is heavy and couples the gate to every tool's schema; the audit log only tells us after the fact.
>
> Related ticket: ENG-482

---

## Step 1: Determine ADR eligibility

This is a consequential, closed, non-obvious decision. The gate affects the security posture of every tool call, the harness hot path, and how new tools get onboarded. It warrants an ADR. Format: Nygard (two alternatives, manageable complexity).

## Step 2: Assign the next number

```bash
adr list
# -> 0030-bm25-fallback-when-embeddings-off.md (latest)
# Next: 0031
```

## Step 3: Draft the ADR

```markdown
# 0031. String-based pre-tool-use gate

Date: 2026-03-12

## Status

Accepted

## Context

The harness dispatched tool calls to worker bees with no centralized safety check. Each
bee was expected to self-police, which it did inconsistently. By Q1 2026 we had three
near-misses where a malformed or disallowed tool call reached a bee before any validation
ran (ENG-391). We need a single choke point in front of dispatch.

A string-based gate inspects the serialized tool-call request as text and blocks
disallowed patterns. It is cheap (no payload parsing), centralized (one place in the
harness), and fail-closed.

## Decision

We decided to add a string-based pre-tool-use gate in the harness, evaluated before any
call reaches `harness-integration-worker-bee`. The gate matches the serialized request
against a deny-list of string/regex patterns and blocks on match. Unrecognized requests
that trip a heuristic are blocked, not allowed. The gate runs synchronously in the
dispatch path.

## Consequences

**Positive:**
- One centralized choke point; bees no longer self-police tool safety.
- String matching keeps the gate off the critical-path latency budget (no AST build).
- Fail-closed default means a new unsafe pattern is blocked until explicitly allowed.

**Negative:**
- String matching is coarser than structured validation; a cleverly encoded payload could
  evade a naive pattern. The deny-list must be maintained as tools evolve.
- False positives block legitimate calls until the pattern is refined.

**Neutral:**
- Existing bees need no code change; the gate is upstream of them.

## Alternatives Considered

### Alternative: full structured-AST validator

Parsing each tool payload into a typed AST and validating against per-tool schemas is more
precise. Rejected because it couples the gate to every tool's schema, adds parse latency to
the hot path, and is far more code to maintain. Revisit if string matching proves too coarse.

### Alternative: post-hoc audit log only

Logging every tool call for later review is simpler and adds no blocking. Rejected because
it only surfaces an unsafe call after it has already executed; the near-misses in ENG-391
required a pre-dispatch block.
```

## Step 4: File the ADR

```bash
# Create the file at the next number
# (adr-tools doesn't auto-draft from PR descriptions; write manually or use the template)
cp docs/decisions/_template-nygard.md docs/decisions/0031-string-based-pre-tool-use-gate.md
# Fill in the content above, then:

adr generate toc
# -> Updates docs/decisions/README.md with the new entry
```

## Step 5: Update the PR description

Add to PR #247:

> **ADR recorded:** [ADR-0031 - String-based pre-tool-use gate](docs/decisions/0031-string-based-pre-tool-use-gate.md)

## Step 6: Link from the merge commit

```
feat(harness): add string-based pre-tool-use gate (ADR-0031, closes ENG-482)
```

---

## Result

The merge commit, the PR description, and the ADR record all cross-reference each other. Six months from now, when an engineer asks "why does the harness block calls before dispatch?", `git log`, GitHub PR search, or the ADR log each lead to the full answer.
