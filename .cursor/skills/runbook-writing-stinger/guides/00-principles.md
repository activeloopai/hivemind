# Principles: The Six Laws of Operational Runbooks

> **Research sources:** `research/external/2026-03-08-incop-oncall-runbook-best-practices.md`, `research/external/2026-sre-google-being-on-call-chapter.md`, `research/external/2026-04-22-thegoodshell-incident-runbook-template.md`, `research/external/2026-02-15-sreschool-runbook-definition-maturity.md`

These six principles are the non-negotiables. Every guide in this stinger derives from them. Every checklist item in `guides/07-done-checklist.md` traces back to at least one.

---

## Principle 1: No Implied Context

**Law:** Every command is copy-pasteable. Every URL is absolute. Every environment variable is defined inline. Every decision point is explicit. A runbook written for "someone who knows the system" is not a runbook.

**Failure mode when violated:** An on-call engineer at 3am fills in gaps with wrong assumptions. The "usual restart script" does not exist in their context. The command fails. They improvise. The incident deepens.

**Example of violation:**
> "Check the logs for errors and restart if needed."

**Corrected:**
> "Run:
> ```
> npm run embeddings:logs -- --tail=200 | grep -E 'ERROR|FATAL|rate.?limit|401'
> ```
> If you see `rate limit` or `429`, proceed to Step 6 (Throttle and Resume). If you see `401`, proceed to Step 5 (Restart with Fresh Key). If neither pattern appears, escalate per Step 10."

**Source:** Incident Copilot (2026-03-08) provides this exact anti-pattern/correction pair verbatim. See `research/external/2026-03-08-incop-oncall-runbook-best-practices.md`.

---

## Principle 2: Exact-Command Discipline

**Law:** No approximations. No "something like". No "the usual". Every shell command, npm script, dataset query, and API call is exact: correct flags, correct dataset paths, correct daemon names, correct environment.

**Failure mode when violated:** Two on-call engineers execute different interpretations of the same step. One restarts the right daemon. One restarts the wrong one. Post-incident review cannot determine which step caused the second failure.

**Implementation rule:** If a command differs between environments (staging vs. production), use a variable (`$ENV`) and define it in the Prerequisites section. Never write two versions of the same command inline.

**Template for parameterized commands:**
```
Prerequisites:
  ENV=production              # or: staging, dev
  DATASET=ds_hivemind_prod    # Deep Lake dataset for this environment
  DAEMON=embeddings-daemon    # process name

Step 3: Lower embed concurrency
  npm run embeddings:config -- --set concurrency=2
```

**Source:** SRE School (2026-02-15) confirms exact commands are one of 9 quality attributes for production-ready runbooks. See `research/external/2026-02-15-sreschool-runbook-definition-maturity.md`.

---

## Principle 3: Explicit Escalation Paths

**Law:** Every runbook names its escalation contact with: (1) the person or team, (2) the channel or mechanism, and (3) the response-time expectation. "Escalate if needed" is a policy gap, not an escalation path.

**Failure mode when violated:** An engineer has been paging alone for 40 minutes. Their escalation options are unclear. They DM the author (who is asleep in a different timezone). The incident drags past SLA while they wait.

**Required escalation path format:**
```
## Escalation Path
- **Tier 1 (this runbook):** On-call engineer (you)
- **Tier 2 (15 min, no progress):** Hivemind Platform team on-call, #hivemind-oncall Slack (PagerDuty: "Hivemind Platform")
  Expected response: within 10 minutes
- **Tier 3 (30 min, still no progress or SEV-1):** Engineering Manager on-call
  Page via: PagerDuty "EM Escalation" policy
  Expected response: within 15 minutes
```

**Source:** PagerDuty official docs recommend a three-tier escalation structure for most services. See `research/external/2026-pagerduty-escalation-policies-three-tier.md`. Full architecture guide: `guides/03-escalation-path-architecture.md`.

---

## Principle 4: Rollback Before You Ship

**Law:** Every step that modifies state (restarts a service, scales a deployment, runs a migration, changes a feature flag, flushes a cache) must have a corresponding undo step in the Rollback section, OR an explicit irreversibility acknowledgment with a documented risk.

