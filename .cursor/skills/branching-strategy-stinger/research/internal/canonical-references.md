# Internal: Canonical Reference Material

This file documents the canonical references identified in the Command Brief and their current status for stinger-forge consumption.

## Canonical References from the Command Brief

### 1. Trunk Based Development Website
- **URL:** https://trunkbaseddevelopment.com/
- **Status:** Identified; Firecrawl auth unavailable at research time; content captured via Exa highlights
- **Key content:** The definitive reference for TBD patterns, covering both "committers work at the trunk" (commit directly to main) and "short-lived feature branch" (branch max 1-2 days) styles. Covers the TBD scale argument.
- **Stinger-forge action:** Scrape this URL directly during stinger-forge or use the Exa content already captured in external files.

### 2. GitHub Flow Documentation
- **URL:** https://docs.github.com/en/get-started/using-github/github-flow
- **Status:** Identified; captured via Exa highlights from multiple secondary sources
- **Key content:** GitHub Flow rules: (1) main is always deployable, (2) create descriptive branches for new work, (3) push early and often, (4) open PRs for feedback, (5) merge after review, (6) deploy immediately after merge.
- **Stinger-forge action:** Scrape for exact wording and any 2025-2026 updates.

### 3. Atlassian Gitflow Workflow Guide
- **URL:** https://www.atlassian.com/git/tutorials/comparing-workflows/gitflow-workflow
- **Status:** Identified; content covered by multiple external sources in research set
- **Key content:** Canonical GitFlow explanation covering develop, feature/*, release/*, hotfix/* branches.
- **Stinger-forge action:** Cross-reference against the research set content.

### 4. Google Engineering Practices
- **URL:** https://google.github.io/eng-practices/
- **Status:** Identified; not scraped (lower priority than branching-specific sources)
- **Key content:** Google's internal code review practices - relevant for the "synchronous code review" prerequisite for TBD adoption.
- **Stinger-forge action:** Optional scrape if deeper code review guidance is needed.

### 5. Martin Fowler Feature Toggles
- **URL:** https://martinfowler.com/articles/feature-toggles.html
- **Status:** Identified; four-type taxonomy captured via Exa highlights from secondary sources (feature-flags-scale reference)
- **Key content:** Pete Hodgson's taxonomy of four flag types (release, experiment, ops, permission). The canonical source for the terminology used across the entire feature flag ecosystem.
- **Stinger-forge action:** Scrape for direct quotations of the four types and their lifespans.

### 6. GitHub Merge Queue Documentation
- **URL:** https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
- **Status:** Captured via Exa highlights; full content available in external source file `2026-05-20-github-merge-queue-official-docs.md`
- **Key content:** Configuration options, FIFO ordering, temporary branch naming, CI event trigger requirement.
- **Stinger-forge action:** Cross-reference the external file against official docs.

## Additional High-Value References Discovered During Research

### 7. DORA Capabilities: Trunk-Based Development
- **URL:** https://dora.dev/capabilities/trunk-based-development/
- **Status:** Captured via Exa; content in `external/2026-05-20-dora-tbd-capability.md`
- **Key content:** Research basis (2016-2017 data), measurement framework (active branches ≤3, merge daily, no code freezes), implementation guidance.

### 8. GitLab Merge Trains Documentation
- **URL:** https://docs.gitlab.com/ci/pipelines/merge_trains
- **Status:** Captured via Exa; content in `external/2026-05-20-gitlab-merge-trains.md`
- **Key content:** Merge train mechanics, requirements, failure handling. GitLab equivalent of GitHub merge queue.

## Notes on Source Recency
- All primary external sources are from 2025-2026 (within 12-month window)
- The GitHub merge queue case study is from March 2024 but remains the canonical real-world deployment case and is still actively referenced in 2026 content
- The DORA data cited is from 2016-2017 reports but the DORA capability page is evergreen and actively maintained
- Martin Fowler's feature toggles article is the oldest canonical reference (~2017) but the taxonomy remains industry-standard
