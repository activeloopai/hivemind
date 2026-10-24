# 00 - Diataxis Framework

> Source: `research/external/01-diataxis-framework-overview.md`, `research/external/02-diataxis-four-modes-deep.md`

Diataxis (from Greek: "across arrangement") is the organizing canon for this stinger. Every review starts with a mode classification. Every ghostwriting session starts with mode selection. Mode-mixing is the root cause of most "I don't understand this doc" complaints; fixing prose before fixing structure wastes everyone's time.

---

## The compass

Diataxis plots documentation on two axes:

```
                    PRACTICAL (action)
                          |
   TUTORIAL               |          HOW-TO GUIDE
   (learning-oriented)    |          (task-oriented)
                          |
ACQUISITION --------------|-------------- APPLICATION
(serves study)            |                (serves work)
                          |
   EXPLANATION            |          REFERENCE
   (understanding-        |          (information-oriented)
    oriented)             |
                          |
                    THEORETICAL (cognition)
```

The quadrant a document belongs in determines its structure, its style, and what "good" looks like for that document.

---

## The four modes

### Tutorial (top-left: practical + acquisition)

A tutorial is a **learning experience**. The reader is a beginner who needs to *do something* to learn by doing. The goal is not to accomplish a real task but to learn by accomplishing a carefully designed learning task.

- Addresses the reader directly (second person: "you").
- Uses an imperative voice for steps ("Run the following command").
- Guarantees success: the reader finishes the tutorial and *something works*.
- Does NOT explain why things work -- that belongs in explanation.
- Starts with "By the end of this tutorial, you will have..."

**Heading pattern:** Action-based nouns that set a scene -- "Building your first pipeline", "Setting up your environment".

**Detect mode-mixing:** A tutorial that explains design choices has mixed in explanation. A tutorial that references configuration options has mixed in reference. Strip them out.

### How-to Guide (top-right: practical + application)

A how-to guide is a **recipe**. The reader already knows what they want to achieve; they need the steps. Unlike a tutorial, they are a capable practitioner, and the guide trusts them.

- Addresses the reader directly.
- Uses imperative verbs for every step ("Configure the timeout", "Set the environment variable").
- Does NOT explain *why* -- that belongs in explanation.
- Does NOT teach from scratch -- that belongs in a tutorial.
- Starts with the goal ("How to configure rate limiting for production").

**Heading pattern:** Infinitive phrases -- "How to X", "Configure X for Y".

**Detect mode-mixing:** A how-to that explains concepts has mixed in explanation. Strip it out and link to the explanation page.

### Reference (bottom-right: theoretical + application)

Reference is an **information surface**. The reader knows what they are looking for; they need accurate, complete, neutral facts about the machinery. They consult reference; they do not read it cover to cover.

- Describes the machinery as-is (present tense, neutral tone).
- Completeness is the primary virtue: every parameter, every option, every return value.
- No opinion, no recommendation -- those belong in explanation.
- Structured for scanning: tables, lists, consistent formatting.
- Starts with the subject: "The `timeout` parameter specifies..."

**Heading pattern:** Noun phrases -- "Configuration parameters", "Return values", "Error codes".

**Detect mode-mixing:** A reference page with recommended values has mixed in explanation. A reference page with step-by-step instructions has mixed in a how-to. Extract and link.

### Explanation (bottom-left: theoretical + acquisition)

Explanation is **understanding-oriented** prose. The reader wants to understand *why* things work the way they do, the design choices, the trade-offs, the context. Explanation can be discursive and can admit opinion ("The preferred approach is...").

- Does NOT give instructions.
- Does NOT provide an exhaustive reference.
- Connects concepts, explains causality, and builds mental models.
- Can link to related how-tos and reference pages freely.
- Starts with the question the reader is asking: "Why does X work this way?" or "Understanding Y".

**Heading pattern:** Question forms or gerund phrases -- "Why X matters", "Understanding the request lifecycle", "How caching decisions are made".

**Detect mode-mixing:** An explanation page with step-by-step instructions has mixed in a how-to. An explanation page with full parameter tables has mixed in reference.

> **TODO: open question** -- The diataxis.fr/reference-explanation/ page provides a canonical worked example of the reference/explanation distinction for API docs. Fetch it for the next research refresh.

---

## Classification heuristic (use this to classify a document)

Ask three questions:

1. **What is the reader trying to do when they arrive?**
   - Do a task they've chosen → how-to
   - Learn by doing a guided task → tutorial
   - Look up a specific fact → reference
   - Understand something → explanation

2. **What does the opening sentence position the reader as?**
   - A learner following a learning arc → tutorial
   - A practitioner accomplishing a known goal → how-to
   - Someone looking up facts → reference
   - Someone seeking understanding → explanation

3. **What does the document deliver?**
   - A guaranteed learning experience → tutorial
   - A clear set of steps to a goal → how-to
   - Complete, accurate, neutral information → reference
   - Conceptual understanding and "why" → explanation

If the three answers disagree, the document is mode-mixed. The classification is the mode that the document *should* have; the findings report identifies the content that belongs elsewhere.

---

## When to split a document

Split when:
- More than ~20% of the document belongs to a different mode.
- The document serves two distinct reader intents (e.g., "learn about" AND "configure").
- A reader who wants reference must wade through tutorial narrative to find the table.

A split produces two short, focused documents rather than one long, confused one. Link them from each other.

---

## Diataxis is a lens, not a rulebook

From the canonical site: "It is light-weight, easy to grasp and straightforward to apply. It doesn't impose implementation constraints." Diataxis helps classify and diagnose; it does not dictate word choice or paragraph length. Apply it as a diagnostic lens, then move to the prose-level guides.
