# harness-integration-stinger

The multi-harness integration playbook for `harness-integration-worker-bee`. Covers how Hivemind plugs into six coding assistants (Claude Code, Codex, Cursor, Hermes, pi, OpenClaw) through a shared core, per-agent installers, and per-agent build outputs - the wiring mechanisms (hooks, native extensions, MCP, AGENTS.md marker), capability detection and auto-install, the capture/recall hook lifecycle, the cross-host tool contract, and ClawHub bundle auditing - with research-backed, opinionated guidance on the top adapter failure modes.

See the [Command Brief](../../command-briefs/harness-