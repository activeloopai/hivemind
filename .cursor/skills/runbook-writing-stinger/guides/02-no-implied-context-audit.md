# No-Implied-Context Audit Protocol

> **Research source:** `research/external/2026-03-08-incop-oncall-runbook-best-practices.md`, `research/external/2026-02-15-sreschool-runbook-definition-maturity.md`
> **Principle:** `guides/00-principles.md` Principle 1 and 2

This guide is the step-by-step protocol for auditing any runbook (new or existing) against the no-implied-context rule. Run it on every runbook before marking it READY FOR PRODUCTION.

---

## The audit protocol (9 checks)

For each check, scan the runbook top to bottom. Flag every violation with a `<!-- VIOLATION: [type] -->` comment inline, then fix each one before moving on to the next check.

---

### Check 1: Copy-paste commands

**Test:** Can every shell command, dataset query, npm script, and API call be copied and pasted into a terminal without modification?

**Violations to find:**
- Commands with `<placeholder>` that aren't defined in a Prerequisites section.
- Commands that reference variables defined elsewhere (in a script, in an env file) without defining them inline.
- Commands with "..." or "etc." in them.
- Commands that require tab-completion to find the right resource name.

**Correction pattern:**
```
# BEFORE (violation):
npm run embeddings:status

# AFTER (compliant):
npm run embeddings:status -- --dataset "$DATASET"
# Expected output: {"state":"running"|"stalled","queueDepth":<N>,"lastAdvance":"<timestamp>"}
# If the command errors with "unknown dataset", confirm DATASET is correct: echo $DATASET
```

---

### Check 2: Absolute URLs

**Test:** Are all URLs absolute (including protocol and domain)?

**Violations to find:**
- Relative paths: `/dashboard/embeddings`
- Anchor references without a base: `#alert-overview`
- "Check the embeddings dashboard" without a URL
- "Open the runbook index" without a URL

**Correction:** Replace with the full URL: `https://grafana.internal.example.com/d/hivemind-embeddings?var-env=production`

---

### Check 3: Environment variables defined

**Test:** Is every environment variable used in a command defined in the Prerequisites section?

**Violations to find:**
- `$DATASET`, `$DAEMON`, `$ENV` used but not defined.
- A command that works in one environment but not another without explanation.

**Correction:** Add a Prerequisites section at the top of the runbook:
```
## Prerequisites
Before executing any step, set these variables in your terminal:

  ENV=production              # environment: production | staging | dev
  DATASET=ds_hivemind_prod    # Deep Lake dataset for this environment
  DAEMON=embeddings-daemon    # process name (check: npm run embeddings:status -- --pid)
```

---

### Check 4: Decision points are explicit

**Test:** Does every "if/else" in the runbook name exactly what to look for and where to route?

**Violations to find:**
- "If the restart doesn't work, try something else."
- "If you see errors, investigate further."
- "Check if this is a known issue." (Where? Known issue list is not linked.)

**Correction pattern:**
```
# BEFORE (violation):
If the service doesn't come back up, investigate further.

# AFTER (compliant):
If the daemon is still not Running after 3 minutes:
  - Run: npm run embeddings:logs -- --tail=50 | grep -E '401|429|FATAL'
  - If logs show "401": proceed to Step 5 (Restart with Fresh Key).
  - If logs show "429": proceed to Step 6 (Throttle and Resume).
  - If logs show neither: escalate to Tier 2 per the Escalation Path section.
```

---

### Check 5: All referenced documents are linked

**Test:** Does every reference to another document include a direct link or path?

**Violations to find:**
- "See the on-call guide."
- "Check the deployment runbook."
- "Refer to the incident response policy."

**Correction:** Link inline: `See the [on-call guide](https://wiki.example.com/oncall-guide).`

---

### Check 6: Commands include expected output

**Test:** Does every command tell the engineer what to expect when it succeeds?

**Why:** An engineer who doesn't know what success looks like cannot tell if a command ran correctly.

**Correction pattern:**
```
Run: npm run embeddings:status -- --dataset "$DATASET"
Expected: state=running and queueDepth decreasing
If state=stalled: proceed to Step 4.
If the command errors: proceed to Step 6.
```

---

### Check 7: Time estimates per step

**Test:** Do time-sensitive steps include an estimated duration?

**Why:** Engineers manage their escalation window based on how long each step should take. A step that should take 30 seconds but takes 5 minutes signals a problem.

**Pattern:** Add `(~30 seconds)` or `(~2-5 minutes)` after the step instruction where meaningful.

---

### Check 8: Credentials and access verified

**Test:** Does the runbook assume access that not every on-call engineer has?

**Violations to find:**
- "Open the production dataset" without specifying the access mechanism.
- "Read the embeddings API key" without specifying where it lives.
- Commands that require a VPN but don't mention it.

**Correction:** Add to Prerequisites: `Access requirements: [VPN connected / dataset read token / embeddings API key in 1Password vault "Engineering/Hivemind-Prod"]`.

---

### Check 9: Security check (secrets hygiene)

**Test:** Does the runbook contain hardcoded secrets, API keys, or passwords?

**Violations:** Any literal value that looks like a credential (`sk-...`, `sk_live_...`, an inline API token).

**Correction:** Replace with a reference to the secret store: `$(op read "op://Engineering/Hivemind-Prod/embeddings-api-key")`

**Source:** SRE School quality attribute #9 (security-aware). See `research/external/2026-02-15-sreschool-runbook-definition-maturity.md`.

---

## Violation scoring

After completing all 9 checks, tally:

| Severity | Check numbers | Action if any found |
|---|---|---|
| **Critical (blocks READY)** | 1, 2, 3, 4, 9 | Must fix before marking ready |
| **High (blocks READY)** | 5, 6, 8 | Must fix before marking ready |
| **Medium (should fix)** | 7 | Fix in same PR; note in audit log |

A runbook with any Critical or High violations cannot be marked READY FOR PRODUCTION. See `guides/07-done-checklist.md`.

---

## Quick cheat sheet

Paste this as a comment at the top of the runbook while auditing:

```markdown
<!-- AUDIT IN PROGRESS
Check 1: Copy-paste commands [ ]
Check 2: Absolute URLs [ ]
Check 3: Env vars defined [ ]
Check 4: Decision points explicit [ ]
Check 5: References linked [ ]
Check 6: Expected output per command [ ]
Check 7: Time estimates [ ]
Check 8: Access requirements stated [ ]
Check 9: No hardcoded secrets [ ]
Audited by: @name on YYYY-MM-DD
-->
```

Remove this comment when all checks pass.
