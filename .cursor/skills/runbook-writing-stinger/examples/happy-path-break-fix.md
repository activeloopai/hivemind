# Example: Break-Fix Runbook, Embeddings Daemon Stall

> **Demonstrates:** `guides/01-runbook-types.md` (break-fix type), `guides/02-no-implied-context-audit.md`, `guides/03-escalation-path-architecture.md`, `guides/04-rollback-procedures.md`
> **Template used:** `templates/break-fix-runbook.md`
> **Research source:** `research/external/2026-03-08-incop-oncall-runbook-best-practices.md` (the postmortem-to-action-item pattern from `research/external/2026-03-29-devopsil-blameless-postmortems.md`)

This is a fully worked break-fix runbook for "Embeddings daemon stall." Use it as a model when authoring new break-fix runbooks.

---

# Embeddings Daemon Stall

**Runbook ID:** RBK-EMB-003
**Alert:** `hivemind_embeddings_queue_stalled` (fires when the embed queue depth is unchanged for > 5 minutes while items remain)
**Service:** embeddings daemon (`@deeplake/hivemind` background worker)
**Last updated:** 2026-04-15 by @sre-engineer
**Status:** TESTED

> TEST STATUS: Last tested 2026-04-15 in staging (Format: Staging Exercise)
> Tested by: @sre-engineer-name
> Game day score (runbook_accuracy): 5/5
> Gaps found: None.
> Next scheduled exercise: 2026-07-15 (Q3 game day: Security incidents)

---

## Summary

The embeddings daemon has stopped draining its queue. Items are enqueued but the embed worker is not advancing, so retrieval falls back to BM25 and new library entries never gain vectors. This is a SEV-2 incident (retrieval still works degraded; no data loss).

**Typical root causes (in order of frequency):**
1. The embeddings provider API key is expired or rate-limited (70% of cases)
2. A single oversized document wedges the worker on a retryable error loop (20% of cases)
3. The daemon process died but the lock file was not released (10% of cases)

---

## Severity

**SEV-2**, retrieval degrades to BM25 lexical ranking. No data loss. SLA clock is running on freshness, not availability.

Expected resolution time with this runbook: 15-25 minutes.

---

## Prerequisites

Set these variables before executing any step:

```
DATASET=ds_hivemind_prod        # Deep Lake dataset name
DAEMON=embeddings-daemon        # process name in the workspace
QUEUE_DIR=.hivemind/queue       # on-disk embed queue
# EMBED_API_KEY: Do not paste. Read from the secret store at run time:
#   export EMBED_API_KEY=$(op read "op://Engineering/Hivemind-Prod/embeddings-api-key")
```

Access requirements:
- Shell access to the host running the daemon
- Read access to the secret store entry `op://Engineering/Hivemind-Prod/embeddings-api-key`
- Read access to the Deep Lake dataset (for observation steps only; no schema changes in this runbook)

---

## Triage checklist

Run these before executing remediation steps:

- [ ] Confirm the alert is real: `npm run embeddings:status`
  - Expected: `{"state":"stalled","queueDepth":<N>,"lastAdvance":"<timestamp>"}`
  - If `state` is `running` and `queueDepth` is dropping, this alert may be a false positive. Check for a duplicate page.
- [ ] Confirm the daemon process is alive: `npm run embeddings:status -- --pid`
  - Expected: a live PID. If none, the process died; skip to Step 5 (Clear Stale Lock).
- [ ] Check the queue depth trend over the last 5 minutes: `npm run embeddings:status -- --history 5m`
  - Confirm: `queueDepth` is flat and non-zero.

---

## Steps

### Step 1: Identify the stuck item (~2 minutes)

```bash
# Print the head of the queue and the worker's current item
npm run embeddings:inspect -- --head 5
```

Expected: the current item and the next few queued items.
- If the head item has `retries > 5`: proceed to Step 2 (Quarantine the Item).
- If the head item looks normal: proceed to Step 4 (Check the Provider Key).

---

### Step 2: Capture the current queue state before changes (~1 minute)

```bash
# Snapshot the queue for rollback reference
cp -r "$QUEUE_DIR" "$QUEUE_DIR.bak-$(date +%s)"
echo "Backup written. Record the path printed above as QUEUE_BACKUP."
```

---

### Step 3: Quarantine the stuck item (state-changing, see rollback) (~1 minute)

```bash
# Move the wedged item out of the live queue into the dead-letter folder
npm run embeddings:quarantine -- --id <STUCK_ITEM_ID>
```

Expected output: `quarantined <STUCK_ITEM_ID> -> .hivemind/dead-letter/`.

Watch the status: `queueDepth` should begin dropping within 60 seconds.

