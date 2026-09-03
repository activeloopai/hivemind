# CLI Command Reference Template

Copy this per command. Fill every `{{placeholder}}` from `src/cli/index.ts` (the `USAGE` string and the dispatch) and the handler under `src/commands/*` or `src/cli/*`.

---

## `hivemind {{command}}`

**Usage:** `hivemind {{command}} {{[--flag <value>] ...}}`

**Purpose:** {{One or two sentences. What the command does.}}

**Flags:**

| Flag | Takes value | Default | Notes |
|---|---|---|---|
| `{{--flag}}` | {{yes \| no}} | {{default or env fallback}} | {{what it does; for `--only`, values come from `allPlatformIds()`}} |

**Side effects:** {{Be specific. Which files are written or patched, what is copied, what network calls happen. e.g. `login` writes `~/.deeplake/credentials.json`; `install` patches assistant config and copies bundles; `dashboard` writes an HTML file. "None / read-only" if it only inspects.}}

**Example:**

```bash
hivemind {{command}} {{flags}}
```

---

## Checklist for this entry

- [ ] Usage line matches the `USAGE` string in `src/cli/index.ts`.
- [ ] Every documented flag is parsed in the dispatch; every parsed flag is documented.
- [ ] `--only` values match `allPlatformIds()` (no invented platform ids).
- [ ] Side effects name the actual files/config touched.
- [ ] At least one real invocation example.
