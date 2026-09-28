# Deep Lake Storage Backends (BYOC) & Credentials

**Sources:**
- Activeloop Deep Lake docs - dataset storage URIs, `creds_key`, BYOC backends
- Hivemind deployment configuration review

**Retrieved:** 2026-06-16

## Summary

Deep Lake datasets are bring-your-own-cloud. The same dataset can live on Activeloop-managed storage, your own object store, the local filesystem, or in memory. deeplake-dataset-worker-bee picks the backend and the credential model; `security-worker-bee` audits the secrets.

## The backends

| URI scheme | Backend | When |
|---|---|---|
| `al://org/dataset` | Activeloop-managed | default - managed, no infra to run |
| `s3://bucket/path` | AWS S3 | data must stay in your AWS account / region |
| `gcs://bucket/path` | Google Cloud Storage | GCP-native deployments |
| `azure://container/path` | Azure Blob Storage | Azure-native deployments |
| `file:///path` | local filesystem | single-node dev, offline work |
| `mem://name` | in-memory | ephemeral - unit tests, fixtures |

## Credentials - raw creds vs `creds_key`

A BYOC backend (`s3://` / `gcs://` / `azure://`) needs credentials. Two models:

| Model | What | When |
|---|---|---|
| Raw cloud creds | access key / secret / token passed directly | quick start, single environment |
| `creds_key` | a named, server-side credential reference | production - rotate centrally, no secret in config |

**`creds_key` is the production model.** Raw creds in config or env get copied, logged, and leaked; a `creds_key` is an indirection that lets the credential rotate without touching the dataset reference. A BYOC backend wired with raw creds where a `creds_key` would rotate cleanly is a should-refactor finding. The actual secret storage, scope, and rotation are `security-worker-bee`'s audit.

## Choice by deployment

| Deployment | Backend | Credential model |
|---|---|---|
| Unit / integration tests | `mem://` | none |
| Local dev loop | `file://` | none |
| Managed prod, no residency constraint | `al://` | managed |
| Cloud-native, residency required | `s3://` / `gcs://` / `azure://` | `creds_key` |

## Gotchas

- `mem://` does not persist - never point production at it.
- `file://` is single-node - it does not share across the agent fleet.
- BYOC keeps data in your account, but you own the bucket lifecycle, region, and access policy.

## Relevance to this stinger

Spine of `guides/08-storage-backends.md` and `examples/storage-backend-choice-walkthrough.md`. Feeds the storage-choice ADR shape.
