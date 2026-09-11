# 01 - Inverted Pyramid

> Source: `research/external/04-inverted-pyramid-technical-docs.md`

The inverted pyramid is a prose structure from journalism applied to technical writing. It presents information in descending order of importance: the single most important fact appears first, followed by context and background, followed by supplementary detail.

---

## Why it matters

Research shows readers follow an **F-shaped reading pattern**: attention is strongest at the top left and decreases as the reader moves down the page. Most readers do not finish technical documents -- they stop when they have enough to act. The inverted pyramid respects this behavior:

- Readers can stop at any point and still understand the main idea.
- Readers can quickly determine if the document is relevant to them.
- Scanning works because the most important content is at the top.
- SEO is stronger because relevant keywords appear first.

---

## The three-layer model

| Layer | Content | Example |
|---|---|---|
| 1 -- Must have | The single most important fact, outcome, or answer | "Rate limiting protects your API from traffic spikes by rejecting requests above a threshold." |
| 2 -- Adds understanding | Context, prerequisite concepts, background | "The default threshold is 100 requests per minute per API key." |
| 3 -- Non-essential | Edge cases, advanced detail, related concepts | "For burst traffic, use the token-bucket algorithm instead of the sliding window." |

Apply this three-layer model at two levels:
- **Document level:** The first paragraph is Layer 1. Subsequent paragraphs add layers.
- **Paragraph level:** The first sentence of every paragraph is Layer 1 for that paragraph.

---

## The opening sentence test

The opening sentence of any explanation or concept doc must answer: **"What is the single most important thing the reader needs to know about this topic?"**

**Common failure modes and fixes:**

| Failure | Original | Rewrite |
|---|---|---|
| Tool-first instead of outcome-first | "The rate limiter is a component that..." | "Rate limiting prevents API abuse by capping the number of requests a client can make in a time window." |
| History before present | "We introduced authentication in 2023 to..." | "Authentication ensures every request to the API carries a verified identity." |
| Passive voice burying the subject | "Requests can be rate-limited by configuring..." | "You can rate-limit requests by configuring the `rateLimit` option." |
| Hedge before claim | "Depending on your use case, you may want to consider..." | "Use webhook retries when delivery failures are expected in your environment." |

---

## Headings as summaries

Headings are navigation aids AND promises. A reader scanning headings must be able to predict the content of each section. Follow these patterns:

| Diataxis mode | Heading pattern | Example |
|---|---|---|
| Tutorial | Scene-setting noun phrase | "Building your first integration" |
| How-to | Infinitive or imperative | "Configure rate limiting", "How to enable webhooks" |
| Reference | Noun phrase (precise, complete) | "Request parameters", "Error codes" |
| Explanation | Question or gerund | "Why requests fail silently", "Understanding the retry model" |

**Heading quality checks:**
- Does the heading predict the section content? (If not: rewrite.)
- Is the heading specific enough to distinguish this section from adjacent ones? (If not: add specificity.)
- Does the heading start with a keyword the reader would scan for? (If not: front-load the keyword.)

---

## When NOT to apply the inverted pyramid

**How-to guides follow imperative sequential structure, not inverted pyramid.** Steps must come in execution order. Putting the most "important" step first would break the procedure.

**Reference follows completeness structure, not inverted pyramid.** Every parameter, every option, every return value must be present. Ordering by importance would make the reference incomplete.

Apply the inverted pyramid to:
- Explanation documents (fully applicable)
- The opening paragraph of any document (applies regardless of mode)
- The first sentence of conceptual asides within procedural documents

---

## Example: original vs. inverted-pyramid rewrite

**Original opening (tool-first):**
> "The `WebhookManager` class is responsible for managing the lifecycle of webhooks in the system. It was introduced in version 2.3 and has since been used to handle event dispatch, retry logic, and delivery confirmation. The class exposes a set of methods..."

**Inverted-pyramid rewrite (outcome-first):**
> "Webhooks let your application react to events in real time without polling. `WebhookManager` handles event dispatch, retry logic, and delivery confirmation. The class was introduced in version 2.3."

The rewrite leads with what the reader cares about (outcome), follows with what the class does (context), and defers the version history (non-essential) to the end.

See `examples/01-mode-mixing-diagnosis.md` for a complete worked review session.
