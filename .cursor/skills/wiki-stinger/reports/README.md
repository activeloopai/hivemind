# Reports - wiki-stinger

This folder collects past scan-report exemplars and the response-payload schema.

## What lives here

- **Schema reference:** the structured response-payload JSON schema (canonical version in `guides/10-response-payload.md` once written).
- **Past scan-report exemplars:** real `meta/<YYYY-MM-DD>-contradiction-report.md` and `meta/<YYYY-MM-DD>-lint-report.md` files from prior runs against real repos. Useful as exemplars when wiki-worker-bee needs to mirror tone and structure.

## What does NOT live here

- The actual contradiction reports for any specific repo - those live at the codebase-graph knowledge area's `meta/` folder inside that repo.
- Lint reports for any specific repo - same.

This folder is a template/exemplar archive shipped with the stinger, not a working store.

**Status:** populated as wiki-worker-bee runs and generates real reports. Tracked alongside `ex