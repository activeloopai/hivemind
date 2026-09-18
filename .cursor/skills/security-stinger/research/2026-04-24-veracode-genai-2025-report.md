# Veracode 2025 GenAI Code Security Report

**Sources:**
- https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/
- https://www.veracode.com/blog/genai-code-security-report/
- https://www.businesswire.com/news/home/20250730694951/en/AI-Generated-Code-Poses-Major-Security-Risks-in-Nearly-Half-of-All-Development-Tasks-Veracode-Research-Reveals
- https://www.veracode.com/blog/ai-generated-code-security-risks/

**Retrieved:** 2026-04-24
**Query used:** "Veracode 2025 AI-generated code security report JavaScript pass rate 45 percent"

## Summary

Veracode analyzed 80 curated coding tasks across 100+ LLMs in Java, JavaScript, Python, and C#. Headline finding: AI produces functional code, but introduces security vulnerabilities in ~45% of cases. JavaScript failure rate is in the 38-45% range (security pass rate ≈ 55-62%, i.e., worse than the brief's original "57%" figure but in the same ballpark).

## Key statistics to preserve

- **45%** of AI-generated code contains security flaws (all languages, aggregate).
- **JavaScript:** 38-45% failure rate → ~55-62% pass rate. (The Bee body says "57%"; Veracode's blog language places JS at the higher end of risk alongside Python and C#.)
- **Java:** >70% failure rate (riskiest).
- **Cross-site scripting (CWE-80):** models failed in **86%** of cases.
- **Log injection (CWE-117):** models failed in **88%** of cases.
- Larger models did **not** outperform smaller models on security - "systemic, not a scaling problem."

## Key quotations

> "Models are getting better at coding accurately but are not improving at security, and larger models do not perform significantly better than smaller models."

## Relevance to this stinger

- `guides/02-vibe-coding-patterns.md` cites these numbers to justify treating recently AI-generated code as "suspect until audited."
- The 86% XSS and 88% log-injection failure rates justify promoting those two checks higher in the scan order inside `guides/01-scan-procedure.md`.
- The "JavaScript 57% pass rate" from the Bee body is preserved as a reasonable approximation but the Stinger should note Veracode's JS-at-the-high-end-of-risk framing so the Bee does not over-trust the 57% number.
