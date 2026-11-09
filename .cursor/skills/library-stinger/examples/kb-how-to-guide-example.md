# How to log in with the device flow

> Category: How-to Guide | Version: 1.0 | Date: June 2026 | Status: Active

Step-by-step runbook for authenticating the Hivemind CLI against the Deep Lake API using the browser device flow, switching orgs and workspaces, and verifying your session. Covers the common case; see `src/commands/auth.ts` for the full implementation.

**Related:**
- `src/commands/auth.ts` - device flow + credential persistence
- `src/commands/auth-login.ts` - CLI dispatch
- `src/commands/install-id.ts` - machine-stable install ID

---

## Prerequisites

- Node installed and the Hivemind CLI built (`npm run build`) or installed.
- Network access to `https://api.deeplake.ai`.
- A browser on the same machine (the flow opens one automatically; you can also copy the URL).

## Log in

### Step 1 - Start the device flow

```bash
hivemind login
```

This calls `deviceFlowLogin`, which requests a device code from the API and either opens your browser to `verification_uri_complete` or prints:

```
Open this URL: https://api.deeplake.ai/device?code=ABCD-1234
Or visit https://api.deeplake.ai/device and enter code: ABCD-1234
```

### Step 2 - Approve in the browser

Approve the request in the browser. The CLI polls `pollForToken(device_code)` until the API returns a token. The polling key is derived from a machine-stable install ID (see `src/commands/install-id.ts`), not the per-attempt `device_code`, so a retry never breaks the flow.

### Step 3 - Credentials are persisted

On success the CLI exchanges the device grant for a long-lived API token and saves it via `saveCredentials`. Subsequent commands read it through `loadCredentials`; the stored `apiUrl` defaults to `https://api.deeplake.ai`.

## Verify your session

```bash
hivemind whoami
```

Prints the current user, org, and workspace. If you see `Not logged in. Run: hivemind login`, the credentials file is missing or unreadable.

## Switch org or workspace

```bash
hivemind org list
hivemind org switch <id>

hivemind workspace list
hivemind workspace switch <id>
```

Org/workspace selection is bound into the saved credentials, so it persists across commands until you switch again.

## Log out

```bash
hivemind logout
```

Removes the stored credentials via `deleteCredentials`. The next command will require a fresh `hivemind login`.

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `Device flow unavailable: HTTP <code>` | API unreachable or device endpoint down | Check network and `apiUrl`; retry |
| Browser does not open | No default browser or headless host | Copy the printed `verification_uri` and `user_code` manually |
| `whoami` shows wrong org | Stale org binding | `hivemind org switch <id>` |
| Polling never completes | Approval not finished in the browser | Re-approve, or re-run `hivemind login` |

## Related code

- `src/commands/auth.ts` - `deviceFlowLogin`, `pollForToken`, credential helpers.
- `src/commands/auth-login.ts` - subcommand dispatch shared with the unified CLI.
- `src/commands/install-id.ts` - install ID used as the polling key.

## Changelog

- v1.0 (2026-06) - Initial version.
