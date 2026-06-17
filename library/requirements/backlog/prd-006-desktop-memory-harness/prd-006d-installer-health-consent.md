# PRD-006d: Installer, Health, and Consent

> **Status:** Backlog
> **Priority:** P1
> **Effort:** L (1-3d)
> **Schema changes:** None
> **Parent:** [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)

---

## Overview

This sub-feature is how a user turns the desktop harness on and off, and how they
know it is working. It adds `hivemind claude-desktop install` and
`hivemind gpt-desktop install` to the unified CLI, wires the OS to use the proxy
(006a) and trust its CA, gates that wiring behind an explicit consent step, reports
health through `hivemind status`, exposes a capture toggle, and provides a clean
uninstall that removes the proxy setting and the CA. It is the desktop equivalent of
the per-agent installers Hivemind already ships, adapted for the heavier action of
installing a trusted root CA and a traffic proxy.

The value is that a significant, security-sensitive setup becomes a guided, honest,
reversible one. The user always knows what got installed, why, and how to undo it.

---

## Why this matters

Installing a trusted root CA and routing your model traffic through a local proxy is
not a casual action, and a memory tool that does it silently would deserve every bit
of distrust it got. The other harnesses wire a `hooks.json` entry; this one changes
the OS trust store. The difference in weight is exactly why consent, transparency,
and clean uninstall are their own sub-PRD and not an afterthought.

---

## Goals

- Add per-app installers to the unified CLI:
  `hivemind claude-desktop install` and `hivemind gpt-desktop install` (plus an
  `--only` path consistent with the existing installer surface), on macOS and
  Windows.
- Run a Phase-0 gate at install time: if the target app/OS is not known-good
  (honors proxy, does not pin), the installer explains the limitation and declines
  or offers the fallback rather than silently half-installing.
- Drive the OS wiring from 006a's outputs: set the proxy to the proxy's port and add
  the per-install CA to the OS trust store (login keychain on macOS, user Trusted
  Root store on Windows; no admin where avoidable).
- Gate CA + proxy install behind an explicit, plain-language consent screen that
  states what is installed, what the proxy can see, and that it is reversible.
- Extend `hivemind status` to report the desktop harness: proxy up, CA trusted,
  app routed, capture on/off, last capture time, recent leak-attempt count.
- Expose a capture toggle (`HIVEMIND_CAPTURE=false` parity plus a CLI/UI switch) that
  flips the proxy to pass-through.
- Provide `hivemind claude-desktop uninstall` / `gpt-desktop uninstall` that reverts
  the proxy setting and removes the CA, leaving the machine as it was.

## Non-Goals

- **The proxy, capture, recall internals.** Those are 006a/006b/006c. This sub-PRD
  wires and surfaces them.
- **Designing auth.** Reuses Hivemind's existing login/credential flow; see
  [`../../../knowledge/private/auth/auth-architecture.md`](../../../knowledge/private/auth/auth-architecture.md).
- **A full desktop GUI.** v1 is CLI plus minimal consent UI. A richer status surface
  can follow.
- **Auto-installing the apps themselves.** Detect-and-guide if an app is absent.

---

## Functional requirements

1. **Detection.** Detect installed Claude Desktop / ChatGPT Desktop and the OS, and
   look up the Phase-0 support status for that app/OS pair.
2. **Consent gate.** Before any trust-store or proxy change, present a consent screen
   covering: a CA will be added to your trust store, your Claude/ChatGPT traffic will
   pass through a local proxy that can read it, only the provider and Deeplake are
   ever contacted, and everything is reversible. Require explicit approval.
3. **Wiring.** On approval, set the OS/per-app proxy to 006a's port and add the
   per-install CA to the trust store. Idempotent and re-entrant, like the existing
   installers (merge, never duplicate).
4. **Health.** Extend `hivemind status` with desktop-harness rows: proxy reachable,
   CA present and trusted, app proxy setting active, capture state, last capture
   timestamp, recent leak attempts. No silent failures; each red state has an
   actionable message.
5. **Capture toggle.** A CLI/UI switch and env parity that flips pass-through without
   uninstalling.
6. **Uninstall.** Revert the proxy setting, remove the CA from the trust store,
   delete CA key material, and report the machine restored.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a known-good app/OS pair, when the user runs install and grants consent, then the proxy setting and CA trust are applied idempotently and `hivemind status` shows the desktop harness healthy. |
| AC-2 | Given the user has not granted consent, when install runs, then no trust-store or proxy change is made. |
| AC-3 | Given an app/OS pair that is not known-good (pins or ignores proxy), when install runs, then the installer explains the limitation and declines or offers the documented fallback, never a silent half-install. |
| AC-4 | Given the harness is installed, when the user runs `hivemind status`, then it reports proxy, CA, routing, capture state, last capture, and recent leak attempts, with actionable text on any red. |
| AC-5 | Given the capture toggle is set off, when the user chats, then status reflects pass-through and no capture or injection occurs. |
| AC-6 | Given the user runs uninstall, when it completes, then the proxy setting is reverted, the CA is removed from the trust store, key material is deleted, and status reports the machine restored. |
| AC-7 | Given a prior install, when install is re-run, then it converges to the same state with no duplicate proxy entries or CAs. |

---

## Implementation notes

- Mirror the existing per-agent installer structure (`src/cli/install-*.ts`) and the
  `hivemind <agent> install` command shape so the desktop installers feel native to
  the CLI.
- The consent copy is a security artifact, not marketing. It should read like the
  honest CrabTrap/rflectr posture: the proxy can see your traffic, here is exactly
  what it does with it, here is how to remove it.
- macOS keychain and Windows user Trusted Root operations should avoid requiring
  admin where the OS allows user-scope trust. Document any unavoidable elevation in
  the consent screen.

---

## Related

- [`prd-006-desktop-memory-harness-index`](./prd-006-desktop-memory-harness-index.md)
- [`prd-006a-interception-proxy`](./prd-006a-interception-proxy.md): provides the port and CA this wires.
- [`../../../knowledge/private/security/desktop-egress-and-trust.md`](../../../knowledge/private/security/desktop-egress-and-trust.md): consent, CA custody, egress proof.
- [`../../../knowledge/private/operations/cli-command-architecture.md`](../../../knowledge/private/operations/cli-command-architecture.md): the CLI this extends.
- [`../../../knowledge/private/auth/auth-architecture.md`](../../../knowledge/private/auth/auth-architecture.md): reused login/credentials.
