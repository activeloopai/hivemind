# Trace model / token-usage enrichment

Every captured session event (user prompt, tool call, assistant turn) is written
as one row in the `sessions` table, with the event payload in the JSONB `message`
column. On top of the base event, each row is enriched — where the agent exposes
it — with **which model** produced the turn, its **reasoning effort**, why the
turn **stopped**, full **token usage** (including cache tokens and **money
cost**), and a per-harness **`usage_extra`** bag for fields that don't generalize.

This lets "tokens/cost per model" be a plain `GROUP BY message->>'model'` query.

## Where the code lives

- Extraction / normalization: [`src/notifications/model-usage.ts`](../src/notifications/model-usage.ts)
  - `parseClaudeTurnMeta(transcriptPath)` — Claude Code
  - `parseCodexTurnMeta(transcriptPath, fallbackModel)` — Codex
  - `normalizeSdkUsage` / `sdkTurnMeta` — Pi / OpenClaw (in-process SDK message)
  - `readClaudeEffortLevel(cwd)` — Claude effort from settings
- Wiring (per harness):
  - Claude Code — `src/hooks/capture.ts` (assistant_message / Stop)
  - Codex — `src/hooks/codex/capture.ts`
  - Pi — `harnesses/pi/extension-source/hivemind.ts` (`message_end`; inlines the
    normalizer because pi ships raw `.ts` with no shared-module imports)
  - OpenClaw — `harnesses/openclaw/src/index.ts` (`agent_end` auto-capture)
  - Hermes — `src/hooks/hermes/capture.ts` (reads `extra.model` / `extra.platform`)

## Stored shape (JSONB `message`)

```jsonc
{
  // ...base event fields (session_id, type, content, timestamp, ...)
  "model": "claude-opus-4-8",
  "reasoning_effort": "medium",        // null when unset / not applicable
  "stop_reason": "end_turn",           // end_turn | tool_use | max_tokens | stop | toolUse | ...
  "token_usage": {                     // the most recent turn
    "input_tokens": 131,
    "output_tokens": 403,
    "cache_read_tokens": 357059,
    "cache_creation_tokens": 2102,
    "reasoning_output_tokens": 160,    // Codex
    "total_tokens": 216408,            // Codex / SDK
    "cost": {                          // Pi / OpenClaw — fractional dollars
      "input": 0.165, "output": 0.0001, "cache_read": 0, "cache_creation": 0, "total": 0.1651
    }
  },
  "token_usage_total": { /* ...same shape */ },  // Codex only — whole-session cumulative
  "usage_extra": { /* per-harness, see below */ }
}
```

All fields are **optional** and only present when the agent exposes them (absent
keys stay absent — never defaulted to 0/empty).

## Capture matrix (verified against real transcripts)

