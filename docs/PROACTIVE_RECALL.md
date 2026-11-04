# Proactive team recall (local, no embeddings)

Reactive recall only helps when the agent thinks to search team memory, and
it never knows that a teammate already hit the same problem. Proactive recall
closes that gap in Claude Code:

- **On a failed command** (`PostToolUseFailure`, Bash and MCP tools): the
  error text is distilled and looked up against teammates' session summaries.
  On a confident match, the agent gets one attributed pointer: *"<teammate>
  hit this <when> in <project>: <their fix>"*.
- **On a substantive prompt** (`UserPromptSubmit`): same lookup with a
  stricter bar. Acknowledgements and short follow-ups are skipped.

## How it works

```
SessionStart (detached worker)   memory table ──read-only, incremental──▶ ~/.deeplake/recall-cache/…/index.json
PostToolUseFailure / prompt      error text / prompt ──local BM25──▶ inject teammate pointer (or log, in shadow mode)
```

- **No backend work on the hot path.** The hooks read only the local index.
  The backend sees one read-only page query per session start, throttled to
  once per 15 minutes per machine, which normally returns zero rows.
- **Freshness during the day.** A teammate's summary is rewritten while their
  session is still running: first after 10 events, then every 50 events or
  2 hours, and again at session end. On your side, the cache refreshes at
  session start and again during a long session: the async capture hook
  starts the sync worker once the cache is older than 15 minutes. A
  teammate's fix therefore typically reaches your agent within minutes to a
  couple of hours, without anyone restarting a session. (With
  `HIVEMIND_CAPTURE=false` the capture hook exits early, so the cache only
  refreshes at session start.)
- **No schema change, no embeddings.** The sync reads only existing text
  columns (`path, author, project, description, summary, last_update_date`),
  so it works on any existing table, including rows that never got an
  embedding.
- **Teammates only.** Your own summaries are filtered out on the server side.
- **Relevance gate.** A summary must share at least 3 query terms, cover at
  least 45% of the query's idf weight, contain a rare term, and share at
  least 2 adjacent word pairs (the phrase check). Prompts use stricter values.
  At most 5 injections per session, and never the same summary twice.
- **Better summaries going forward.** New session summaries carry an
  `## Errors & Fixes` section, and failed tool calls are now captured with
  their error text, so future summaries match much better than old ones.

## Modes

Each trigger is `off`, `shadow` or `on`. In `shadow`, the lookup runs and
is logged to `~/.deeplake/recall-events.jsonl`, but nothing is injected.

Defaults: the **failure trigger is on**, so a fresh install gets the benefit
with no setup. The **prompt trigger is shadow**, because prompts are noisier.

```bash
hivemind recall mode on --prompt     # also inject on substantive prompts
hivemind recall mode shadow          # log-only for both triggers
hivemind recall mode off             # disable entirely
```

Environment overrides, which win over the saved mode:
`HIVEMIND_PROACTIVE_RECALL=off|shadow|on`, `HIVEMIND_RECALL_FAILURE=…`,
`HIVEMIND_RECALL_PROMPT=…`, `HIVEMIND_PROACTIVE_RECALL_DISABLED=1`.

## Commands

| Command | What it does |
|---|---|
| `hivemind recall status` | Mode, cache location, number of cached summaries, last sync |
| `hivemind recall sync [--full]` | Pull new or changed teammate summaries now (the first sync pulls everything) |
| `hivemind recall search "<text>" [--error] [--prompt]` | Rank cached summaries against the text and show the gate verdict and the would-be injection |
| `hivemind recall stats [--days N]` | Funnel counts (`injected`, `shadow`, `below`, `none`, …) and recent hits |
| `hivemind recall clear` | Delete the local cache for the current org and workspace |

## Tuning knobs

| Variable | Default | Meaning |
|---|---|---|
| `HIVEMIND_RECALL_SYNC_INTERVAL_MIN` | 15 | Minimum minutes between background syncs |
| `HIVEMIND_RECALL_FAILURE_MIN_COVERAGE` | 0.45 | Failure trigger: idf-weighted query coverage |
| `HIVEMIND_RECALL_FAILURE_MIN_MATCHED` | 3 | Failure trigger: distinct shared terms |
| `HIVEMIND_RECALL_FAILURE_MIN_PHRASES` | 2 | Failure trigger: shared adjacent word pairs |
| `HIVEMIND_RECALL_PROMPT_MIN_COVERAGE` | 0.55 | Prompt trigger: coverage |
| `HIVEMIND_RECALL_PROMPT_MIN_MATCHED` | 4 | Prompt trigger: shared terms |
| `HIVEMIND_RECALL_PROMPT_MIN_PHRASES` | 2 | Prompt trigger: shared word pairs |
| `HIVEMIND_RECALL_MAX_RAREST_DF` | 0.05 | The rarest shared term must appear in at most this share of summaries |

## Privacy

The cache stores condensed teammates' summaries on local disk, at
`~/.deeplake/recall-cache/<org>/<workspace>/<table>/` with files mode 0600.
Every org member can already read these through the memory mount; the local
copy is new. Delete it with `hivemind recall clear`.
