# POST /api/users/me/export

> Category: API | Version: 1.0 | Date: May 2026 | Status: Active

Enqueues a background job that gathers all of the authenticated user's profile data and emails them a signed download URL. One export per user per 24 hours.

**Related:**
- [prd-feature-007-user-profile-export.md](../../requirements/completed/prd-007-user-profile-export/prd-007-user-profile-export-index.md) - spec
- `api/src/routes/user-export.ts` - handler
- `api/src/workers/user-export-worker.ts` - worker

---

## Endpoint

```
POST /api/users/me/export
```

## Authentication

- Bearer token required (see [authentication-flow.md](../architecture/authentication-flow.md)).
- No additional role or scope required - any authenticated user may request their own data.

## Request

### Headers

```
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Body

```json
{
  "format": "json"
}
```

### Schema

```ts
z.object({
  format: z.enum(['json', 'csv']),
})
```

## Responses

### 202 Accepted

Successful enqueue. The job is not complete; the user will receive an email within ~2 minutes.

```json
{
  "exportRequestId": "a1b2c3d4-5e6f-7890-abcd-ef1234567890",
  "status": "queued"
}
```

### 400 Bad Request

Validation failed.

```json
{
  "code": "invalid_format",
  "message": "format must be 'json' or 'csv'"
}
```

### 401 Unauthorized

Missing or invalid bearer token. Standard response from the auth middleware.

### 429 Too Many Requests

The user has requested an export in the last 24 hours.

```json
{
  "code": "rate_limited",
  "retryAfterSeconds": 47321
}
```

Also sets `Retry-After: <seconds>` header.

### 500 Internal Server Error

Queue unavailable or other server error.

```json
{
  "code": "internal_error",
  "message": "Please try again later."
}
```

## Example

### cURL

```bash
curl -X POST https://api.example.com/api/users/me/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format":"json"}'
```

### TypeScript fetch

```ts
const res = await fetch('/api/users/me/export', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ format: 'json' }),
});

if (res.status === 202) {
  const { exportRequestId } = await res.json();
  // poll GET /api/users/me/export/:id or wait for email
} else if (res.status === 429) {
  const { retryAfterSeconds } = await res.json();
  // show "Available again in Nh"
}
```

## Side effects

- A new row is inserted into `export_request` with `status = 'queued'`.
- A `user-export` job is enqueued on `pg-boss`.
- Nothing user-visible changes until the worker completes (~2 minutes) and emails the signed URL.

## Rate limiting

One export per user per rolling 24-hour window. Counted by `COUNT(*)` on `export_request` where `user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`. See [feature-007](../../requirements/completed/prd-007-user-profile-export/prd-007-user-profile-export-index.md) for the full spec.

## Observability

- Every request logs `{ requestId, userId, format, outcome }`.
- Failures in the worker emit to Sentry with `tags: { component: 'user-export-worker' }`.

## Related endpoints

- [GET /api/users/me/export/:id](get-user-export-by-id.md) - status poll for a specific request.

## Changelog

- v1.0 (2026-05) - Initial version shipped with feature-007.
