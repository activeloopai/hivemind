# Research Gaps - security-stinger

Tools / sources that were NOT available during the 2026-04-24 forge pass but would have improved the Stinger.

---

- **`web_search_exa` MCP** - not installed in this environment. Used the built-in `WebSearch` tool instead. Coverage was adequate for all planned queries but `web_search_exa`'s semantic-search mode is more forgiving of natural-language queries and might have surfaced additional third-party advisories. Revisit next refresh.
- **Direct Vercel security advisory RSS** - fetched advisory pages via WebSearch; did not subscribe to the RSS feed. See `open-questions.md` #2 for the recommended fix.
- **PortSwigger Web Security Academy** - cited in the Command Brief REFERENCE MATERIAL. Spot-checked via search results but did not fetch full lesson pages. The OWASP Cheat Sheet Series covers the same material with less overhead; we prioritized those.
- **`npm audit` sample outputs** - the Stinger documents the invocation but does not include a canned sample output. A future refresh could bundle a real `npm audit --json` fixture in `examples/` so the Bee has a concrete parsing target.

None of these gaps block the Stinger's immediate usefulness. Document here so the next pass knows what to improve.
