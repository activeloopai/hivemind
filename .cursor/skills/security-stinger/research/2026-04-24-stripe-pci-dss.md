# Stripe + PCI DSS - Elements / Checkout vs. Raw Card Handling

**Sources:**
- https://docs.stripe.com/security/guide
- https://stripe.com/docs/security
- https://stripe.com/guides/pci-compliance
- https://stripe.com/resources/more/pci-attestation-requirements-and-process
- https://cside.com/blog/can-you-use-stripe-for-pci-dss

**Retrieved:** 2026-04-24
**Query used:** "Stripe PCI DSS compliance Elements SAQ A vs raw card server"

## Summary

PCI DSS compliance effort depends on whether raw cardholder data ever touches your server.

- **Stripe Elements / Checkout / Payment Element:** card data is entered into a Stripe-hosted iframe; your server only ever sees a token (`pm_*`, `tok_*`, `pi_*`). You qualify for **SAQ A** (or SAQ A-EP) - ~22 self-assessed controls, no external vuln scan.
- **Raw card data touching your server** (any field named `cardNumber`, `cvv`, `cvc`, `exp_month`, `exp_year` in request bodies, logs, databases, or analytics): you become an **SAQ D** merchant - ~300 controls, external ASV scans, quarterly penetration testing, mandatory annual on-site assessment for high volume.

This is the single biggest cost-of-compliance swing in the payments stack. Auditors treat any raw-PAN touch as SAQ D automatically.

## Key quotations

> "When using Stripe Elements or Stripe Checkout, card data goes directly to Stripe's servers and your backend only ever receives tokens, which qualifies you for SAQ-A or SAQ-A-EP depending on implementation."

> "PCI SAQ A requires that the merchant does not store any cardholder data in electronic format - storing the PAN would push you up to PCI SAQ D compliance."

## Webhook signing

Stripe webhooks MUST be verified with `stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)`. Without verification, any attacker can POST a fake `checkout.session.completed` event and trigger entitlement grants server-side.

## Relevance to this stinger

- `guides/04-pii-and-financial.md` C5 is now explicitly labeled **Critical (PCI DSS violation - SAQ D escalation)** for any raw card touch. The severity rationale goes into `examples/critical-pci-violation.md`.
- `guides/05-remediation-playbooks.md` includes the canonical fix: migrate to Payment Element / PaymentIntents, delete card columns, rotate keys.
- `scripts/scan.sh` greps for `cardNumber`, `cvv`, `cvc` in request bodies and DB schema files.
