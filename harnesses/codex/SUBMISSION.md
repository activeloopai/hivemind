# Codex Plugin Directory — Submission Worksheet (hivemind)

Portal: https://platform.openai.com/plugins
Submission type: **Skills only** (no MCP server, no app).

Paste the sections below into the corresponding fields of the submission form.

---

## 1. Listing (Info tab)

| Field | Value |
|---|---|
| Plugin name | hivemind |
| Display name | Hivemind Memory |
| Short description | Persistent shared memory for AI agents powered by Deeplake |
| Category | productivity |
| Developer | Activeloop |
| Website URL | https://deeplake.ai |
| Repository | https://github.com/activeloopai/hivemind |

### TODO before submit (need your confirmation — not filled in the manifest)
- [ ] Support URL
- [ ] Privacy Policy URL
- [ ] Terms of Service URL
- [ ] License (add to `plugin.json` if you want it in the listing)
- [ ] Logo asset (square, per portal size spec)

---

## 2. Starter prompts (4-5, key workflows)

1. Recall what our team decided about the auth refactor last week.
2. Save this as a memory: we standardized on Deeplake managed tables for all capture.
3. What has been worked on in this repo recently across all sessions?
4. Search our shared memory for anything about rate limits.
5. Pick up where I left off on the branch-aware docs work.

---

## 3. Positive test cases (exactly 5)

Each includes the prompt, expected behavior, and any required test data.

1. **Cross-session recall**
   - Prompt: "What did we decide about X last week?"
   - Expected: reads `~/.deeplake/memory/index.md` / `summaries/` and returns a grounded answer citing a summary file.
   - Test data: at least one prior session summary present in the org table.

2. **Write a memory**
   - Prompt: "Remember that we use Deeplake managed tables for capture."
   - Expected: writes to the memory VFS (INSERT into the memory table); confirms the write.
   - Test data: authenticated org/workspace.

3. **Keyword search over shared memory**
   - Prompt: "Search our memory for rate limit."
   - Expected: `grep -r` over `summaries/` routed through hybrid lexical+semantic search; returns ranked matches.
   - Test data: a summary containing the term.

4. **Code-graph structural query**
   - Prompt: "What calls `sqlStr`?"
   - Expected: hivemind-graph skill queries `memory/graph/query/...`; returns callers/callees.
   - Test data: a built graph snapshot for the repo.

5. **Goal/KPI tracking**
   - Prompt: "Track a goal: ship the Codex plugin submission this month."
   - Expected: hivemind-goals skill writes to `memory/goal/`; confirms creation.
   - Test data: authenticated workspace.

---

## 4. Negative test cases (exactly 3)

1. **No credentials**
   - Prompt: "Recall our team memory" with no Deeplake auth configured.
   - Expected: safe fallback — clear message to run `hivemind login`; no crash, no fabricated recall.

2. **Empty / no matching memory**
   - Prompt: "What did we decide about <topic that was never discussed>?"
   - Expected: reports "no matching memory found" rather than inventing an answer.

3. **Disallowed interpreter on the memory mount**
   - Prompt: "Run a python script against ~/.deeplake/memory/."
   - Expected: refuses / routes only bash (cat/ls/grep) per the mount contract; does not execute python/node/curl on the VFS.

---

## 5. Hooks declaration (review notes — be explicit)

This plugin's core is **hook-based**, not just skills. Declare this plainly to reviewers:

- Hooks bundled: SessionStart, UserPromptSubmit (capture), PreToolUse (Bash intercept for the memory mount), PostToolUse (capture), Stop (summary + graph).
- Hooks are **not auto-trusted**: per Codex policy, installing/enabling the plugin does not trust its hooks — the user approves them via the standard trust-review flow on first run.
- What the hooks do: capture session activity to a Deeplake managed table, and intercept Bash/Read/Write targeting `~/.deeplake/memory/` to route through the virtual filesystem. No arbitrary network egress beyond the Deeplake API.
- Data handling: session prompts/tool calls/responses are stored in the org's Deeplake tables and shared across the org. State this in the privacy policy.

---

## 6. Account prerequisites (you must do these)

- [ ] OpenAI org identity verification (individual or business) completed in Platform settings.
- [ ] Org role has **Apps Management: Write**.
- [ ] Select countries for availability, add release notes, attest to policies.
- [ ] After approval: manually publish (approval does not auto-publish).
