# Reports

This folder accumulates dated culture-audit reports produced by `code-review-pr-worker-bee` when given access to a GitHub repository's PR timeline.

## Report format

Each report is named `<YYYY-MM-DD>-pr-culture-audit-<repo>.md` and contains:

1. **Scorecard** - five key metrics (review latency, comment depth, PR size distribution, reviewer diversity, rubber-stamp rate)
2. **Trend analysis** - comparison to previous audit if one exists
3. **Top findings** - the three most actionable issues found in the 30-PR sample
4. **Remediation plan** - ordered by expected impact

Culture audits are also stored at `library/qa/code-review/<date>-pr-culture-audit.md` per the canonical output path in the Command Brief.

## Retention

Keep reports indefinitely. They form the longitudinal record of a team's code review culture improvement. Each new audit should reference the previous one's findings.
