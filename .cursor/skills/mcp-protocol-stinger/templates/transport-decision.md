# Transport Decision Template

Use this to choose (or audit) the MCP transport for a server, and to diagnose stdio hygiene problems.

---

## Step 1: stdio or HTTP?

| Question | If YES |
|---|---|
| Does the server run locally, same machine as the agent? | lean stdio |
| Per-user local credentials (e.g. `~/.deeplake/credentials.json`)? | lean stdio |
| Does the client spawn and own the process (`command: node .../bundle/...`)? | stdio |
| Must multiple users share ONE network endpoint? | HTTP (Streamable HTTP + SSE) |
| Must the server outlive any single client / stream long-running progress remotely? | HTTP |
| Can the harness only reach tools over HTTP (cannot spawn subprocesses)? | HTTP |

Hivemind = local + per-user creds + client-spawned => **stdio** (`StdioServerTransport`). Switching to HTTP is a transport-change decision: escalate, do not do it silently (credentials move to per-request auth = `security-worker-bee`).

---

## Step 2: stdio hygiene (the common defects)

| Check | Why it matters |
|---|---|
| Nothing writes to stdout except the transport | stdout carries the JSON-RPC frame stream; a stray `console.log` corrupts the protocol |
| All logs / fatal output go to stderr | `process.stderr.write(...)` is correct; stdout is reserved |
| Uncaught/fatal path exits non-zero AND logs to stderr | the client sees the process die, not a hung pipe |
| `server.connect(transport)` called exactly once | no double-connect |
| No port opened / no network dependency | stdio is process-local |

---

## Step 3: HTTP hygiene (only if HTTP)

| Check | Why |
|---|---|
| Per-request authentication (no shared local creds file) | multi-tenant identity |
| SSE used only for server-to-client streaming notifications | keep request/response on POST |
| Session lifecycle handled (server can outlive clients) | reconnects, clean teardown |

(Auth specifics for the HTTP case hand off to `security-worker-bee`.)
