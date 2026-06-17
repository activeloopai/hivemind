# Desktop Harness Egress and Trust

> Category: Security | Version: 1.0 | Date: June 2026 | Status: Draft

For security reviewers and harness engineers: the trust boundary the desktop
harness introduces, the deny-by-default egress contract carried over from rflectr,
secret custody for the harness CA and Deeplake credentials, and the privacy and
terms posture of reading a user's own Claude and ChatGPT traffic on their own
machine. The harness intercepts a user's private model traffic, so the security
story has to be legible, not buried.

**Related:**
- [`../architecture/desktop-harness-overview.md`](../architecture/desktop-harness-overview.md)
- [`../integrations/desktop-app-interception.md`](../integrations/desktop-app-interception.md)
- [`./credential-storage.md`](./credential-storage.md)
- [`./trust-boundaries.md`](./trust-boundaries.md)
- [`../../../requirements/backlog/prd-006-desktop-memory-harness/prd-006d-installer-health-consent.md`](../../../requirements/backlog/prd-006-desktop-memory-harness/prd-006d-installer-health-consent.md)

---

## Section 1 - What changes when we add a MITM proxy

Every other Hivemind harness reads data the host already hands it through a hook.
The desktop harness is different in kind: it terminates TLS on the user's own
connection to Anthropic or OpenAI and reads the plaintext. That is a real trust
boundary shift and it deserves to be named plainly.

The harness becomes a process on the user's machine that can see:

- The full text of their prompts to Claude and ChatGPT.
- The full text of the model's responses.
- Whatever else rides those connections (auth tokens, cookies, headers).

This is the same trust profile as CrabTrap, which is explicit that "the proxy sees
all request content in cleartext, including Authorization and Cookie headers; this
is by design, the trust boundary is the proxy itself." We adopt the same honesty.
The mitigations below exist to make that boundary safe and provable, not to pretend
it is not there.

---

## Section 2 - The egress contract (carried from rflectr)

rflectr's hardest requirement was "nothing phones home unless we allow it." The
desktop harness inherits a tightened version:

> The harness only ever sends data to the model provider the app was already
> talking to, and to Deeplake. Nothing else. The user can see the allowlist and
> can see a log of anything that tried to leave it.

Concretely:

| Destination | Allowed | Why |
|---|---|---|
| The app's existing model provider (`api.anthropic.com`, ChatGPT backend) | Yes | The harness forwards the app's own traffic there; it was already going there |
| `api.deeplake.ai` | Yes | Where captured memory is written and recalled from |
| Anything else | No | Denied and logged as a leak attempt |

This is enforced in-process with rflectr's allowlist-dispatcher pattern: an undici
dispatcher installed as the first statement at startup, before any import can cache
the global dispatcher, denying any outbound host not on the allowlist and emitting a
structured `egress.leak_attempt` record on deny. The allowlist is a compile-time
constant with no runtime extension path. See rflectr's `egress-model.md` for the
dispatcher mechanics this reuses.

What is different from rflectr: there is **no container and no Kubernetes
NetworkPolicy**. This is a user's laptop, not a per-session container. Layer 1
(kernel-level egress) is therefore not available by default. The in-process
dispatcher is the primary control. An optional hardening path (a local OS firewall
rule scoping the harness process) is recorded as an open decision, not a
requirement.

---

## Section 3 - The harness should not read what it does not need

Because the proxy can see everything on the connection, the design must narrow what
it actually touches:

1. **Scope the proxy as tightly as the OS allows.** Prefer per-app proxying over a
   machine-wide proxy so the harness is not in the path of unrelated traffic. If
   only a system proxy works, the allowlist still ensures only provider and Deeplake
   hosts are ever forwarded, and everything else is denied rather than inspected and
   relayed.
2. **Only parse the chat endpoints.** Auth, telemetry, and refresh calls are
   forwarded byte-for-byte without parsing. The capture adapter only reads the
   completion request and response bodies it needs to build a trace.
