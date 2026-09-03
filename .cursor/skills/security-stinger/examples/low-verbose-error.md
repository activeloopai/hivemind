# Worked Example - Low: Verbose Error Echoing the Resolved Memory Path (No Sensitive Leakage)

Demonstrates: `guides/03-owasp-top-10.md` B10.1 · `guides/01-scan-procedure.md` Step 11 (error disclosure sub-check) · Low-severity "document only" rule.

---

## Scenario

A CLI subcommand `hivemind memory stat <name>` returns an error payload that includes the resolved VFS path and the raw Node error message (but no token, no org id, no captured-trace content). It's used by an internal status command.

## Code pattern observed

```ts
try {
  const st = await vfsStat(name);
  return { ok: true, size: st.size };
} catch (err) {
  return { ok: false, path: resolvedPath, error: (err as Error).message };
}
```

## Finding text (report-ready)

> - [ ] **Information Disclosure - Resolved path + error message echoed** `src/commands/memory-stat.ts:~8` - Returns the resolved `~/.deeplake/memory/...` path and the raw Node error message to the caller. The path/message may reveal the home-directory layout and Node-internal detail, which slightly aids reconnaissance. No token, no org id, no captured-trace content.

## Severity rationale

**Low.** Per the rubric in `guides/00-principles.md`:

- Not a credential or captured-trace finding → the never-downgrade rule does not force High.
- Not an auth/scope bypass, not an injection, not a token.
- The leaked information is a local path and an error string, not a credential or another scope's data.
- Typical hardening / hygiene gap.

**Document only.** Don't spend session time fixing this - the minimal-blast-radius rule means Low findings should accumulate in a follow-up backlog rather than churn the current diff.

## What goes in the audit report

Under **Low Findings (documentation only):**

- [ ] **Information Disclosure - Resolved path + error echoed** `src/commands/memory-stat.ts:~8` - Returns the resolved memory path and `err.message`. Recommend: log server-side with `safeLog.error`, return a generic `{ ok: false }` to the caller.

## Why this example matters

The Stinger must train the Bee's judgment that NOT fixing is sometimes the right answer. Low findings clutter diffs, and a scan that auto-fixes everything creates review fatigue and makes it harder for the reviewer to see the Critical/High fixes that matter. The report captures the finding so it's not lost, but the session stays disciplined.

Counter-case: if the error echoed the `X-Activeloop-Org-Id`, a token, a raw Deep Lake SQL fragment, or another scope's captured content, it would escalate to Medium or High.