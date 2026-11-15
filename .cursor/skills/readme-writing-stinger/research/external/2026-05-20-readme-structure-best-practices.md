---
source_url: https://codec8.com/blog/how-to-write-good-readme
retrieved_on: 2026-05-20
source_type: blog
authority: practitioner
relevance: critical
topic: structure
stinger: readme-writing-stinger
---

# How to Write a Good README: The Complete Guide for 2026

## Summary

Comprehensive 2026 guide establishing that the README is the single most important file in any repository and functions as a landing page: developers decide whether to use a project within 30 seconds. The article provides a complete ordered section list, common mistake catalog, audience differentiation rules (OSS vs internal vs portfolio vs monorepo), and a production-ready template. Core framing: "A good README separates professional software from abandoned experiments."

## Key quotations / statistics

- "Developers decide whether to use your library within 30 seconds of landing on your repo. If the README does not immediately communicate value, they leave."
- "A README written six months ago that describes a different version of the software is actively harmful."
- Recommended structure order: Title + description → Badges → Installation → Quick Start / Usage → API Reference or docs link → Configuration → Contributing → License.
- "If your README exceeds 2,000 words, consider splitting detailed content into separate docs and linking from the README."
- OSS libraries: "Lead with the value proposition, show a quick start example immediately." Internal services: "Focus on setup instructions, environment configuration, and architecture context. Internal READMEs should answer 'how do I get this running locally?' within the first scroll."
- Effective READMEs fall between 300 and 1,500 words. Simple CLI: ~300 words. Full-stack framework: ~1,500 words.
- Markdown (.md) is the unambiguous standard for GitHub/GitLab/npm. "If your project lives on GitHub, Markdown is the only choice that renders automatically on your repository page."

## Annotations for stinger-forge

- **`guides/01-structure-checklist.md`**: The ordered section list (Title → Badges → Install → Quick Start → Config → API → Contributing → License) maps directly to the checklist. Add the "table of contents at 5+ sections" rule.
- **`guides/03-oss-vs-internal.md`**: The audience differentiation section provides the exact contrast needed: OSS leads with value proposition + quick start; internal leads with "how do I get this running locally."
- **`guides/00-principles.md`**: The 30-second decision window and the "landing page not manual" framing are the anchor principles.
- **Open question for stinger-forge**: The article recommends Markdown-only. The Command Brief asks whether `.rst` should be supported. This source supports CommonMark-only for GitHub-hosted projects; make the recommendation explicit in the stinger.
- The 300-1,500 word length guideline and 2,000-word extraction threshold are useful quantitative checks for `guides/05-done-checklist.md`.