3. **Never log secrets.** Authorization headers, cookies, and tokens are never
   written to harness logs, never embedded in a trace, and never sent to Deeplake.
   This is the same rule as the rest of Hivemind's credential handling; see
   [`./credential-storage.md`](./credential-storage.md).
4. **Honor capture-off instantly.** `HIVEMIND_CAPTURE=false` (and a desktop UI
   toggle) must put the proxy into pure pass-through: forward everything, parse
   nothing, write nothing.

---

## Section 4 - Secret custody

| Secret | Where it lives | Who can read it |
|---|---|---|
| Harness CA private key (per install) | OS keychain / user cert store entry plus a `0600` file beside Hivemind credentials; never synced, never uploaded | The harness process and the local user only |
| Deeplake API token | Existing Hivemind credential store (`~/.deeplake/credentials.json`, mode `0600`, or OS keychain) | The harness process and the local user only |
| The user's provider tokens (Anthropic/OpenAI) seen in transit | Never persisted; forwarded as part of the untouched request | Transit only; not stored, not logged |

The CA is generated per install and is unique to that machine. There is no shared
CA across users and no Hivemind-controlled root. If the user uninstalls, the CA is
removed from the trust store and the key file is deleted. Compromise of one user's
CA affects only that user's machine, and only while it is installed and trusted.

---

## Section 5 - Privacy and terms posture

This is a user running a tool on their own machine to read their own conversations
and build their own (and their team's) memory. That framing matters, and so do its
limits. The following are open items for legal and security review before any
public release, recorded here and tracked in
[`prd-006e-open-decisions`](../../../requirements/backlog/prd-006-desktop-memory-harness/prd-006e-open-decisions.md):

1. **Provider terms.** Intercepting and storing the content of Claude Desktop and
   ChatGPT Desktop traffic, even locally and even one's own, should be checked
   against each provider's terms of service before shipping. rflectr's posture is
   the model: get the position in writing, do not assume.
2. **Injection into the provider request.** Adding retrieved memory to the outbound
   prompt modifies what the provider receives. Confirm this is acceptable and decide
   whether injected content is visibly attributed to Hivemind in the app UI or only
   present in the request.
3. **Team sharing of captured content.** Hivemind's value is cross-device and team
   memory, which means one user's captured Claude/ChatGPT content can surface in a
   teammate's recall. The consent flow must make that explicit, and workspace
   scoping must be enforced exactly as it is for the existing harnesses; see
   [`../multi-tenant/org-workspace-model.md`](../multi-tenant/org-workspace-model.md).
4. **Consent at install.** Installing a trusted root CA and a proxy that reads
   private model traffic must be a clear, explicit, revocable opt-in, explained in
   plain language. No silent install, no dark-pattern default-on.

---

## Section 6 - Leak-attempt logging

The harness reuses rflectr's leak-attempt record. Any outbound host not on the
allowlist produces a structured event the user (and, if they opt in, their admin)
can inspect:

```json
{
  "event": "egress.leak_attempt",
  "ts": "2026-06-16T18:32:11.123Z",
  "harness": "desktop",
  "app": "claude-desktop",
  "destination": { "host": "<denied-host>", "port": 443 }
}
```

This is what makes the egress contract provable rather than asserted. The user can
point at the log and see that the harness only ever talked to their provider and to
Deeplake.

---

## Section 7 - Failure-mode contract

Same spine as rflectr: the security and memory layers failing must never break the
user's chat.

| Failure | Behavior | User-visible effect |
|---|---|---|
| Deeplake unreachable | Recall returns nothing within the timeout; capture is queued or dropped per policy | Chat works normally, no memory injected |
| Memory worker crashes | Proxy keeps forwarding in pass-through | Chat works normally, capture paused |
| Proxy crashes | Restart; until then the app's connection may fail and the user retries | Brief "reconnecting" until proxy is back, or the app falls back to a direct connection if the proxy setting is cleared |
| Allowlist would block the provider host | Never happens by construction (provider host is on the allowlist); if misconfigured, the chat fails loudly rather than silently relaying elsewhere | Clear error, not a silent redirect |
