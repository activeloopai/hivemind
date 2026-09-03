<!--
Path on disk:
  library/requirements/features/feature-007-user-profile-export/prd-feature-007-user-profile-export.md

Because this PRD is tied to a ClickUp task (see frontmatter below), the file could
alternatively be named:
  library/requirements/features/feature-007-user-profile-export/prd-feature-007-user-profile-export-ck-86b9cwdef.md

The folder name (`feature-007-user-profile-export/`) never includes the ClickUp suffix -
only the main file does. The folder also contains a sibling `reports/` subfolder
where `quality-worker-bee` writes audit reports as `<date>-qa-report.md`.
-->

# Feature #7: User profile export (self-service)

> **ExampleApp** - Feature PRD #007 of N
>
> **Status:** Ready for implementation
> **Priority:** P2
> **Effort:** M (3-8h)
> **Schema changes:** Additive (one column, one table)
> **ClickUp task:** [86b9cwdef](https://app.clickup.com/t/86b9cwdef)

---

## Phase Overview

### Goals

Let authenticated users export all of their personal profile data (identity fields, preferences, activity log, consents) as a JSON or CSV file delivered by email. Primarily a GDPR / CCPA compliance feature but also useful for users migrating to other services. This PRD covers the backend export service only; the UI and admin audit log are separate PRDs.

### Scope

- API endpoint `POST /api/users/me/export` that enqueues an export job.
- Background worker that gathers user data, produces JSON + CSV, uploads to a signed-URL object store, and emails the user.
- A new `ExportRequest` table tracking one row per request.
- A one-export-per-24-hour rate limit per user (enforced server-side).

### Out of scope

- User-facing UI button and progress indicator - see `feature-008-export-ui/prd-feature-008-export-ui.md`.
- Admin audit log of export requests - see `feature-009-export-audit-log/prd-feature-009-export-audit-log.md`.
- Export of data not owned by the requesting user (support staff export on behalf of users).

### Dependencies

- **Blocks:** `feature-008-export-ui/prd-feature-008-export-ui.md`, `feature-009-export-audit-log/prd-feature-009-export-audit-log.md`
- **Blocked by:** none
- **External:** S3-compatible object store (env `EXPORT_BUCKET`), transactional email provider (env `SMTP_URL`), background queue (`pg-boss` already installed).

---

## User Stories

### US-7.1 - Request an export

**As a** signed-in user, **I want to** request a copy of my profile data, **so that** I have a portable record for my own records or to move to another service.

**Acceptance criteria:**
- AC-7.1.1 Given I am signed in, when I `POST /api/users/me/export` with `{format: "json"}`, then the API returns `202 Accepted` with `{exportRequestId: string, status: "queued"}`.
- AC-7.1.2 Given I have already requested an export in the last 24 hours, when I submit again, then the API returns `429 Too Many Requests` with `code: "rate_limited"`.
- AC-7.1.3 Given `format` is not `json` or `csv`, when I submit, then the API returns `400 Bad Request` with `code: "invalid_format"`.

### US-7.2 - Receive the export by email

**As a** user who requested an export, **I want to** receive a download link by email, **so that** I can fetch my data without needing to keep the browser tab open.

**Acceptance criteria:**
- AC-7.2.1 Given an export job completes, when the email is sent, then the email body contains a signed URL valid for 24 hours.
- AC-7.2.2 Given the signed URL is used before expiry, when the user clicks it, then the file downloads with `Content-Type: application/json` or `text/csv` and `Content-Disposition: attachment; filename="profile-export-<requestId>.<ext>"`.
- AC-7.2.3 Given the signed URL has expired, when the user clicks it, then they see the object store's default expiry page.

---

## Data Model Changes

| Model | Change | Type | Nullable | Default | Index |
|---|---|---|---|---|---|
| `ExportRequest` (new) | `id` | `UUID` (PK) | no | `gen_random_uuid()` | primary |
| | `userId` | `UUID` (FK → `User.id`) | no | - | index |
| | `format` | `enum('json', 'csv')` | no | - | no |
| | `status` | `enum('queued', 'running', 'complete', 'failed')` | no | `'queued'` | index |
| | `createdAt` | `timestamptz` | no | `now()` | index (composite with userId) |
| | `completedAt` | `timestamptz` | yes | null | no |
| | `downloadUrl` | `text` | yes | null | no |
| | `errorMessage` | `text` | yes | null | no |

**Migration:** `add_export_request_table` - additive, no data backfill, no downtime.

---

## API / Endpoint Specs

### POST /api/users/me/export

**Auth:** bearer token. No role requirement beyond `authenticated`.

**Request:**

```json
{ "format": "json" }
```

Validation (Zod):

```ts
const RequestSchema = z.object({
  format: z.enum(['json', 'csv']),
});
```

**Response `202 Accepted`:**

```json
{
  "exportRequestId": "a1b2c3d4-...",
  "status": "queued"
}
```

**Errors:**
- `400` `{ code: "invalid_format" }` - Zod validation failed.
- `401` - missing or invalid token (handled by auth middleware).
- `429` `{ code: "rate_limited", retryAfterSeconds: <N> }` - another export in the last 24h.
- `500` `{ code: "internal_error" }` - queue unavailable.

### GET /api/users/me/export/:id

**Auth:** bearer token. User may only read their own export requests.

Returns the `ExportRequest` row (excluding `downloadUrl`; that goes via email only).

---

## UI/UX Description

N/A for this PRD. See `feature-008-export-ui/prd-feature-008-export-ui.md`.

---

## Technical Considerations

- **Worker:** one `pg-boss` job type `user-export`. Concurrency limit 4 to avoid overwhelming the email provider.
- **Rate limit:** enforced by SQL query `SELECT COUNT(*) FROM export_request WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`. No Redis needed.
- **File generation:** stream to a `Readable`, pipe to the object store SDK's upload stream to avoid holding the full file in memory.
- **Signed URL TTL:** 24 hours, matching email expectations.
- **PII:** exported file is the user's own data; no new surface area.
- **Backwards compat:** none (new feature).

---

## Files Touched

### New files
- `api/src/routes/user-export.ts` - endpoint handler
- `api/src/workers/user-export-worker.ts` - pg-boss worker
- `api/src/services/user-export-service.ts` - data-gathering + file-building
- `api/tests/routes/user-export.spec.ts`
- `api/tests/workers/user-export-worker.spec.ts`
- `db/migrations/<timestamp>_add_export_request_table.sql`

### Modified files
- `api/src/index.ts` - register the new route + worker on boot
- `api/src/lib/config.ts` - add `EXPORT_BUCKET`, `EXPORT_URL_TTL_HOURS` (default 24)

---

## Test Plan

- Unit: `user-export-service.spec.ts` - covers data-gathering correctness for JSON + CSV formats.
- Route: `user-export.spec.ts` - covers AC-7.1.1, 7.1.2, 7.1.3.
- Worker: `user-export-worker.spec.ts` - covers AC-7.2.1 (uses mocked S3 + email adapters).
- Manual: trigger one end-to-end export in staging, confirm email + file contents.

---

## Risks and Open Questions

- **Risk:** large accounts (thousands of activity log rows) could exceed the worker's memory budget. **Mitigation:** streaming everywhere, with a smoke test on a large fixture.
- **Risk:** email provider throttling. **Mitigation:** worker concurrency ≤ 4; backoff on 429 from provider.
- **Open question:** should we gzip the file? Deferred until we have size data from real users.

---

## Related

- [`feature-008-export-ui/prd-feature-008-export-ui.md`](../feature-008-export-ui/prd-feature-008-export-ui.md) - depends on this.
- [`feature-009-export-audit-log/prd-feature-009-export-audit-log.md`](../feature-009-export-audit-log/prd-feature-009-export-audit-log.md) - depends on this; adds admin visibility.
- [`knowledge-base/architecture/user-data-model.md`](../../../knowledge-base/architecture/user-data-model.md) - canonical list of fields that belong in the export.
