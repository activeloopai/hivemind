# Credential Storage

> Category: Security | Version: 1.0 | Date: June 2026 | Status: Active

Documents where Hivemind stores credentials on disk, the file-system permissions enforced on every write, the shape of the credentials object, and the three file-IO helpers that own all access to the credentials file.

**Related:**
- [`trust-boundaries.md`](trust-boundaries.md)
- [`../auth/auth-architecture.md`](../auth/auth-architecture.md)
- [`../multi-tenant/org-workspace-model.md`](../multi-tenant/org-workspace-model.md)
- [`../architecture/system-overview.md`](../architecture/system-overview.md)
- [`../operations/cli-command-architecture.md`](../operations/cli-command-architecture.md)
- [`../overview.md`](../overview.md)

---

## Why this exists

Credentials (access token, org identity, workspace selection) must persist across processes and restarts without relying on a running daemon. A single JSON file under the user's home directory satisfies this requirement and is the conventional pattern for developer tools on all three supported platforms (macOS, Linux, Windows).

No keychain, secret manager, or OS credential store is used. The security model relies entirely on file-system permissions: only the owning user can read or write the credentials file.

---

## File Paths

Both path accessors are defined in `src/commands/auth-creds.ts` and are lazy (re-evaluated on each call, not bound at module load time):

| Name | Value | Notes |
|---|---|---|
| `configDir()` | `~/.deeplake` | Parent directory. Resolved via `homedir()` at call time. |
| `credsPath()` | `~/.deeplake/credentials.json` | Full path to the credentials file. |

The lazy evaluation is deliberate: tests can override `HOME` (via `process.env.HOME`) between test cases without needing to re-import the module. At module-load time `homedir()` would capture the value once, making `HOME` overrides invisible to subsequent calls.

---

## File-System Permissions

`saveCredentials()` enforces permissions on every write:

| Resource | Mode | Who can access |
|---|---|---|
| `~/.deeplake/` (directory) | `0700` (`rwx------`) | Owning user only |
| `~/.deeplake/credentials.json` | `0600` (`rw-------`) | Owning user only |

The directory is created with `mkdirSync({ recursive: true, mode: 0o700 })`. The `recursive: true` flag is idempotent: if the directory already exists, the call is a no-op and does NOT change the existing mode. Mode `0o700` is applied only on initial creation.

The file is written with `writeFileSync(path, json, { mode: 0o600 })`. On POSIX systems this sets the permission bits directly. On Windows, the mode parameter is silently ignored; Windows access control relies on the user profile directory being protected at the OS level.

---

## Credentials Schema

The `Credentials` interface (TypeScript source of truth in `src/commands/auth-creds.ts`):

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | `string` | yes | Long-lived org-bound JWT (365-day expiry). Bearer token for all API calls. |
| `orgId` | `string` | yes | Active organization ID. Must match `org_id` claim in `token`. |
| `orgName` | `string` | no | Human-readable org name. Used for display only (e.g. session banner). |
| `userName` | `string` | no | Display name fetched from `GET /me` at login time. |
| `workspaceId` | `string` | no | Active workspace. Defaults to `"default"` (the backend resolves the sentinel). |
| `apiUrl` | `string` | no | Base URL for the Deeplake API. Defaults to `https://api.deeplake.ai` when absent. |
| `autoupdate` | `boolean` | no | Whether the plugin self-updates on session start. Absent = `true`. |
| `savedAt` | `string` | yes | ISO 8601 timestamp written by `saveCredentials`. Used for auditing; not validated at load time. |

Example file contents:

```json
{
  "token": "eyJ...<truncated>",
  "orgId": "acme-inc",
  "orgName": "Acme Inc",
  "userName": "alice",
  "workspaceId": "default",
  "apiUrl": "https://api.deeplake.ai",
  "autoupdate": true,
  "savedAt": "2026-06-12T23:00:00.000Z"
}
```

---

## File IO Helpers

Three functions in `src/commands/auth-creds.ts` own all disk access. No other module reads or writes the credentials file directly.

### `loadCredentials(): Credentials | null`

Reads and JSON-parses `~/.deeplake/credentials.json`. Returns `null` for any failure: missing file (`ENOENT`), permission denied, or malformed JSON. Callers treat `null` as "not logged in" and prompt the user to run `hivemind login`. The anti-pattern of `existsSync` followed by `readFileSync` is deliberately avoided; it introduces a TOCTOU race and extra branches with no safety benefit.

### `saveCredentials(creds: Credentials): void`

Writes credentials to disk. Always:
1. Calls `mkdirSync(configDir(), { recursive: true, mode: 0o700 })` to ensure the directory exists.
2. Calls `writeFileSync(credsPath(), JSON.stringify({...creds, savedAt: now}, null, 2), { mode: 0o600 })`.
3. Overwrites `savedAt` with the current timestamp regardless of what was passed in.

The function never throws on success; failures (e.g. permission denied) surface as Node `fs` exceptions to the caller.

### `deleteCredentials(): boolean`

Calls `unlinkSync(credsPath())`. Returns `true` if the file was removed, `false` for any failure (file already gone, permission denied, EBUSY). The `logout` command displays "Not logged in." on `false`, not an error, because the end state (no credentials file) is identical regardless of whether the file existed.

---

## No Keychain Integration

Hivemind does not use any OS keychain or secret manager (Keychain Access on macOS, libsecret/gnome-keyring on Linux, Windows Credential Manager). The decision prioritizes cross-platform consistency and zero-dependency credential access inside bundled Node scripts: keychains require native bindings that would complicate the esbuild bundle and break in some CI environments.

The tradeoff is that `~/.deeplake/credentials.json` is readable by any process running as the same OS user. The mitigations are:

- File mode `0600` prevents other OS users from reading the file.
- The token is org-bound and carries a 365-day expiry. Rotating it is a single `hivemind login` command.
- `HIVEMIND_TOKEN` environment variable overrides the file entirely for short-lived CI contexts where no persistent credential is appropriate.

---

## Module Isolation Contract

`src/commands/auth-creds.ts` is intentionally kept free of any `fetch` calls. The module-level file header documents this: it exists so bundlers (particularly the openclaw plugin's esbuild config) can enforce per-file static-analysis rules that flag co-occurrence of `fs` reads/writes with network calls. Keeping IO and network in separate source files is an explicit architectural constraint, not an accident.
