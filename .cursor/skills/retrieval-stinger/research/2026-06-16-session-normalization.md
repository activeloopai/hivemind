# Session Normalization - JSONB dialogue to grep-able turns

**Source:** `src/shell/grep-core.ts` (`normalizeSessionContent`).
**Retrieved:** 2026-06-16
**Status:** LOAD-BEARING. Without it, session recall returns 5KB blobs instead of the matching turn.

---

## TL;DR

`sessions.message` is a JSONB turn array, not plain text. Before line-wise regex refinement,
`normalizeSessionContent` serializes it to multi-line "Speaker: text" so the standard grep
refinement surfaces only the matching turn(s), not the whole session blob.

---

## Key facts

- `sessions.message` holds the dialogue as JSONB (a turn array). A raw row can be ~5KB.
- `normalizeSessionContent` flattens turns to lines like `user: ...` / `assistant: ...`.
- This runs only for rows whose path is a session; `memory.summary` rows are already plain text
  and pass through untouched.
- If parsing fails or the path isn't a session, it falls back to the raw content.
- The normalization happens BEFORE `refineGrepMatches`, so the regex flags (ignore-case,
  word-match, invert, fixed-string) apply per turn.

---

## Why it matters

- Without normalization, a regex match anywhere in the JSON blob would surface the entire blob -
  unreadable and useless for recall. The flattening is what makes session recall point at the
  one turn that matched.
- It also means the lexical (`ILIKE`) branch matches against the serialized text in a way that
  lines up with what the user sees.

---

## Implications for the guides

- Any guide describing session recall must mention this step, or readers will expect raw-row output.
- The "Speaker: text" shape is the canonical session-recall display format.

---

## Caveats

- Semantic ranking uses `message_embedding` (the whole session's vector), while the displayed,
  refined output is per-turn. So a session can rank high semantically and then surface the single
  turn that matches the regex - those are two different granularities by design.