**Failure mode when violated:** Step 6 scales the database connection pool from 10 to 50. The incident isn't resolved. The engineer escalates. The Tier 2 responder arrives and doesn't know what's been changed. They make another change. Now there are two untracked modifications in flight.

**Rollback section requirements:**
- One undo step for every state-changing step, in reverse order.
- For irreversible steps (e.g., dropped table, sent email, charged card): `⚠️ IRREVERSIBLE: This step cannot be undone. Risk: [description]. Mitigation: [how to recover from the consequences if needed].`
- A "current state" note at the start of each rollback step so engineers know what to expect before executing.

**Full guide:** `guides/04-rollback-procedures.md`.

---

## Principle 5: Runbook-as-Test Mandate

**Law:** An untested runbook is a hypothesis. A hypothesis that will be tested during a production incident is a liability. Exercise runbooks before that moment arrives.

**Three exercise formats:**
1. **Tabletop:** Talk through the runbook step-by-step in a meeting. No system changes. Suitable for all runbooks. Minimum bar.
2. **Staging exercise:** Execute the runbook against a staging environment. Documents gaps and outdated commands.
3. **Game day (full):** Inject the failure condition into production (or a production-like environment) and execute the runbook under realistic conditions. Google SRE calls this "Wheel of Misfortune."

**Untested runbook marking (required):**
```
> ⚠️ TEST STATUS: UNTESTED
> This runbook has never been exercised. Treat it as a draft.
> Do not rely on it as a primary response procedure until it has been tested in staging.
> To schedule a test, see guides/05-runbook-as-test.md.
```

**Tested runbook marking (required):**
```
> ✅ TEST STATUS: Last tested 2026-04-15 in staging by @engineer-name
> Outcome: Steps 1-7 passed. Step 8 command was outdated (fixed). Steps 9-12 passed.
> Next scheduled exercise: 2026-07-15
```

**Source:** Google SRE Book Ch. 11 defines the Wheel of Misfortune pattern. OneUptime (2026-01-30) documents the full quarterly game day methodology. See `research/external/2026-01-30-oneuptime-game-day-exercises.md`. Full guide: `guides/05-runbook-as-test.md`.

---

## Principle 6: Alert-Links-to-Runbook (Storage Discipline)

**Law:** The alert notification must link directly to the specific runbook, not to a runbook index or a wiki homepage. An on-call engineer paged at 3am should be able to reach the correct runbook in one click from their phone.

**Failure mode when violated:** The engineer receives a PagerDuty page. The "runbook" link goes to the team's Confluence space. They search for the runbook name. It doesn't come up. They ask in Slack. Two minutes have passed and they have not read a single step.

**Implementation:**
- Every alert definition (in PagerDuty, Grafana, Datadog, etc.) must include a `runbook_url` field pointing to the canonical runbook URL.
- Runbooks must live at stable, predictable URLs. Git-backed runbooks should be served via a docs site (Backstage, GitBook, Notion public link), not browsed via GitHub raw.
- If a runbook is split into sub-runbooks, the alert links to the parent runbook which routes to sub-runbooks within its decision tree.

**Source:** The Good Shell (2026-04-22) names this as a storage requirement: "Your alert should link directly to the specific runbook." See `research/external/2026-04-22-thegoodshell-incident-runbook-template.md`.

---

## Principles summary

| # | Name | Key test |
|---|---|---|
| 1 | No implied context | Can a new hire execute every step without Slack DMs? |
| 2 | Exact-command discipline | Are there any approximate or parameterless commands? |
| 3 | Explicit escalation paths | Does every runbook name Tier 2 with a channel and SLA? |
| 4 | Rollback before you ship | Is there an undo step for every state-changing action? |
| 5 | Runbook-as-test mandate | Is the TEST STATUS header present and current? |
| 6 | Alert-links-to-runbook | Does the alert payload have a direct `runbook_url`? |

All six must pass before a runbook is marked `READY FOR PRODUCTION`. See `guides/07-done-checklist.md` for the full validation protocol.
