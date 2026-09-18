# Reports

This folder accumulates MCP server / tool audit findings produced by `mcp-protocol-worker-bee`.

Each is a dated markdown file following the template at `../templates/findings-report.md`.

## Naming convention

```
YYYY-MM-DD-<scope>-mcp-audit.md
```

Example: `2026-06-16-hivemind-search-tool-mcp-audit.md`

## What an audit contains

- One-paragraph summary of overall MCP health (transport, schema, error model, contract stability)
- Severity-tagged findings (Critical / High / Medium / Informational)
- Spec section / SDK symbol / JSON-RPC code citation for each finding
- Concrete remediation steps per finding
- A contract-stability call-out for any breaking change across the harnesses
- Handoffs to `security-worker-bee` (credentials/OAuth, injection/OWASP), and `deeplake-dataset-worker-bee` (query/schema)

## Accumulation

Files accumulate over time as new audits are run. None is deleted; they form an audit trail.
