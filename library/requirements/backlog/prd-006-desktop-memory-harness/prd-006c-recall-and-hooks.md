# PRD-006c: Recall and Injection Engine

> **Status:** Backlog
> **Priority:** P1
> **Effort:** L (1-3d)
> **Schema changes:** None (reads `memory`, `skills`, `rules`)
> **Parent:** [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)

---

## Overview

This sub-feature is the deterministic recall the desktop apps cannot do for
themselves. When an outbound turn passes through the proxy, the engine decides
whether memory should be injected, runs the retrieval query against Deeplake, and
writes the result into the request before it is forwarded, within a hard timeout. It
is the part of the harness that delivers the "if you say remember, query Deeplake"
and "every N turns, pull context" behavior, the Cursor-style hooks the desktop apps
do not expose. This is the capability Mario flagged as the reason MCP is not enough:
the model will not reliably call a memory tool, so the harness injects on rules we
control.

The value is that desktop chats get the same auto-recall the coding harnesses get,
without depending on the model choosing to search.

---

## Why this matters

Hivemind's win is that prior work is already in scope at recall time, not
re-derived. For coding agents that happens through a `UserPromptSubmit` hook that
queries memory and prepends it. The desktop apps have no such hook. This engine
recreates it on the data path: it is the single place where a trigger rule turns into
an actual Deeplake query and an actual context injection, deterministically, every
qualifying turn.

---

## Goals

- A trigger-rule engine evaluated on every outbound user turn, with at least these
  rule types:
  - **Keyword**: the turn contains a configured trigger (for example "remember",
    "what did we decide", "last time").
  - **Cadence**: every N turns in a conversation.
  - **Context**: a detected project or topic maps to a memory scope.
  - **Always / never**: blanket on or off for power users and for capture-off.
- On a firing trigger, run the existing hybrid retrieval (lexical + semantic, BM25
  fallback) against the user's workspace memory, skills, and rules.
- Inject the retrieved context into the outbound request in a provider-accepted
  shape (system or context block), via the same provider adapter from 006b, without
  corrupting the app's framing.
- Enforce a hard recall timeout. If Deeplake does not answer in time, forward the
  request unchanged with no memory and no user-visible delay beyond the budget.
- Make rules configurable per user and per workspace, with sane defaults, and make
  injection fully disable-able.

## Non-Goals

- **Capture.** Owned by [`prd-006b-capture-lifecycle`](./prd-006b-capture-lifecycle.md).
- **The retrieval algorithm itself.** Reuses the existing hybrid search; this sub-PRD
  decides *when* to query and *where to put* the result, not how ranking works. See
  [`../../../knowledge/private/ai/embeddings-retrieval.md`](../../../knowledge/private/ai/embeddings-retrieval.md).
- **TLS/proxy mechanics.** Owned by [`prd-006a-interception-proxy`](./prd-006a-interception-proxy.md).
- **A new injection schema for the provider.** Use the minimal provider-accepted
  shape confirmed in Phase 0.

---

## Functional requirements

1. **Rule engine.** Evaluate configured rules against each outbound turn and the
   per-conversation counter. First matching rule wins; record which fired for
   observability.
2. **Retrieval call.** On fire, call the existing hybrid retrieval scoped to the
   user's workspace. Bound result size so an injection cannot blow the context.
3. **Injection.** Use the provider adapter to insert retrieved context into the
   request body in an accepted location. Preserve the app's own system framing; add,
   never overwrite.
4. **Hard timeout.** Wrap retrieval+injection in a strict budget. On timeout or
   error, forward the original request untouched. The chat never waits on memory
   beyond the budget.
5. **Attribution decision hook.** Support, behind config, marking injected content so
   it is identifiable (pending the open decision on whether injected memory is shown
   in the UI or only present in the request).
6. **Config + disable.** Rules live in user/workspace config with defaults. Capture-
   off and an injection-off toggle both fully disable this engine.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a turn containing a configured keyword trigger, when it passes through the proxy, then retrieval runs and matching memory is injected into the outbound request. |
| AC-2 | Given a cadence rule of every N turns, when the Nth turn in a conversation occurs, then retrieval runs; on intervening turns it does not. |
| AC-3 | Given Deeplake does not answer within the recall budget, when a trigger fires, then the request is forwarded unchanged and the only added delay is the budget itself. |
| AC-4 | Given injected memory, when it is added to the request, then the app's own system framing is preserved and the request remains valid for the provider. |
| AC-5 | Given injection is disabled (toggle or capture-off), when any turn occurs, then no retrieval runs and no request is modified. |
| AC-6 | Given a fired trigger, when the engine runs, then it records which rule fired and whether injection happened, for the health/observability surface. |

---

## Implementation notes

- The hard timeout is the most important property. rflectr's failure-mode contract
  is explicit that the memory layer must never stall the user; here that means the
  injection path is strictly time-boxed and fails open to "no memory injected".
- Keep the rule set small and legible in v1. Keyword + cadence + always/never covers
  the headline behaviors; richer context rules can follow once the basics are proven.
- Injection location and shape are provider-specific and come from Phase 0. Do not
  guess the accepted shape; confirm it against the real app.

---

## Related

- [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)
- [`prd-006a-interception-proxy`](./prd-006a-interception-proxy.md): the request path injection hooks into.
- [`prd-006b-capture-lifecycle`](./prd-006b-capture-lifecycle.md): shares the provider adapters.
- [`../../../knowledge/private/ai/embeddings-retrieval.md`](../../../knowledge/private/ai/embeddings-retrieval.md): the retrieval reused here.
- [`../../../knowledge/private/security/desktop-egress-and-trust.md`](../../../knowledge/private/security/desktop-egress-and-trust.md): injection privacy posture.
