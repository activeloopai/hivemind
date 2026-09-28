# Worked Example - Storage Backend Choice Walkthrough

A full storage-backend choice walkthrough for a Hivemind deployment. Source: `guides/08-storage-backends.md`, `research/2026-06-16-storage-backends-creds.md`.

---

## Context

- **Product:** Hivemind - Activeloop Deep Lake shared memory for a fleet of coding agents.
- **Team:** small platform team, AWS-native infra.
- **Persistence:** the 7-table Deep Lake dataset (memory, sessions, skills, rules, goals, kpis, codebase).
- **Constraint:** customer code chunks land in `codebase` - legal requires the data stays in the company's own AWS account, in `us-east-1`.
- **Environments:** local dev loop, CI test suite, and shared production.
- **Credential posture:** secrets must rotate centrally; no raw keys in config.

## Walking the choice tree

From `guides/08-storage-backends.md`:

1. **Ephemeral / test fixture?**
   - CI test suite: yes -> `mem://` (fast, isolated, nothing to clean up).
   - Local dev loop: wants persistence across runs -> `file://`.
2. **Data residency / compliance requires your own cloud account?**
   - Production: yes - code must stay in the company AWS account, `us-east-1`. -> `s3://`.
3. **No infra constraint, want managed?**
   - Not applicable to production here (residency wins). `al://` would have been the default otherwise.

## The decision per environment

| Environment | Backend | Credential model | Why |
|---|---|---|---|
| CI tests | `mem://hivemind-test` | none | Ephemeral; gone when the process exits |
| Local dev | `file:///var/hivemind/dev` | none | Persists across runs; no network |
| Production | `s3://acme-hivemind/datasets` | `creds_key` | Residency in own AWS account; central rotation |

## The credential trade-off (production)

Production is BYOC (`s3://`), so it needs credentials. Two ways:

| Model | Pros | Cons |
|---|---|---|
| Raw cloud creds | Quick to wire | Secrets copied into config, logged, leaked; manual rotation |
| `creds_key` | Central rotation; no secret in the dataset reference | One-time setup of the named credential |

**Recommendation: `creds_key`.** A named credential reference rotates without touching the dataset URI, and the secret never ships in app config. Raw creds here would be a should-refactor finding (`guides/08-storage-backends.md`). The actual secret storage, scope, and rotation cadence are `security-worker-bee`'s audit.

## Not chosen

- **`al://` (Activeloop-managed)** - would be the default with no residency constraint, but production data must stay in the company AWS account.
- **`gcs://` / `azure://`** - team is AWS-native; no reason to cross clouds.
- **`mem://` for production** - never; it does not persist.
- **`file://` for production** - single-node; does not share across the agent fleet.

## Sign-off

Decision: **`s3://acme-hivemind/datasets` with a `creds_key`** for production; `file://` for local dev; `mem://` for CI. Revisit if:

- Residency requirements relax (then `al://` simplifies ops).
- The fleet goes multi-region (then revisit bucket region / replication).

## What `security-worker-bee` should audit

- The `creds_key` credential: scope (least privilege on the bucket), rotation cadence, where the underlying secret lives.
- Bucket access policy and encryption-at-rest on `s3://acme-hivemind`.

## References

- `guides/08-storage-backends.md`.
- `research/2026-06-16-storage-backends-creds.md`.
- `templates/ADR.md` - wrap this walkthrough as an ADR for the team to ratify.

---

*Forged 2026-06-16.*
