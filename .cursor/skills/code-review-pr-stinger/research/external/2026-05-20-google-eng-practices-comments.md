---
source_url: https://google.github.io/eng-practices/review/reviewer/comments.html
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: critical
topic: comment-writing
stinger: code-review-pr-stinger
---

# How to Write Code Review Comments (Google Engineering Practices)

## Summary

Google's official guidance on writing code review comments establishes four core principles: be kind; explain your reasoning; balance explicit directions vs. pointing out problems; encourage simplification over explanation. The document introduces Google's formal comment severity labeling system (Nit, Optional/Consider, FYI) and articulates the dual purpose of review: getting the best CL possible AND improving the skills of developers so they require less review over time. This is the most widely cited canonical source for comment-writing norms.

## Key quotations / statistics

- "It is important to be courteous and respectful while also being very clear and helpful to the developer whose code you are reviewing."
- "Be sure that you are always making comments about the code and never making comments about the developer."
- Bad example: "Why did you use threads here when there's obviously no benefit to be gained from concurrency?"
- Good example: "The concurrency model here is adding complexity to the system without any actual performance benefit that I can see. Because there's no performance benefit, it's best for this code to be single-threaded."
- "The primary goal of code review is to get the best CL possible. A secondary goal is improving the skills of developers so that they require less and less review over time."
- "Remember that people learn from reinforcement of what they are doing well and not just what they could do better. If you see things you like in the CL, comment on those too!"
- **Google's severity labels:**
  - `Nit:` - "This is a minor thing. Technically you should do it, but it won't hugely impact things."
  - `Optional (or Consider):` - "I think this may be a good idea, but it's not strictly required."
  - `FYI:` - "I don't expect you to do this in this CL, but you may find this interesting to think about for the future."
- "Without comment labels, authors may interpret all comments as mandatory, even if some comments are merely intended to be informational or optional."
- "If you ask a developer to explain a piece of code that you don't understand, that should usually result in them rewriting the code more clearly."
- "Explanations written only in the code review tool are not helpful to future code readers."

## Annotations for stinger-forge

- **Directly informs `guides/06-comment-coaching.md`**: The bad/good example pair ("Why did you use threads..." vs "The concurrency model...") is the most concise illustration of the "comment about code, not developer" principle. Use as a worked example.
- **Severity label system** is the authoritative precedent for the Bee's three-tier comment taxonomy. The Bee's taxonomy (`blocker` / `suggestion` / `thought`) should explicitly acknowledge this Google origin.
- **Positive reinforcement** (commenting on what is done well) belongs in the mentorship guide as a distinct behavioral norm, not an afterthought.
- **"Simplify the code rather than explain it"** is a recurring pattern worth encoding as a review heuristic: if a reviewer asks "why is this so complex?", the correct author response is to simplify the code, not write a comment block.
- **Contradiction to resolve**: Google's "FYI:" label has no direct equivalent in the three-tier system. The Bee could add a fourth "educational" tier, or collapse FYI into "thought" (the lightest tier). The stinger-forge author should decide.
