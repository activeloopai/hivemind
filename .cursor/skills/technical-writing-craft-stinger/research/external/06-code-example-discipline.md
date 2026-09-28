---
title: "Code Example Discipline in Technical Documentation"
url: https://developers.google.com/tech-writing/two/sample-code | https://docs.github.com/en/contributing/syntax-and-versioning-for-github-docs/annotating-code-examples | https://learn.microsoft.com/en-us/style-guide/developer-content/code-examples
source_type: official-docs
authority: high
relevance: high
date_accessed: 2026-05-20
topic_tags: [code-examples, code-discipline, annotation, runnable-code, documentation-quality]
---

# Code Example Discipline in Technical Documentation

## Summary

Multiple authoritative sources (Google, GitHub, Microsoft) converge on a consistent set of principles for code examples in technical documentation. Code examples are often the best documentation: developers prefer working code over text explanations. The cardinal rule is that code examples must be correct, runnable, and maintained as production code - never prioritize brevity over correctness.

**The four core properties (Google):** Correct, concise, understandable, and commented. "Correct" is non-negotiable: examples must build without errors, perform the claimed task, be free of security vulnerabilities, follow language conventions, and be tested and maintained.

**Annotation approach (GitHub Docs):** GitHub uses a two-pane layout with code annotation tags (comment markers) that link lines of code to explanation text displayed alongside. This decouples the explanation from the code block itself, keeping the code clean while still providing context. The introductory paragraph before the code block should describe the overall purpose; annotations explain specific non-obvious lines.

**Microsoft's emphasis:** Show expected output or results, especially for examples that are difficult to run. List requirements and dependencies. Design code for reuse - help developers understand what to modify. Code examples serve diverse audiences from beginners to experienced users tailoring examples for specific needs.

**Naming discipline (Google):** Use descriptive, named parameters rather than positional arguments to aid understanding. Use named parameters (`rank=5, dimension=28`) rather than positional arguments. Avoid confusing programming tricks. Prevent deeply nested code.

**Introductory sentence rule (Google):** Precede every code sample with an introductory sentence or paragraph. If it immediately precedes the sample, end with a colon. If more material appears between the introduction and sample, end with a period. Never end with a colon and then place other content before the sample.

**Omission discipline (Google):** Indicate omitted code with a language-appropriate comment, not with three dots or ellipsis characters. Never disable click-to-copy for code blocks containing omissions - readers deserve to see the actual syntax.

## Key quotations / statistics

- "Never prioritize brevity over correctness - avoid bad practices to shorten code." (Google)
- "Code examples are often the best documentation since developers prefer working code over text explanations." (Google)
- "Always compile and test your code. Since systems change over time, maintain sample code as you would production code." (Google/Microsoft)
- "Use descriptive class, method, and variable names, avoid confusing programming tricks, and prevent deeply nested code." (Google)
- "Avoid snippets-only documentation, as teams tend not to test snippets as rigorously as full programs." (Google)
- "Introduce the overall purpose before the code block. Show expected output or results." (GitHub/Microsoft)

## Annotations for stinger-forge

- `guides/02-code-example-discipline.md` should lead with the four-property checklist (correct, concise, understandable, commented) as the organizing structure.
- `templates/code-example-checklist.md` should be a runnable Yes/No checklist derived from these sources. Draft checklist items: (1) Does it run without modification? (2) Does it produce the claimed output? (3) Does it follow language conventions? (4) Is it preceded by an introductory sentence? (5) Are omissions marked with language comments, not ellipsis? (6) Are non-obvious lines annotated? (7) Are named parameters used instead of positional ones where clarity matters? (8) Is it language-tagged in the code fence? (9) Has it been tested against the current version of the library/API?
- The "snippets-only documentation" warning is important: the Bee should flag when a code block appears in isolation without introductory context as a Suggestion finding.
- The distinction between code annotation (for non-obvious lines) and introductory paragraph (for overall purpose) maps to two separate checklist items.
- Stripe's approach (see external/07) extends these principles with progressive disclosure (tabs for multiple languages) and "working code on every page" as a philosophy.
