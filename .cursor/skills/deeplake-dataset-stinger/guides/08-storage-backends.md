# 08 - Storage Backends (BYOC)

Deep Lake datasets are bring-your-own-cloud. The same dataset can live on Activeloop-managed storage, your own object store, or local / in-memory. deeplake-dataset-worker-bee picks the backend and the credential model; `security-worker-bee` audits the secrets.

Source: `research/2026-06-16-storage-backends-creds.md`.

## The backends

| URI scheme | Backend | When |
|---|---|---|
| `al://org/dataset` | Activeloop-managed | Default - managed storage, no infra to run |
| `s3://bucket/path` | AWS S3 | Data must stay in your AWS account / region |
| `gcs://bucket/path` | Google Cloud Storage | GCP-native deployments |
| `azure://container/path` | Azure Blob Storage | Azure-native deployments |
| `file:///path` | Local filesystem | Single-node dev, tests, offline work |
| `mem://name` | In-memory | Ephemeral - unit tests, throwaway fixtures |

## The choice tree

Ask, in order:

1. **Ephemeral / test fixture?** -> `mem://` (gone when the process exits) or `file://` (persists on disk for a dev loop).
2. **Data residency or compliance requires your own cloud account?** -> `s3://` / `gcs://` / `azure://` matching your cloud.
3. **No infra constraint, want managed?** -> `al://` (Activeloop-managed) is the default.

## Credentials - raw creds vs `creds_key`

A BYOC backend (`s3://` / `gcs://` / `azure://`) needs credentials. Two ways to supply them:

| Model | What | When |
|---|---|---|
| **Raw cloud creds** | Pass the access key / secret / token directly | Quick start, single environment, short-lived |
| **`creds_key`** | A named, server-side credential reference | Production - rotate centrally, never ship secrets in config |

**Prefer `creds_key` in production.** Raw creds in config or env get copied, logged, and leaked; a `creds_key` is an indirection that lets the credential rotate without touching the dataset reference. A BYOC backend wired with raw creds where a `creds_key` would rotate cleanly is a should-refactor finding. The actual secret handling (storage, rotation, scope) is `security-worker-bee`'s audit - deeplake-dataset-worker-bee picks the model and surfaces the choice.

## Backend choice by deployment

| Deployment | First choice | Notes |
|---|---|---|
| Local dev loop | `file://` | Persists across runs; no network |
| Unit / integration tests | `mem://` | Fast, isolated, nothing to clean up |
| Managed production, no residency constraint | `al://` | Least infra; Activeloop runs storage |
| AWS-native, data must stay in account | `s3://` + `creds_key` | Residency satisfied; creds rotate |
| GCP-native | `gcs://` + `creds_key` | Same shape on GCS |
| Azure-native | `azure://` + `creds_key` | Same shape on Azure Blob |

## Feature notes to surface

- **`mem://`** does not persist - never point production or anything you need to keep at it.
- **`file://`** is single-node; it does not share across machines.
- **BYOC** (`s3` / `gcs` / `azure`) keeps data in your account, but you own the bucket lifecycle, region, and access policy - surface this to the user.
- **`creds_key`** is the production credential model; raw creds are for quick starts only.

## Output

For storage-choice invocations, fill in `examples/storage-backend-choice-walkthrough.md` with the deployment mapped to the matrix above. Recommend a primary backend and credential model with 2-3 cited reasons, and state what `security-worker-bee` should audit on the credentials.

## Cross-references

- `04-versioning-branches.md` - the versioned dataset lives on the backend you pick here.
- `07-no-orm-columndef.md` - the table is created `USING deeplake` regardless of backend.
- `examples/storage-backend-choice-walkthrough.md` - fill-in template.
- Hand creds / `creds_key` audit to `security-worker-bee`.
