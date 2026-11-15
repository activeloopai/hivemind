# Code Example Checklist

Apply one instance of this checklist per code block. A single Fail on items 1-4 is a Suggestion finding; a Fail on item 1 alone (unrunnable) may be a Blocker.

> Source: `research/external/06-code-example-discipline.md` (Google, GitHub, Microsoft)

---

**Code block location:** {section heading or line number}
**Language:** {python | typescript | bash | etc.}

| # | Check | Yes / No / N/A | Notes |
|---|---|---|---|
| 1 | Runnable without modification? (can copy, paste, and execute) | | |
| 2 | Produces the claimed output? | | |
| 3 | Language-tagged in the code fence? (` ```python `, not ` ``` `) | | |
| 4 | Preceded by an introductory sentence? | | |
| 5 | Intro sentence ends with colon (if immediately before block) or period (if separated)? | | |
| 6 | Omissions marked with language comments, not ellipsis (`# ... rest` not `...`)? | N/A if no omissions | |
| 7 | Non-obvious lines annotated (inline comment or annotation)? | N/A if all lines obvious | |
| 8 | Named parameters used where clarity matters (not positional)? | N/A if no parameters | |
| 9 | Uses realistic example values (not `foo`, `bar`, `baz`)? | | |
| 10 | Tested against the current library/API version? | | |
| 11 | Output or result shown where non-obvious or hard to run? | N/A if output obvious | |
| 12 | Free of security anti-patterns (no hardcoded secrets, no SQL injection)? | | |

---

**Overall:** {Pass if all 12 Yes/N/A | Warn if 1-2 No | Fail if No on items 1, 2, or 4}

**Findings from this block:**
- {Finding 1}
