# PRD-006b: Capture and Lifecycle Reconstruction

> **Status:** Backlog
> **Priority:** P1
> **Effort:** L (1-3d)
> **Schema changes:** None (writes the existing `sessions` table)
> **Parent:** [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)

---

## Overview

This sub-feature turns intercepted traffic into Hivemind memory. It consumes the
teed request/response stream from the proxy (006a), reconstructs Hivemind's
lifecycle events (`SessionStart`, `UserPromptSubmit`, `Stop`, `SessionEnd`) from a
stream that has no native lifecycle, and writes session traces through the existing
capture path so they are indistinguishable from traces produced by Claude Code,
Cursor, or any other harness. It includes the per-provider wire-format adapters that
read a user turn out of a request and an assistant turn out of a response.

The value is that desktop chats become first-class Hivemind memory with zero changes
to the brain. The same embeddings, skillify, wiki-summary, search, and team-sharing
code runs on top of these traces because they are the same shape.

---

## Why this matters

The desktop apps have no `SessionEnd` to fire the wiki worker, no `UserPromptSubmit`
to mark a turn. If we want the rest of Hivemind to work unchanged, we have to
synthesize those events faithfully from what the proxy sees. Get the reconstruction
right and everything downstream is free. Get it wrong and we either miss turns or
double-count them, and the shared brain fills with garbage.

---

## Goals

- Define the consumer interface that attaches to the proxy's teed stream.
- Reconstruct lifecycle events from intercepted traffic using the conversation id
  the app already carries and a session-idle timeout:
  - `SessionStart`: first request on a new conversation id, or first after idle gap.
  - `UserPromptSubmit`: an outbound completion request with a new user turn.
  - `Stop`: a completed response stream for that turn.
  - `SessionEnd`: conversation closed or idle past the timeout; fires the existing
    wiki-summary worker.
- Ship wire-format adapters for Anthropic (Claude Desktop) and the ChatGPT backend
  (ChatGPT Desktop) that extract `{ conversation_id, user_turn, assistant_turn }`.
- Write each completed turn as a `sessions` row via the existing capture/Deeplake
  path, with `agent` set to the desktop harness id (for example `claude-desktop` /
  `gpt-desktop`) and the same `project`/workspace resolution other harnesses use.
- Snapshot-test adapters against captured real payloads so an app update that
  changes payload shape is caught, the way rflectr snapshots the Cursor schema.

## Non-Goals

- **TLS, proxying, streaming mechanics.** Owned by
  [`prd-006a-interception-proxy`](./prd-006a-interception-proxy.md).
- **Recall and injection.** Owned by
  [`prd-006c-recall-and-hooks`](./prd-006c-recall-and-hooks.md). This sub-PRD only
  reads turns out for capture; it does not modify outbound requests.
- **Changing the trace schema or the capture writer.** It calls the existing path;
  it does not fork it. New columns only if a spike proves it unavoidable, via the
  schema-healing path in
  [`../../../knowledge/private/data/deeplake-tables-schema.md`](../../../knowledge/private/data/deeplake-tables-schema.md).
- **Embeddings, skillify, wiki content.** Those run downstream unchanged.

---

## Functional requirements

1. **Stream consumer.** Subscribe to the proxy's teed stream of request and response
   events for intercepted chat hosts. Assemble streamed response chunks into a full
   assistant turn off the copy, never blocking the app path.
2. **Conversation identity.** Read the app's own conversation id from the payload to
   group turns. If none is exposed, derive a stable per-conversation key from
   available signals and record the choice in the adapter.
3. **Lifecycle state machine.** Maintain per-conversation state to emit
   start/prompt/stop/end exactly once each per turn or session. Idle timeout closes a
   session and fires the wiki worker.
4. **Provider adapters.** One adapter per provider implementing
   `readTurns(request, response)`. Anthropic Messages shape and ChatGPT backend shape
   are distinct; both come from Phase 0 captures, not public docs.
5. **Capture write.** Build the trace and write via the existing capture function so
   the `sessions` row matches other harnesses (per-turn `message` JSONB,
   `message_embedding` produced by the existing embed path, `agent`, `project`,
   workspace scoping, `plugin_version`).
6. **Capture-off respect.** When capture is disabled the consumer is detached and
   nothing is built or written.
7. **Adapter snapshots.** Store sanitized sample payloads and assert adapters parse
   them; fail loudly on shape drift after an app update.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a new conversation, when the first user turn completes, then exactly one `SessionStart` and one captured turn are recorded, with no duplicate events. |
| AC-2 | Given a completed turn, when the response stream finishes, then a `sessions` row identical in shape to other harnesses is written to the user's workspace with `agent` set to the desktop harness id. |
| AC-3 | Given a conversation goes idle past the timeout, when the next poll runs, then `SessionEnd` fires and the existing wiki-summary worker runs against that session. |
| AC-4 | Given a provider payload, when the adapter runs, then `conversation_id`, the user turn, and the assistant turn are extracted correctly for both Anthropic and the ChatGPT backend. |
| AC-5 | Given an app update changes the payload shape, when the adapter snapshot test runs, then it fails rather than silently mis-parsing. |
| AC-6 | Given capture is disabled, when traffic flows, then no traces are built or written. |

---

## Implementation notes

- The lifecycle state machine is the heart of this sub-PRD. The other harnesses get
  these events for free from the host; here they are inferred, so the once-and-only-
  once guarantees (no missed turns, no duplicates) are the main correctness risk and
  deserve focused tests.
- Reuse the embedding path (`src/embeddings/`) and the capture write path that the
  existing hooks call; do not reimplement Deeplake writes here.
- Keep the assistant-turn assembly entirely on the teed copy. If assembly is slow or
  fails, the user's chat is unaffected because it already streamed.

---

## Related

- [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)
- [`prd-006a-interception-proxy`](./prd-006a-interception-proxy.md): produces the teed stream.
- [`prd-006c-recall-and-hooks`](./prd-006c-recall-and-hooks.md): the read/inject counterpart.
- [`../../../knowledge/private/ai/session-capture.md`](../../../knowledge/private/ai/session-capture.md): the trace shape reused here.
- [`../../../knowledge/private/integrations/desktop-app-interception.md`](../../../knowledge/private/integrations/desktop-app-interception.md): provider wire formats and snapshots.
