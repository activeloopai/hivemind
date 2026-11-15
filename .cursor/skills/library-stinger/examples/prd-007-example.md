<!--
Schema v2 paths on disk:

Index (this file):
  library/requirements/backlog/prd-007-user-data-export/prd-007-user-data-export-index.md

Sub-feature PRDs alongside the index:
  library/requirements/backlog/prd-007-user-data-export/prd-007a-user-data-export-backend.md
  library/requirements/backlog/prd-007-user-data-export/prd-007b-user-data-export-ui.md

With optional ClickUp suffix (index file only, not the folder):
  library/requirements/backlog/prd-007-user-data-export/prd-007-user-data-export-index-ck-86b9cwdef.md

QA report (authored by quality-worker-bee):
  library/requirements/backlog/prd-007-user-data-export/qa/prd-007-user-data-export-qa.md

Lifecycle moves:
  backlog/ -> in-work/ -> completed/   (entire prd-007-user-data-export/ folder moves)
-->

# PRD-007: User data export

> **Status:** Backlog
> **Priority:** P2
> **Effort:** M (3-8h)
> **Schema changes:** Additive - one new table, one new column
> **ClickUp:** [86b9cwdef](https://app.clickup.com/t/86b9cwdef) *(if applicable)*

---

## Overview

Let authenticated users export all of their personal data (profile fields, preferences, activity log, consent records) as a signed download delivered by email. Primarily a GDPR / CCPA compliance feature; also useful for users migrating away. **This index covers the module scope.** Sub-feature PRDs cover the backend export service and the UI separately.

---

## Goals

- A user can request a complete export of their data from the account settings page.
- The export is generated asynchronously and delivered by email within 5 minutes for typical account sizes.
- The download link is signed and expires after 24 hours.
- One export request per user per 24 hours is enforced.

## Non-Goals

- Selective export (specific data types only) - full export only in v1.
- Admin-initiated export on behalf of a user - separate compliance tooling.
- Real-time streaming delivery.

---

## Sub-features

| Sub-PRD | Scope | Status |
|---|---|---|
| [`prd-007a-user-data-export-backend`](./prd-007a-user-data-export-backend.md) | API endpoint, background worker, object store upload, email delivery | Draft |
| [`prd-007b-user-data-export-ui`](./prd-007b-user-data-export-ui.md) | Settings page trigger, status indicator, download confirmation page | Draft |

---

## Acceptance criteria (module-level)

| ID | Criterion |
|---|---|
| AC-1 | A logged-in user can trigger a data export from their account settings page. |
| AC-2 | The user receives an email with a signed download link within 5 minutes of requesting. |
| AC-3 | The download link expires after 24 hours and returns `410 Gone` when accessed after expiry. |
| AC-4 | A second export request within 24 hours is rejected with a clear message and the time until the next request is allowed. |
| AC-5 | The export contains all personal data fields specified in the data retention policy. |

---

## Data model changes

New table `export_requests`:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK |
| `user_id` | `uuid FK users.id` | One-to-many |
| `status` | `enum` | `pending`, `processing`, `ready`, `expired`, `failed` |
| `download_url` | `text nullable` | Signed URL, set when ready |
| `expires_at` | `timestamptz` | 24h from creation |
| `requested_at` | `timestamptz` | Request time |

---

## Related

- [`library/knowledge/private/data/data-retention-policy.md`](../../knowledge/private/data/data-retention-policy.md) - defines which fields are included.
- [`library/knowledge/private/architecture/ADR-019-audit-logging.md`](../../knowledge/private/architecture/ADR-019-audit-logging.md) - export events must be audit-logged.
- [`ird-038-gdpr-right-to-access`](../../issues/completed/ird-038-gdpr-right-to-access/ird-038-gdpr-right-to-access-index.md) - the issue that drove this feature.
