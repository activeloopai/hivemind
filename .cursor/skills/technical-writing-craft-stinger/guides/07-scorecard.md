# 07 - Scorecard and Findings Report

The scorecard is the structured summary of a writing quality review. It appears at the top of every findings report and gives the document author an at-a-glance view of where the document stands.

---

## The six scorecard criteria

| Criterion | Pass | Warn | Fail |
|---|---|---|---|
| **Diataxis mode** | Single mode, no mixing | Minor mixing (< 20% off-mode content) | Significant mixing or wrong mode |
| **Inverted pyramid** | Opening sentence is the most important fact | Opening is relevant but not optimal | Opening buries the lead or starts with history/tool |
| **Code discipline** | All code blocks pass the full checklist | 1-2 minor checklist violations | Missing introductory sentence, ellipsis omissions, or unrunnable code |
| **Voice and tone** | Consistent with house style or the default style | 1-2 isolated violations | Systematic passive voice, person mixing, or tense mixing |
| **Reader lens** | Prerequisites stated, jargon defined, EPPO-ready | Missing prerequisites or 1-2 undefined terms | Jargon-heavy, no audience statement, significant EPPO failures |
| **Structural completeness** | All sections needed for the Diataxis mode are present | One optional section missing | Required section (e.g., steps in a how-to) missing |

---

## Severity taxonomy

| Severity | Definition | Response required |
|---|---|---|
| **Blocker** | The document fails to serve the reader in a material way. Reader will be confused, fail, or be misled. | Must be fixed before the document is published or merged. |
| **Suggestion** | The document could be meaningfully improved. Reader experience is degraded but not broken. | Fix recommended; author may accept or decline with justification. |
| **Nit** | A minor stylistic issue or polish opportunity. Reader experience is not materially affected. | Fix at author's discretion; no pressure. |

---

## How to fill in the scorecard

1. Complete the full 8-step review workflow.
2. For each criterion, assign Pass / Warn / Fail based on the definitions above.
3. Write one sentence per criterion explaining the rating.
4. Use `templates/scorecard.md` as the blank template.

**Escalation rule:** If any criterion is Fail, the document has at least one Blocker finding. Every Blocker finding must include a specific rewrite proposal -- not "rewrite this section", but "rewrite the opening sentence to: [proposed text]".

---

## Findings structure

After the scorecard, list findings in descending severity order:

```markdown
### Blockers

**B1: [Criterion] -- [Short description]**
Location: [Section heading or line]
Finding: [What is wrong and why it matters to the reader]
Proposed rewrite: [Exact replacement text]

### Suggestions

**S1: [Criterion] -- [Short description]**
Location: [Section heading or line]
Finding: [What would be improved and why]
Proposed rewrite: [Exact or approximate replacement, or structural change]

### Nits

**N1: [Criterion] -- [Short description]**
Location: [Section heading or line]
Finding: [What the nit is]
```

---

## The one-line summary rule

End the findings report with a one-line summary that the document author can reference quickly:

> "[Document title]: Diataxis mode [Pass/Warn/Fail], [N] Blockers, [N] Suggestions, [N] Nits. [One sentence on the most important finding.]"

Example:
> "Webhook configuration guide: Diataxis mode Fail (reference/how-to mixing), 2 Blockers, 3 Suggestions, 1 Nit. Split the parameter table into a separate reference page and restructure the remaining content as a pure how-to."

See `templates/review-report.md` for the complete output template.
