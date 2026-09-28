# OSS vs Internal README

> Source: `research/external/2026-05-20-readme-structure-best-practices.md`

Two audiences. Two registers. Two templates. Never mix them.

---

## The audience split

| Dimension | OSS README | Internal README |
|---|---|---|
| **Reader** | Skeptical developer evaluating alternatives | Trusting teammate with existing context |
| **Time budget** | 10-30 seconds to decide | 2-5 minutes to get up and running |
| **Goal** | Acquire a new user | Enable a teammate to operate the tool |
| **First question** | "Is this worth my time vs. alternatives?" | "What does this do and how do I run it?" |
| **Trust level** | Zero | High |
| **Length** | 300-1,500 words | 200-600 words |

---

## OSS README: value-first, friction-minimal

The OSS README competes with 10 open tabs. The goal of the first screen is to make the reader want to install it.

**Lead with:**
1. Title + one-liner tagline that names the problem it solves
2. Badges (live CI, coverage, version)
3. Hero image or demo GIF if the tool has a visual output
4. Quickstart (5 commands, copy-paste runnable)

**Rules:**
- Install command visible without scrolling
- No paragraphs before the quickstart
- One-liner pitch: one sentence, no jargon, states the value proposition for a developer who has never heard of this
- Features list: 5-8 bullets, each a verifiable user-facing capability

**Anti-patterns:**
- Paragraph of context before the quickstart ("This project grew out of a hackathon in 2022...")
- "Philosophy" section before the install
- Referring to the reader as "we" (sounds like marketing, not engineering)

Use `templates/oss-library-readme.md`.

---

## Internal README: context-first, operational

The internal README does not compete. The reader already knows the problem exists. They need to get to "running" fast, and they need to know who to call when things break.

**Lead with:**
1. Title (no tagline needed)
2. "What problem this solves and why it exists here" (2-3 sentences)
3. Who owns this (team name + Slack channel)
4. Where it runs (environments, URLs, cluster names)
5. Setup / install (assume less implicit setup knowledge than you think)

**Rules:**
- Skip the sales pitch entirely
- Assume the reader knows the domain context
- Name the on-call contact and the issue-escalation path
- Include the known-broken states and workarounds (this is operational knowledge that lives nowhere else)

**Anti-patterns:**
- Elevator pitch at the top (they already know they need this tool)
- Hero images, animated GIFs, star-count badges
- Contribution section longer than two sentences (internal tools usually have one maintainer)

Use `templates/internal-tool-readme.md`.

---

## Detecting which type you have

If unsure, ask one question: "Would I be embarrassed if a stranger outside the company read this?"

- If yes → internal tool (protect proprietary context; do not publish)
- If no → OSS-eligible (safe to publish; apply OSS template)

Also signal: does the repo have a `LICENSE` file? If yes, it's OSS or OSS-destined.

---

## Edge cases

**SaaS product landing README:** Use the OSS template but replace the "install" section with "try it" (link to demo, free tier signup). Features list becomes benefit-oriented, not implementation-oriented.

**CLI tool:** OSS template, but elevate the `USAGE` block (flags, subcommands) above the `Install` section. A CLI reader often already knows how to install; they need the command syntax.

**Monorepo root:** Acts as an index to sub-packages. Leads with "what is in here and how is it organized." Each sub-package has its own README. Length: 200-400 words maximum.

> Open question: The `templates/monorepo-root-readme.md` template was proposed in the Command Brief but not covered in the shallow research pass. If monorepo READMEs are a frequent use case, open a `normal`-depth scripture-historian pass on "monorepo README patterns 2026".

---

*See `examples/before-after-oss.md` and `examples/before-after-internal.md` for register rewrites in action.*
