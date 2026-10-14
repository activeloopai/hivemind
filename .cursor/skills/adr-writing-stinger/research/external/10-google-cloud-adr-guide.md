---
source_url: https://cloud.google.com/architecture/architecture-decision-records
retrieved_on: 2026-05-20
source_type: official-docs
authority: official
relevance: high
topic: onboarding
stinger: adr-writing-stinger
---

# Architecture Decision Records Overview | Google Cloud Architecture Center

## Summary

Google Cloud's official ADR guidance covers why, when, and how to use ADRs in enterprise infrastructure contexts. Key differentiator: strong emphasis on ADRs as an onboarding and archaeological tool, especially across team handoffs and ownership transfers. Covers reliability use cases (ADRs help troubleshoot by documenting current state rationale), the GKE regional cluster example as a concrete infrastructure decision scenario, and the option to mirror ADRs from a git repo to an internal wiki for broader accessibility.

## Key quotations / statistics

- "An ADR captures the key options available, the main requirements that drive a decision, and the design decisions themselves."
- "If someone needs to understand the background of a specific architectural decision, such as why you use a regional Google Kubernetes Engine (GKE) cluster, they can review the ADR and then the associated code."
- "ADRs can also help you run more reliable applications and services. The ADR helps you understand your current state and troubleshoot when there's a problem."
- "You should also consider that the application might change owners or include new team members. An ADR helps new contributors understand the background of the engineering choices that were made."
- "If you make adjustments, include the previous decision and why a change is made. This history keeps a record of how the architecture has changed as business needs evolve, or where there are new technical requirements or available solutions."
- "Onboarding: New team members can easily learn about the project, and they can review the ADR if they have questions while they're learning a new codebase."
- "Evolution of the architecture: If there's a transfer of technology stack between teams, the new owners can review past decisions to understand the current state."
- "Sharing best practices: Teams can align on best practices across the organization when ADRs detail why certain decisions were made and alternatives were decided against."
- Storage recommendation: close to application code in version control; optionally mirrored to a shared wiki for broader accessibility.

## Annotations for stinger-forge

- `guides/06-adr-as-onboarding-tool.md`: This is the richest source for the onboarding use case. The three value categories (Onboarding, Evolution, Sharing best practices) map directly to the three sections of the onboarding guide.
- The reliability/troubleshooting use case ("ADR helps you understand your current state and troubleshoot") is underrepresented in other sources and should be included as a fourth value category.
- The "mirror to wiki" pattern is a practical bridge between ADRs in git and non-technical stakeholders - mention it as an advanced option.
- `guides/04-supersession-workflow.md`: The "include the previous decision and why a change is made" guidance reinforces bidirectional supersession linking.
- Authority note: Google Cloud Architecture Center carries strong enterprise authority. This source is particularly useful for justifying ADR adoption to engineering leadership.
