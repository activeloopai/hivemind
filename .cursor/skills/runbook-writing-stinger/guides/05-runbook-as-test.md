# Runbook-as-Test: Game Day Methodology

> **Research source:** `research/external/2026-01-30-oneuptime-game-day-exercises.md`, `research/external/2026-sre-google-being-on-call-chapter.md`
> **Principle:** `guides/00-principles.md` Principle 5 ("Runbook-as-Test Mandate")

An untested runbook is a hypothesis. This guide covers how to schedule, execute, and capture results from runbook exercises so every runbook earns its READY status.

---

## Three exercise formats

Choose based on risk tolerance and environment availability:

### Format 1: Tabletop (minimum viable exercise)

**What:** Talk through the runbook step-by-step in a meeting. No system changes. The facilitator poses the scenario; participants narrate what they would do.

**When:** For new runbooks, high-risk runbooks, or when staging injection is not available.

**Duration:** 30-60 minutes.

**Output:** A list of gaps, ambiguous steps, and outdated commands. Updated runbook.

**Who:** Runbook author + 2 on-call engineers who have not seen the runbook before (fresh eyes find what familiarity hides).

---

### Format 2: Staging Exercise

**What:** Execute the runbook against a staging environment. Inject the failure condition if possible; otherwise, skip injection and execute the remediation steps against a staging service that is artificially degraded.

**When:** For runbooks that have passed tabletop but not yet been tested in a production-like environment.

**Duration:** 1-3 hours.

**Output:** TEST STATUS updated with date, environment, and outcome. All broken commands fixed.

**Who:** 1-2 on-call engineers. Observer with clipboard watching for gaps.

---

### Format 3: Game Day (full production-like)

**What:** Inject the failure condition into a production or production-like environment and execute the runbook under realistic conditions. Google SRE calls this "Wheel of Misfortune."

**When:** Quarterly, for all Tier 1 runbooks (alert-triggered, SEV-1 or higher).

**Duration:** 3-4 hours including debrief.

**Output:** `runbook_accuracy` score (see below), identified gaps, postmortem-style debrief, updated runbooks.

**Who:** On-call team + facilitator. Optional: chaos engineering tool (AWS FIS, Chaos Monkey, Litmus) to inject the failure.

**Source:** AWS FIS blog (July 2025): AWS reduced game day execution from days to hours via repeatable templates and now runs weekly. See `research/external/2026-01-30-oneuptime-game-day-exercises.md`.

---

## Quarterly game day program structure

OneUptime (2026-01-30) recommends a quarterly theme rotation:

| Quarter | Theme | Example scenarios |
|---|---|---|
| Q1 | Infrastructure failures | Database outage, cache failure, network partition |
| Q2 | Application errors | Memory leak, connection pool exhaustion, bad deploy |
| Q3 | Security incidents | Secrets exposure, DDoS, abnormal API access |
| Q4 | Dependency failures | Third-party API degradation, DNS failure, CDN outage |

Rotate themes so the team is not only exercising their most familiar runbooks.

---

## The runbook_accuracy metric

Use this observer rating scale to score each runbook during a game day:

| Score | Meaning |
|---|---|
| 5 | Runbook is accurate. Steps executed without modification. No gaps found. |
| 4 | Minor gaps. 1-2 steps required clarification but did not block execution. |
| 3 | Moderate gaps. 3-5 steps were outdated or ambiguous. Execution stalled at one decision point. |
| 2 | Major gaps. Multiple steps failed or were skipped. Required significant improvisation. |
| 1 | Runbook is not usable. More time was spent debugging the runbook than the incident. |

Target: all production runbooks at score ≥ 4 before the next quarter's game day.

Any runbook scoring ≤ 2 is placed in `DRAFT` status immediately and cannot be used as primary response procedure until repaired and re-exercised.

---

## TEST STATUS header (required)

Every runbook must include this header near the top (after the summary, before the Prerequisites section):

**Untested:**
```markdown
> ⚠️ TEST STATUS: UNTESTED
> This runbook has never been exercised. Treat it as a draft.
> Do not rely on this as a primary response procedure until tested in staging.
> To schedule a test, see `.cursor/skills/runbook-writing-stinger/guides/05-runbook-as-test.md`.
> Add to next game day queue: [link to game day planning doc]
```

**Tested:**
```markdown
> ✅ TEST STATUS: Last tested 2026-04-15 in staging (Format: Staging Exercise)
> Tested by: @sre-engineer-name
> Game day score (runbook_accuracy): 4/5
> Gaps found: Step 8 command was outdated (fixed in PR #1243). Steps 9-12 passed.
> Next scheduled exercise: 2026-07-15 (Q3 game day: Security incidents)
```

---

## 6-week planning timeline for a game day

| Week | Activity |
|---|---|
| -6 | Select scenario. Identify injection method (tool or manual degradation). Assign roles (executor, observer, facilitator). |
| -4 | Review all runbooks that will be exercised. Identify any in UNTESTED or DRAFT status. |
| -3 | Run tabletop of highest-risk runbooks. Patch obvious gaps. |
| -2 | Confirm staging environment availability. Test injection mechanism. |
| -1 | Final runbook review. Confirm participant availability. Draft debrief template. |
| Game day | Execute. Observer scores each runbook. Capture gaps in real time. |
| +1 week | Debrief meeting. Assign gap-fix action items with owners and due dates. |
| +2 weeks | All action items resolved. Runbooks updated with new TEST STATUS. |

---

## Debrief capture template

```markdown
# Game Day Debrief, [Date], [Scenario Name]

**Participants:** [names/handles]
**Facilitator:** [name]
**Duration:** [start - end]

## Runbooks exercised

| Runbook | Score (1-5) | Key gap | Fixed in PR |
|---|---|---|---|
| [runbook-name] | [score] | [one-line gap] | [PR link or N/A] |

## Top 3 systemic findings

1. [Finding 1, affects multiple runbooks]
2. [Finding 2]
3. [Finding 3]

## Action items

| Action | Owner | Due date | Status |
|---|---|---|---|
| [Fix command in runbook X step 4] | @name | YYYY-MM-DD | Open |

## Updated runbooks

- [ ] All runbooks with score < 4 have been updated and TEST STATUS refreshed.
- [ ] All action items have owners and due dates.
- [ ] Next game day date is scheduled.
```
