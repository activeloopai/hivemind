---
title: "Vale Linter - Machine-checkable Prose Quality for Technical Writing"
url: https://docs.vale.sh/ | https://github.com/vale-cli/vale | https://grafana.com/docs/writers-toolkit/review/lint-prose
source_type: tool
authority: high
relevance: medium
date_accessed: 2026-05-20
topic_tags: [vale, linter, prose-quality, style-guide, CI-integration, automation]
---

# Vale Linter for Prose Quality

## Summary

Vale is a command-line linter tool (written in Go, cross-platform) that brings code-like linting to prose. It enforces writing style guides through YAML-based rules organized into "styles" - collections of rules that can be applied selectively. Unlike grammar checkers (Grammarly, LanguageTool), Vale focuses on style consistency rather than correctness, making it appropriate for enforcing house styles in documentation teams.

**Current status:** Vale v3.14.1 was released in March 2026. Active development continues. The tool is widely adopted by documentation teams including Grafana (which maintains a public `writers-toolkit` with documented Vale rules), and is the de facto standard for docs-as-code prose linting.

**How it works:** Vale understands multiple markup formats (Markdown, AsciiDoc, reStructuredText, HTML, XML) and intelligently excludes code snippets to avoid false positives. Rules are context-aware: a rule can be limited to headings only, or applied only to paragraphs of a certain length.

**Rule types available:** existence checks (flag certain words/phrases), substitution patterns (replace A with B), occurrence/repetition checks, consistency validation, capitalization rules, readability metrics, spelling checks, and sequence patterns.

**Canonical style packages compatible with Vale:** Google (open-source), Microsoft (open-source), Write the Docs, Joblint, and custom organizational styles. These are installed as "packages" and mixed/matched per project.

**Diataxis-specific Vale ruleset (addressing Command Brief open question Q1):** No dedicated "Diataxis Vale ruleset" was found in the research window (May 2025 - May 2026). Diataxis classification is a structural/semantic judgment that cannot be reliably automated with pattern-matching rules - it requires understanding the document's purpose, which is beyond Vale's scope. The Bee remains the right tool for Diataxis classification; Vale handles lower-level style rules.

**What Vale can check for the Bee's criteria:**
- Voice: passive voice constructions (existence rule)
- Tense: past tense in reference docs (existence rule)
- Person: first-person plural in non-tutorial contexts (existence rule)
- Heading capitalization: title case vs sentence case (capitalization rule)
- Jargon on first use: cannot check, but can flag undefined acronyms (existence rule)
- Readability: Flesch-Kincaid score (readability metric rule)

## Key quotations / statistics

- "Vale is a command-line linter tool that brings code-like linting to prose, designed to enforce writing style guides and improve technical documentation quality."
- "Vale focuses specifically on style consistency rather than general grammar correction."
- "Vale v3.14.1 released March 2026, with active development continuing."
- "The tool is widely adopted by documentation teams including Grafana, with integration into CI/CD workflows."
- "Vale understands multiple markup formats... allowing it to intelligently exclude code snippets and avoid false positives."

## Annotations for stinger-forge

- `guides/06-docs-as-code-review.md` should reference Vale as the recommended CI lint layer for docs PRs, noting what Vale checks automatically vs. what the Bee checks manually.
- The answer to Command Brief Q1 (Vale + Diataxis ruleset): does not exist. Stinger-forge should document this explicitly to prevent a wild goose chase. Diataxis mode classification requires semantic judgment; automate voice/tense/capitalization with Vale, automate Diataxis with the Bee.
- A recommended Vale configuration for Legion projects could be documented in the Stinger as a sidebar or appendix: `Google` style + custom rules for Legion-specific vocabulary.
- The Grafana Writers' Toolkit (https://grafana.com/docs/writers-toolkit/) is an excellent worked example of a docs-as-code system using Vale in production. Stinger-forge may want to reference it as a "this is what a mature docs-as-code workflow looks like" example.
- Vale does not replace the Bee's review - it reduces the noise of trivial style issues so the Bee can focus on structural and clarity problems.
