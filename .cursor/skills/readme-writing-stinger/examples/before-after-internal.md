# Before/After: Internal Tool README

> Demonstrates: `guides/03-oss-vs-internal.md`, `guides/01-structure-checklist.md`

A worked before/after example showing how `readme-writing-worker-bee` applies the internal register to a team tool README.

---

## BEFORE (submitted by user)

```markdown
# data-sync-worker

This is a data synchronization worker service. It was built to sync data between our
production Deep Lake dataset and the downstream search index. It runs on the
infra-prod-2 cluster.

## Getting Started

Clone the repo:

```bash
git clone git@github.com:org/data-sync-worker.git
cd data-sync-worker
npm install
```

Copy the env file:

```bash
cp .env.example .env
```

You'll need to fill in the dataset and index credentials. Ask your manager for the values.

## Running

```bash
npm start
```

## Contact

Talk to the platform team if something breaks.
```

---

## Audit table (Step 2 output)

| Section | Status | Notes |
|---|---|---|
| What problem this solves | ⚠️ warn | Buried in first paragraph; not its own section |
| Who maintains this | ❌ fail | "Talk to the platform team", no name, no Slack channel |
| Where it runs | ⚠️ warn | "infra-prod-2 cluster" but no environment breakdown |
| Setup / install | ⚠️ warn | Credentials: "ask your manager", where exactly? Which 1Password vault? |
| Usage | ❌ fail | `npm start` is not enough; what does it do? How do I know it's working? |
| Architecture notes |, | Absent; unusual design choices not documented |

**Overall:** Reader cannot get to "running" without human help. The credential setup is a blocker.

---

## AFTER (readme-writing-worker-bee output)

```markdown
# data-sync-worker

Syncs the production Deep Lake dataset to the downstream search index on a 15-minute cron schedule. Runs in
the `infra-prod` namespace across all three environments (dev / staging / prod).

**Owner:** Platform team, `#platform-eng` on Slack  
**On-call escalation:** PagerDuty → "Platform On-Call" rotation

---

## Where it runs

| Environment | Cluster | Namespace | Dashboard |
|---|---|---|---|
| dev | infra-dev-1 | data-sync | [Grafana (dev)](https://grafana.internal/d/datasync-dev) |
| staging | infra-staging-1 | data-sync | [Grafana (staging)](https://grafana.internal/d/datasync-staging) |
| prod | infra-prod-2 | data-sync | [Grafana (prod)](https://grafana.internal/d/datasync-prod) |

---

## Setup

**Prerequisites:** Node.js 20+, access to `1Password > Platform > data-sync-worker`

```bash
git clone git@github.com:org/data-sync-worker.git
cd data-sync-worker
npm install
cp .env.example .env
```

Fill in `.env` from the `data-sync-worker` item in **1Password > Platform** vault.  
Required keys: `DATASET_PATH`, `DATASET_TOKEN`, `SEARCH_INDEX_URL`, `SEARCH_INDEX_KEY`.

---

## Running locally

```bash
npm start
# Connects to the dev dataset and dev search index by default (.env defaults point to dev)
# Logs: "Sync complete: 1,234 rows synced in 2.3s" on success
```

To run a one-off sync against a specific table:

```bash
TABLE=users npm run sync:once
# => Syncing table: users... Done (45 rows)
```

---

## Known failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `DATASET_AUTH_ERROR` on startup | Token expired | Re-run `npm run auth:refresh` |
| Sync stalls at > 5 min | Dataset read lag | Check `#db-alerts` for dataset warnings |
| "0 rows synced" | Watermark stuck | Run `npm run reset:watermark -- --table=<tablename>` |

---

## Architecture

The worker uses a watermark-based incremental sync: for each table, it reads the `updated_at` value of the last synced row and fetches only rows updated after that timestamp. The watermark is stored in a small local state file at `.hivemind/data-sync/watermark-<table>.json`.

This means: full re-syncs are rare and expensive, do not run `npm run sync:full` in production without alerting `#platform-eng` first.

---

## Contributing

Changes go through PR → review by 1 platform team member → merge. Run `npm test` before opening a PR. Integration tests require `INTEGRATION=true` in `.env`.
```

---

## What changed

| Change | Principle |
|---|---|
| Renamed intro to "what it does + who owns it" | Internal register: context first, not pitch |
| Added owner + on-call escalation prominently | The most critical missing piece, "talk to the platform team" is not actionable |
| Added environments table with dashboard links | Teammates need operational context, not marketing |
| Specified credential location (1Password vault) | Broke the "ask your manager" blocker |
| Added expected log output for `npm start` | "How do I know it's working?" is the #1 internal tool question |
| Added known failure modes table | Operational knowledge that lives nowhere else |
| Added architecture note about watermark | Documents the unusual design decision that trips up new contributors |