- If the queue drains below its starting depth: monitor for 5 minutes; proceed to Step 10 (Monitor and Close).
- If the queue remains flat: proceed to Step 4 (Check the Provider Key).

---

### Step 4: Check the embeddings provider key (~3 minutes)

```bash
# Re-export the key from the secret store and probe the provider
export EMBED_API_KEY=$(op read "op://Engineering/Hivemind-Prod/embeddings-api-key")
npm run embeddings:probe
```

Expected: `provider OK, model reachable`.
- If the probe returns `401`/`403`: the key is expired or revoked. Proceed to Step 5 (Restart with Fresh Key).
- If the probe returns `429`: the provider is rate-limiting. Back off and proceed to Step 6 (Throttle and Resume).

---

### Step 5: Clear a stale lock and restart the daemon (state-changing, see rollback) (~3 minutes)

```bash
# Remove the stale lock left by a dead process, then restart
rm -f "$QUEUE_DIR/.lock"
npm run embeddings:restart
```

Expected: the daemon comes up Running within 30 seconds. `npm run embeddings:status` reports `state":"running"`.

Watch the status: `queueDepth` should begin dropping within 2 minutes.

---

### Step 6: Throttle and resume if the provider is rate-limiting (state-changing, see rollback) (~2 minutes)

```bash
# Capture the current concurrency
ORIGINAL_CONCURRENCY=$(npm run embeddings:config -- --get concurrency)
echo "ORIGINAL_CONCURRENCY=$ORIGINAL_CONCURRENCY"  # Record this!

# Lower concurrency to stay under the provider rate limit
npm run embeddings:config -- --set concurrency=2
npm run embeddings:resume
```

Expected: the daemon resumes at lower concurrency and the queue drains slowly without further `429`s.

Note: This is a temporary fix. The provider rate limit must be raised or the embed batch reshaped. Open a SEV-3 ticket after the incident is resolved.

---

### Step 10: Monitor and close (~5 minutes)

- Confirm `queueDepth` trends to 0 (or to its normal steady-state) for 5 consecutive minutes.
- Confirm retrieval is back on dense vectors: `npm run retrieval:mode` returns `embeddings`, not `bm25-fallback`.
- Notify #hivemind-incidents: "Embeddings daemon stall resolved. Root cause: [stuck item / expired key / rate limit / stale lock]. Monitoring for 5 minutes."
- If stable after 5 minutes: resolve the incident.
- If not stable: escalate per the Escalation Path section.

---

## Rollback

Only execute rollback steps for action steps you ran.

**Rollback for Step 3 (quarantined item):** Restore it from the dead-letter folder if quarantine was wrong: `npm run embeddings:requeue -- --id <STUCK_ITEM_ID>`. If the item was genuinely poison, leave it quarantined and open a ticket.

**Rollback for Step 5 (restart):** The restart is idempotent; no manual rollback needed. If the restart made things worse, restore the queue snapshot: `rm -rf "$QUEUE_DIR" && mv "$QUEUE_BACKUP" "$QUEUE_DIR"`.

**Rollback for Step 6 (throttled concurrency):**
```bash
npm run embeddings:config -- --set concurrency=$ORIGINAL_CONCURRENCY
# Verify
npm run embeddings:config -- --get concurrency
# Expected: matches ORIGINAL_CONCURRENCY
```

---

## Escalation path

**Tier 1 (you):** Exhaust the steps in this runbook.

**Tier 2 (escalate if: 15 min no progress OR suspected data corruption):**
- Team: Hivemind Platform Team
- Slack: #hivemind-oncall
- Expected response: 10 minutes

**Tier 3 (escalate if: 30 min no resolution OR SEV-1):**
- Team: Engineering Management
- Expected response: 15 minutes

**Dataset team (escalate if: the Deep Lake dataset shows schema or version corruption):**
- Slack: #deeplake-dataset
- Response time: next business day for non-data-loss issues; 1 hour for data loss

---

## Post-incident

After resolution:
1. Update the incident channel with root cause and resolution.
2. If root cause was a poison document: open a bug ticket in Linear/Jira to harden the embed worker against it.
3. If the incident was SEV-2 or worse: schedule a postmortem within 48 hours.
4. Update this runbook's Postmortem history section with the incident and any improvements discovered.

---

## Postmortem history

| Date | Incident ID | SEV | Summary | Runbook change |
|---|---|---|---|---|
| 2026-03-10 | INC-2041 | SEV-2 | Embeddings daemon stalled on an expired provider key; Step 4 was missing the secret-store re-export | Added the `op read` re-export line and a `429` vs `401` branch |

---

*Example runbook for `runbook-writing-worker-bee`. Real runbooks are stored in your team's designated runbook folder.*
