# PRD-006a: Local Interception Proxy

> **Status:** Backlog
> **Priority:** P1
> **Effort:** L (1-3d)
> **Schema changes:** None
> **Parent:** [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)

---

## Overview

This sub-feature is the transport. It is the local process that gets Hivemind into
the data path between a desktop chat app and its model provider, the way rflectr's
loopback listener gets into the path of the Cursor SDK. It binds a forward proxy on
`127.0.0.1`, terminates TLS for the app's provider connection using a per-install
CA, streams the response back to the app unchanged, and enforces the deny-by-default
egress allowlist on everything it forwards. It does not parse chat content or touch
Deeplake; that is 006b and 006c. Its only job is to be a correct, fast, safe pipe
that the rest of the harness can observe.

The value is a single, app-agnostic interception point. Once this pipe exists and is
trusted by the OS, the capture and recall logic attaches to it without caring which
app is on the other end.

---

## Why this matters

rflectr proved that the cleanest place for a memory and control layer is the data
path, and that the path must never add latency to the user's stream. The desktop
apps will not hand us that path through a hook, so we build it as a proxy. Getting
this layer wrong shows up immediately as stalled chats or a broken TLS handshake, so
it has to be boring and correct before anything is layered on it.

---

## Goals

- Bind a forward proxy on `127.0.0.1` at an ephemeral port, then write the assigned
  port to a known file (rflectr's port-file pattern) so the installer and health
  check can find it.
- Terminate TLS for intercepted hosts using a per-install CA, generating per-host
  leaf certs on the fly (CrabTrap's model).
- Stream responses back to the app in real time, never buffering a full response
  before forwarding. Tee a copy to a consumer interface that 006b/006c attach to.
- Enforce the egress allowlist on every forwarded connection using rflectr's
  allowlist-dispatcher pattern, installed before any dispatcher-caching import.
- Forward non-chat hosts (auth, telemetry) byte-for-byte without TLS termination
  where possible, or terminate-and-forward without parsing where the app funnels
  everything through one connection.
- Expose a clean shutdown that drains in-flight streams, mirroring rflectr's
  `SIGTERM` drain.

## Non-Goals

- **Parsing chat payloads.** Wire-format adapters live in
  [`prd-006b-capture-lifecycle`](./prd-006b-capture-lifecycle.md).
- **Querying or writing Deeplake.** That is 006b (write) and
  [`prd-006c-recall-and-hooks`](./prd-006c-recall-and-hooks.md) (read).
- **Installing the proxy setting or trusting the CA in the OS.** The proxy knows its
  port and owns its CA material; wiring the OS to use them is
  [`prd-006d-installer-health-consent`](./prd-006d-installer-health-consent.md).
- **Defeating certificate pinning.** If Phase 0 shows an app pins, this proxy does
  not try to bypass it.

---

## Functional requirements

1. **Loopback bind + port file.** Bind `127.0.0.1:0`, read `address().port`, write it
   to the harness runtime dir. Re-bind cleanly on restart without port collisions.
2. **Per-install CA.** On first run, generate a CA key/cert unique to this install,
   store the key at `0600` next to Hivemind credentials, and hand the public cert to
   006d for OS trust. Never reuse a CA across installs or machines.
3. **On-the-fly leaf certs.** For each intercepted host, mint and cache a leaf cert
   signed by the install CA. Bounded cache, like CrabTrap's cert cache.
4. **Streaming pass-through.** Forward request to provider, stream response chunks to
   the app as they arrive, and simultaneously emit each chunk to the teed consumer.
   No full-response buffering on the app path.
5. **Egress allowlist.** Install the allowlist dispatcher as the first executable
   statement at startup. Allow only the app's provider host(s) and `api.deeplake.ai`.
   Loopback always allowed. Deny + log everything else as `egress.leak_attempt`.
6. **Pass-through mode.** When capture is disabled, the teed consumer is a no-op and
   the proxy is a plain forwarder.
7. **Drain on shutdown.** On `SIGTERM`/stop, stop accepting new connections, let
   in-flight streams finish within a bounded window, then exit.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given the proxy starts, when it binds, then it writes its actual port to the runtime port file and a health probe on that port returns OK. |
| AC-2 | Given an app routes a provider request through the proxy and the CA is trusted, when the provider streams a response, then the app receives every chunk in order and in real time, with no full-response buffering. |
| AC-3 | Given any forwarded connection, when its destination host is not the provider or `api.deeplake.ai`, then the connection is denied and an `egress.leak_attempt` record is emitted. |
| AC-4 | Given capture is disabled, when traffic flows, then the proxy forwards it unchanged and the teed consumer receives nothing. |
| AC-5 | Given the proxy receives a stop signal, when in-flight streams exist, then it drains them within the bounded window before exiting and refuses new connections immediately. |
| AC-6 | Given the install CA, when the proxy mints a leaf cert for an intercepted host, then the cert validates against the install CA and is cached and reused for subsequent connections to that host. |

---

## Implementation notes

- Reuse rflectr's `AllowlistDispatcher` design verbatim: extend undici's `Agent`,
  override `dispatch`, allow loopback, look up host+port in a compile-time allowlist,
  deny-and-log otherwise, idempotent install guard. The "must be first import" lint
  rule applies here too.
- The proxy is a separate process from the memory worker (PRD-006 Section 5 of the
  overview). The teed consumer is an IPC or in-process queue boundary, chosen so the
  worker can crash and restart without touching the proxy.
- Leaf-cert generation and the cert cache follow CrabTrap's per-host generation
  model; do not ship a wildcard cert.

---

## Related

- [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)
- [`prd-006b-capture-lifecycle`](./prd-006b-capture-lifecycle.md): the teed consumer that builds traces.
- [`prd-006d-installer-health-consent`](./prd-006d-installer-health-consent.md): OS proxy + CA trust wiring.
- [`../../../knowledge/private/integrations/desktop-app-interception.md`](../../../knowledge/private/integrations/desktop-app-interception.md): proxy/CA per OS, streaming, pinning.
- [`../../../knowledge/private/security/desktop-egress-and-trust.md`](../../../knowledge/private/security/desktop-egress-and-trust.md): egress contract and CA custody.
