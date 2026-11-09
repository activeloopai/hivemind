# Example 01: Mode-Mixing Diagnosis

**Demonstrates:** Guides `00-diataxis.md`, `01-inverted-pyramid.md`, `04-reader-lens.md`, `07-scorecard.md`

This example shows a real-world mode-mixed document, the classification step, and the structural findings before prose review begins.

---

## Input document

**Title:** "Webhooks"
**Context:** A documentation page in a developer platform's docs site.

```markdown
# Webhooks

The WebhookManager class is responsible for managing the lifecycle of webhooks in the system.
It was introduced in version 2.3 and has since been used to handle event dispatch, retry logic,
and delivery confirmation. The class exposes a set of methods for registering endpoints,
filtering events, and inspecting delivery history.

## Setting up a webhook

To set up a webhook, navigate to the dashboard and click "Add webhook". Enter your endpoint URL
and select the events you want to receive. Save the configuration.

The `secret` parameter specifies the signing secret used to verify webhook authenticity.
It must be at least 32 characters long.

**Parameters:**
- `url` (string, required): The endpoint URL. Must be HTTPS.
- `events` (array of strings, required): Event types to receive. Defaults to all events.
- `secret` (string, required): Signing secret. Min 32 characters.
- `timeout_ms` (integer, optional): Delivery timeout in milliseconds. Default: 3000.

## What is a webhook?

A webhook is an HTTP POST request sent by the API when an event occurs. Unlike polling (where
your application repeatedly asks "did anything change?"), webhooks push events to you in real
time. This reduces latency and eliminates unnecessary API calls.
```

---

## Step 1: Diataxis classification

Applying the classification heuristic from `guides/00-diataxis.md`:

**Question 1: What is the reader trying to do?**

Three different reader intents are present in this single document:
- "I want to understand what webhooks are" (explanation)
- "I want to set up a webhook" (how-to)
- "I want to look up the parameters" (reference)

**Question 2: What does the opening sentence position the reader as?**

"The WebhookManager class is responsible for managing..." -- this is a reference-style opening. It describes the machinery.

**Question 3: What does the document deliver?**

All three: conceptual understanding, a procedure, and a parameter reference.

**Classification result:** Mixed -- reference + how-to + explanation in a single page.

**Intended mode (inferred):** Unclear. Most likely the page started as reference and grew.

---

## Step 2: Structural findings (before prose review)

The structural issues take priority over any prose-level findings.

**B1: Diataxis mode -- Significant mode mixing (reference + how-to + explanation)**

Finding: This page mixes reference (parameter list), procedural (setup steps), and explanation (what is a webhook?) in a single document. Each reader intent requires a different document structure, and the current mixing means no reader is well-served: the practitioner must scroll past explanation to find the steps, the beginner can't tell where to start, and the developer looking up parameters finds them buried in prose.

Proposed restructure:
1. Create `explanation/webhooks.md` -- the "What is a webhook?" section becomes a standalone explanation page. This is the conceptual foundation; link to it from the how-to and reference pages.
2. Create `how-to/configure-webhooks.md` -- the "Setting up a webhook" section becomes a how-to guide. Add prerequisites (dashboard access, HTTPS endpoint), use imperative steps, and remove the parameter table.
3. Create `reference/webhook-parameters.md` -- the parameter list becomes a standalone reference page. Add all parameters, types, defaults, and constraints. Link back to the how-to for context.

**B2: Inverted pyramid -- Opening sentence describes the tool, not the outcome**

Location: Opening sentence
Finding: "The WebhookManager class is responsible for managing the lifecycle of webhooks..." begins with the implementation detail (the class name) rather than the reader outcome. This applies to all three restructured documents: each needs an outcome-first opening.

Proposed rewrites (post-restructure):
- Explanation opening: "Webhooks let your application react to events in real time without polling, reducing latency and eliminating unnecessary API calls."
- How-to opening: "This guide shows you how to configure a webhook endpoint to receive events from the API."
- Reference opening: "Webhook parameters control the delivery behavior and security of your webhook endpoint."

---

## Scorecard (before prose review)

| Criterion | Rating | Note |
|---|---|---|
| Diataxis mode | Fail | Three modes mixed in one page |
| Inverted pyramid | Fail | Tool-first opening; all three sections need new leads |
| Code discipline | N/A | No code examples to evaluate |
| Voice and tone | Warn | Generally good but mixed between third-person reference and imperative instructions |
| Reader lens | Warn | No prerequisites stated; "webhook" not defined until the bottom of the page |
| Structural completeness | Warn | Each mode is present but incomplete as written |

**Summary:** "Webhooks page: Diataxis mode Fail, 2 Blockers, 0 Suggestions, 0 Nits so far. Split into three pages (explanation, how-to, reference) before any prose review."

---

## Handoff

These structural Blockers must be resolved before prose review continues. Once the three pages exist, run a separate review on each.
