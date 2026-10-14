# 03 - Voice and Tone

> Source: `research/external/03-google-developer-style-guide.md`, `research/external/07-stripe-docs-approach.md`

Voice and tone rules determine how the text sounds to the reader. The goal is not to impose a single style on all documentation but to enforce *consistency within a document* and *house style adherence when a style guide is provided*.

**Important:** When a house style guide is supplied, enforce that instead of the default style. Do not silently apply the default style when a house style exists. Name the conflict and ask the user to clarify if the two systems contradict.

---

## Default style (apply when no house style is supplied)

These defaults are grounded in the Google Developer Documentation Style Guide (`research/external/03-google-developer-style-guide.md`), which is the most widely adopted public developer documentation style.

### Active voice

Use active voice. Passive voice buries the actor and makes sentences longer.

| Passive (avoid) | Active (prefer) |
|---|---|
| "The request is sent by the client." | "The client sends the request." |
| "Errors can be handled by using..." | "Use try/catch to handle errors." |
| "Rate limiting is enabled by setting..." | "Enable rate limiting by setting..." |

**Exception:** Passive voice is appropriate when the actor is unknown or irrelevant ("The package was published in 2024"), or when the subject is more important than the actor ("The API is available in all regions").

### Second person (you)

Address the reader directly as "you" in procedural docs (tutorials, how-tos). Use third person for reference (describing what the API does, not what the reader does).

| First person (avoid) | Second person (prefer) |
|---|---|
| "We recommend enabling..." | "Enable..." or "We recommend you enable..." |
| "Our API supports..." | "The API supports..." (reference: third person) |
| "Users should configure..." | "Configure..." (how-to: imperative, no pronoun) |

### Present tense

Use present tense. Future tense ("will") creates unnecessary uncertainty.

| Future (avoid) | Present (prefer) |
|---|---|
| "This will return a 200 status." | "This returns a 200 status." |
| "The API will reject requests that..." | "The API rejects requests that..." |

### Imperative mood for procedural docs

How-tos and tutorials use imperative verb forms. Every step starts with a verb.

| Descriptive (avoid in steps) | Imperative (prefer) |
|---|---|
| "You should run the migration command." | "Run the migration command." |
| "The next thing to do is configure..." | "Configure..." |
| "It's possible to enable..." | "Enable..." |

### Sentence-case headings

Write headings in sentence case (capitalize only the first word and proper nouns). Title case is a style-guide choice -- follow the house style if provided.

| Title case | Sentence case |
|---|---|
| "Configuring Rate Limiting for Production" | "Configuring rate limiting for production" |
| "How to Enable Webhooks" | "How to enable webhooks" |

### Contractions

Use contractions (don't, you'll, it's) for a conversational register. Avoid them in formal reference docs or when the house style prohibits them.

---

## Consistency checks (the voice review pass)

During a voice and tone review, check for:

1. **Voice mixing:** Does the document switch between active and passive inconsistently? Flag each passive-voice instance and mark it Suggestion unless the passive is justified.
2. **Person mixing:** Does the document address the reader as "you" in some sections and "users" in others? Flag as Suggestion.
3. **Tense mixing:** Does the document switch between past and present for current facts? Flag as Suggestion.
4. **Mood mixing:** Does the procedural section use imperative verbs consistently, or does it slip into descriptive prose for some steps? Flag as Suggestion.
5. **Register mixing:** Is the tone formal in some places and informal in others? Flag as Nit if the house style doesn't specify.

---

## House style override protocol

When a house style is supplied:

1. Read the house style guide before starting the review.
2. Extract its rules for active/passive, second/third person, tense, headings, and contractions.
3. Use those rules, not the default style, for the review.
4. If the house style is ambiguous or silent on a specific rule, apply the default and note in the report which default was applied.
5. If the document contradicts the house style, flag as Blocker (if the contradiction is systematic) or Suggestion (if isolated).

**Note on Stripe:** Stripe does not publish a traditional public style guide document. Stripe's principles must be inferred from the Markdoc blog post (stripe.dev/blog/markdoc) and third-party analyses (`research/external/07-stripe-docs-approach.md`). When asked to match Stripe style, apply: second person, imperative mood, short sentences, concrete code before prose, minimal theory. Cite these as inferred principles, not a direct URL.
