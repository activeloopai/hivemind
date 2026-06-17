# PRD-006e: Open Decisions

> **Status:** Backlog
> **Priority:** P1
> **Effort:** S (decisions, not code)
> **Schema changes:** None
> **Parent:** [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)

---

## Overview

The decisions that gate the Desktop Memory Harness, modeled on rflectr's open-
decisions PRD. Each one is recorded with options and a recommendation. The first two
are hard gates: nothing is built for an app until they are resolved. The rest shape
the build but do not block the Phase 0 spike.

---

## D1 - Pinning and proxy support (HARD GATE)

Does each app, on each OS, honor a proxy and refrain from pinning its provider
certificate against a user-trusted CA?

- [ ] (a) Run the Phase 0 spike, record per app per OS, build only where green **[recommended]**
- [ ] (b) Assume Electron honors the system proxy and does not pin, and build
- [ ] (c) Skip the proxy transport and ship MCP-only for Claude Desktop

**Recommendation: (a).** This is the entire feasibility question and it is cheap to
measure. rflectr's discipline applies: derive behavior from observing the real app,
not from assumption. Option (b) risks building a transport an app silently rejects.
Option (c) abandons the deterministic guarantees that justify the project before we
know we have to. Outcome feeds the tables in
[`../../../knowledge/private/integrations/desktop-app-interception.md`](../../../knowledge/private/integrations/desktop-app-interception.md).

---

## D2 - Provider terms posture (HARD GATE)

What is the terms-of-service position on a local tool that intercepts and stores the
content of a user's own Claude Desktop and ChatGPT Desktop traffic, with consent?

- [ ] (a) Get a written position from each provider before public release **[recommended]**
- [ ] (b) Rely on "user's own data on their own machine with consent" and ship
- [ ] (c) Limit to capture only (no injection) to reduce exposure, pending review

**Recommendation: (a).** rflectr's posture is to get the sanction in writing rather
than infer it. This harness reads private model traffic, so the bar is at least as
high. (b) may well be defensible but should not be assumed. (c) is a reasonable
interim if a full position is slow. Owner: Mario plus legal.

---

## D3 - Injection acceptability and attribution

Is modifying the outbound request to add retrieved memory acceptable, and should
injected content be visible to the user in the app, or only present in the request?

- [ ] (a) Inject, and attribute injected memory so it is identifiable **[recommended]**
- [ ] (b) Inject silently, no attribution
- [ ] (c) Do not inject into the request; surface recall some other way (separate UI)

**Recommendation: (a).** Injection is the whole point of deterministic recall, and
attribution keeps it honest and debuggable. (b) is simplest but opaque. (c) preserves
the request untouched but loses the seamless "memory is already in scope" property
and needs a surface the desktop apps do not give us. Depends partly on D2.

---

## D4 - Proxy scope: per-app vs system-wide

On each OS, can we route only the target app through the proxy, or must we set a
system-wide proxy?

- [ ] (a) Per-app scope where the OS/app allows it, system proxy only as fallback **[recommended]**
- [ ] (b) System-wide proxy always, rely on the allowlist to limit exposure
- [ ] (c) Per-app only; if an app needs system proxy, scope it out

**Recommendation: (a).** Narrowest scope that works keeps the harness out of
unrelated traffic. The egress allowlist still bounds exposure when only a system
proxy is available, so (b) is an acceptable fallback, not the default. Determined per
OS during Phase 0.

---

## D5 - OS-firewall hardening (compensating control)

rflectr had a kernel-level NetworkPolicy as Layer 1. On a laptop there is no
container. Do we add an optional local-firewall rule scoping the harness process to
the allowlist?

- [ ] (a) Ship in-process allowlist only for v1; document optional firewall hardening **[recommended]**
- [ ] (b) Require an OS firewall rule as part of install
- [ ] (c) No second layer, ever

**Recommendation: (a).** The in-process dispatcher is the primary control and is
enough for v1; a documented optional firewall rule lets security-conscious users add
the second layer without making install heavier for everyone. (b) raises install
friction and may need elevation. (c) forgoes defense in depth unnecessarily.

---

## D6 - Inference routing (explicitly deferred)

rflectr re-routes model calls through a gateway. Should the desktop harness ever do
the same (for caching, cost, or policy), or stay a pure memory layer?

- [ ] (a) Stay a pure memory layer; forward to the app's real provider untouched **[recommended]**
- [ ] (b) Add optional gateway routing later as a separate feature
- [ ] (c) Route from day one

**Recommendation: (a).** Routing changes the trust and terms story significantly and
is not needed for memory. Keep this harness about capture and recall. (b) can revisit
once memory ships and there is a concrete reason. (c) is out of scope.

---

## D7 - ChatGPT Desktop fallback if it pins

If Phase 0 shows ChatGPT Desktop pins (and so has no proxy path and no reliable MCP
capture surface), what happens?

- [ ] (a) Scope ChatGPT Desktop out for v1; ship Claude Desktop; revisit **[recommended]**
- [ ] (b) Hold the whole harness until both apps are supported
- [ ] (c) Pursue a non-proxy capture surface for ChatGPT specifically

**Recommendation: (a).** Do not let one app block the other. If Claude Desktop is
green, ship it and document ChatGPT as pending. (b) wastes a working path. (c) is a
research bet that should not gate v1.

---

## Related

- [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)
- [`../../../knowledge/private/integrations/desktop-app-interception.md`](../../../knowledge/private/integrations/desktop-app-interception.md): where D1 is resolved.
- [`../../../knowledge/private/security/desktop-egress-and-trust.md`](../../../knowledge/private/security/desktop-egress-and-trust.md): where D2, D3, D5 are grounded.
