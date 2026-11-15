# Research Summary: harness-integration-stinger

- **Bee:** harness-integration-worker-bee
- **Depth tier consumed:** normal
- **Retrieval date:** 2026-06-16
- **Files written:** 10 (research-plan.md, index.md, research-summary.md, plus 7 source files in `external/`)
- **Primary source of truth:** the Hivemind repo itself, cross-checked against each host's integration docs

---

## Five most influential sources

### 1. `external/2026-06-16-architecture-build.md`
**Why it matters:** Establishes the shared-core (`src/`) + per-agent installer (`src/cli/install-*.ts`) + per-agent build output (`harnesses/<agent>/`) model and the tsc + esbuild pipeline. Everything in `guides/00-architecture-and-wiring.md` derives from it, including the hard rule that bundle paths resolve from the host's own root variable (`${CLAUDE_PLUGIN_ROOT}`, `~/.<host>/hivemind/bundle/`). Without this, the stinger has no foundation.

### 2. `external/2026-06-16-hook-lifecycle.md`
**Why it matters:** The hooks are how Hivemind captures activity and injects recall on the four hooks-based hosts. Documents Claude Code's 7-event set (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, SessionEnd), the per-event timeouts, the `async: true` dispatch for capture, and the fail-open discipline. These are the top adapter failure modes (blocking the critical path, crashing the host) and must be prominent in `guides/02-hook-lifecycle.md`.

### 3. `external/2026-06-16-tool-contract.md`
**Why it matters:** Hivemind is shared memory, so the `hivemind_search`/`read`/`index` (+ OpenClaw `goal_add`/`kpi_add`) tools must be byte-identical across all six adapters or cross-harness recall silently diverges. Sourced from `openclaw.plugin.json` (`contracts.tools`/`contracts.commands`) and `src/mcp/server.ts`. This is the spine of `guides/03-tool-contract.md` and a Critical Directive.

### 4. `external/2026-06-16-capability-detection.md`
**Why it matters:** `hivemind install` auto-detects each assistant by probing its home dir/binary on every run. The directive that detection be cheap and side-effect free comes from `install-scan.ts` and the per-host installers. The idempotency patterns (upsert config keys, replace marker blocks, filter-then-readd hooks via `isHivemindHook`) make re-install safe. Feeds `guides/01-capability-detection-install.md`.

### 5. `external/2026-06-16-openclaw-clawhub.md`
**Why it matters:** OpenClaw distributes through ClawHub, whose static scanner rejects bare `spawn`/`execFileSync`. Hivemind needs subprocess access, so it routes through `createRequire`-based indirection (documented in `src/skillify/gate-runner.ts` comments) and validates with `scripts/audit-openclaw-bundle.mjs`. This is a real, non-obvious gate and a Critical Directive in `guides/06-distribution-and-audit.md`.

---

## Open questions for the user to resolve (not for stinger-forge to invent)

1. **Exact Cursor hook event names (1.7+):** The Cursor adapter wires 6 lifecycle events to `~/.cursor/hooks.json`. Confirm the precise event names against the installed Cursor version, as Cursor's hook API is newer and naming has shifted across point releases.

2. **Codex PreToolUse matcher scope:** Codex's PreToolUse matcher is Bash-only. Confirm whether later Codex releases broaden the matcher to non-Bash tools, which would change what pre-tool state the Codex adapter can capture.

3. **Hermes config.yaml schema stability:** The `mcp_servers:` and `hooks:` keys in `~/.hermes/config.yaml` are the registration points. Confirm the schema against the installed Hermes version before authoring installer changes.

4. **ClawHub forbidden-pattern list:** The audit guards against bare `spawn`/`execFileSync`. Confirm whether ClawHub's scanner has added other forbidden primitives since 2026-06-16 by re-running `scripts/audit-openclaw-bundle.mjs` against the current scanner rules.

5. **pi extension API surface:** pi ships raw `.ts` and compiles at load. Confirm the `registerTool` signature and load path against the installed pi version, as the extension API is the least documented of the six.

---

## Sources to re-check at forge time

- `src/cli/install-*.ts` - re-read each installer; detection probes and config keys are the authoritative wiring spec.
- `harnesses/claude-code/hooks/hooks.json` - the canonical event/timeout/async reference.
- `harnesses/openclaw/openclaw.plugin.json` - the contracted tools/commands source of truth.
- `src/skillify/gate-runner.ts` + `scripts/audit-openclaw-bundle.mjs` - the ClawHub bypass and audit.
