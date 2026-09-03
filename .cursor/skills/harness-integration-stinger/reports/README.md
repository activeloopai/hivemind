# Reports

This folder collects past audit outputs produced by `harness-integration-worker-bee`. Each report is a dated markdown file named `YYYY-MM-DD-<context>.md`.

A typical report includes:
- **Scenario classified:** new harness adapter / hook event addition / capability-detection fix / MCP registration / native extension change / OpenClaw ClawHub audit / cross-host contract drift.
- **Surfaces reviewed:** which harness adapters and wiring mechanisms were examined.
- **Findings:** numbered list of issues found, each with severity (Critical / High / Medium / Low), a description, and the relevant guide reference.
- **Recommendations:** concrete next steps for each finding.
- **Handoffs:** items routed to peer Bees (`deeplake-dataset-stinger`, `embeddings-runtime-stinger`, `mcp-protocol-stinger`, `ci-release-stinger`).

No reports yet. Reports accumulate here over time as `harness-integration-worker-bee` completes sessions.
