---
type: question
title: ""
question: ""
answer_quality: draft
created: 2026-04-29
updated: 2026-04-29
status: developing
tags:
  - question
related: []
sources: []
---

# {Title}

**Question:** [restate the original query in one sentence]

## Answer

[The synthesized answer, with citations to specific wiki pages or source files. If unanswered, note that explicitly and what would be needed to answer it.]

(Source: [[entities/...]] or `path/to/file.ts:line`)

## Confidence

[draft | solid | definitive] - [why]

## Related

- [[entities/...]]
- [[concepts/...]]
- [[questions/...]]

---

**When wiki-worker-bee files a question:**

- Phase 5 ADR detection encountered a low-confidence commit signal - the question asks the human to confirm whether the commit encoded an architectural decision.
- Phase 6 contradiction protocol detected a contract change but the resolution is ambiguous - the question proposes the conflict and asks for human judgment.
- Phase 1 entity parsing encountered a referenced symbol whose definition wasn't in the chunk (a tree-sitter `raw_call` or `unresolved:` edge target) - the question records the gap.