| Field | Claude Code | Codex | Pi | OpenClaw | Cursor | Hermes |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `model` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reasoning_effort` | ✅ (settings) | ✅ | — | — | — | — |
| `stop_reason` | ✅ | — ¹ | ✅ | ✅ | — | — |
| token: input / output | ✅ | ✅ | ✅ | ✅ | — | — |
| token: cache_read | ✅ | ✅ | ✅ | ✅ | — | — |
| token: cache_creation | ✅ | — ² | ✅ | ✅ | — | — |
| token: reasoning_output | — | ✅ | — | — | — | — |
| token: total | — ³ | ✅ | ✅ | ✅ | — | — |
| `token_usage.cost` ($) | — | — | ✅ | ✅ | — | — |
| `token_usage_total` (cumulative) | — | ✅ | — | — | — | — |
| `usage_extra` | tier / speed / cache-TTL / server_tool_use | model_context_window / rate_limits | — | — | — | platform |
| custom fields | — | — | — | — | duration / loop_count / status | — |

**Notes.** ¹ Codex emits only per-turn `status:"completed"`, not a stop reason.
² Codex has no cache-write concept. ³ Claude doesn't report a grand total in
`usage`; it isn't synthesized. Cursor's transcript has **no** token/cost data;
Hermes' hook payload carries **no** token/cost (only `model` + `platform`).

### Source of each field, per harness

| Harness | Source |
|---|---|
| Claude Code | transcript `~/.claude/projects/.../*.jsonl` (last assistant line: `message.model`, `message.usage`, `message.stop_reason`); effort from `settings.json` `effortLevel` |
| Codex | rollout `~/.codex/sessions/.../rollout-*.jsonl` (`turn_context` → model/effort; `token_count` → usage/total/quota) |
| Pi | in-process `message_end` SDK message (`model`, `stopReason`, `usage` incl. `cost`) |
| OpenClaw | in-process `agent_end` SDK message (`model`, `stopReason`, `usage` incl. `cost`) |
| Cursor | hook payload `model` (+ its own `duration`/`loop_count`/`status`) |
| Hermes | hook payload `extra.model` / `extra.platform` (NousResearch/hermes-agent `shell_hooks.py`) |

## Aggregation

```sql
-- Per-model output tokens (Claude / any agent that reports per-turn usage)
SELECT message->>'model' AS model,
       SUM((message->'token_usage'->>'output_tokens')::bigint) AS out_tokens
FROM sessions
WHERE agent = 'claude_code'
GROUP BY 1;

-- Per-model cost (Pi / OpenClaw)
SELECT message->>'model' AS model,
       SUM((message->'token_usage'->'cost'->>'total')::numeric) AS usd
FROM sessions
WHERE message->'token_usage'->'cost' IS NOT NULL
GROUP BY 1;
```

`token_usage_total` (Codex) is a **whole-session cumulative across all models**,
not per-model — roll it up as `MAX(total_tokens)` per session, not `SUM`. For
per-model Codex totals, sum the per-turn `token_usage` and dedup by `turn_id`
(a turn's tool events share one snapshot).

## Design notes

- **Best-effort.** Any read/parse failure returns null and capture proceeds
  unchanged — enrichment never blocks or breaks a trace write.
- **Tail read (perf).** The parsers read only the **file tail** (default 1 MiB)
  via a single `openTranscript()` — model/usage live in the most recent turn at
  the end of the file — so each event is ~O(1), not O(filesize) (and not O(n²)
  across a Codex session that parses on every user/tool row). If a single record
  exceeds the window, a whole-file fallback runs from the **same fd/snapshot**.
  See the file's `readWindowLines` / `openTranscript` for boundary + short-read
  handling. Residual TOCTOU (transcript rewritten between the two reads) is
  unreachable for append-only session logs.
- **Redaction guard.** Storing model ids exposed a false positive: the secret
  entropy backstop shredded long dated slugs like `claude-haiku-4-5-20251001`.
  `src/hooks/shared/redact.ts` `looksLikeSecret` exempts provider model ids
  (lowercase, segments ≤12 chars, incl. cloud-prefixed Bedrock slugs) while a
  high-entropy secret wearing a model prefix is still masked.
- **Reasoning effort for Claude** is the user's `effortLevel` setting
  (low/medium/high/xhigh), not a per-message field — read from settings at
  capture time; allowlisted so an arbitrary settings value can't poison analytics.
- **Numeric guards.** Token counts must be non-negative safe integers; cost is a
  non-negative finite number (fractional). Invalid values are dropped.

## Adding a new harness

If a runtime's transcript/payload carries model/usage, wire it the same way:
- Payload has `model` → set it on the trace meta directly.
- Transcript file with usage → add a `parse<Agent>TurnMeta`.
- In-process SDK message with `{model, usage, stopReason}` → reuse `sdkTurnMeta`.
- Anything that doesn't generalize → put it under `usage_extra`, don't fabricate.

Tests: `tests/shared/notifications-model-usage.test.ts` (extraction),
`tests/shared/redact.test.ts` (model-id guard), plus per-harness capture tests.
E2E harness: `scripts/trace-model-usage-e2e.mjs`.
