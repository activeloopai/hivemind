# Terminal Audit Findings Report

**Date:** {YYYY-MM-DD}
**Developer:** {name or anonymous}
**Shell:** {bash X.X | zsh X.X | fish X.X}
**OS:** {macOS XX | Ubuntu XX | Debian XX | other}
**Scope:** {dotfiles | shell scripts | tmux | just setup | full audit}

---

## Summary

{1-3 sentence overview: what was audited, overall health, top priority recommendation.}

| Severity | Count |
|---|---|
| High | {n} |
| Medium | {n} |
| Low | {n} |
| Informational | {n} |

---

## Findings

### HIGH

#### {Finding title}

**File:** `{filepath}`
**Line:** {line number or "N/A"}
**Pattern:** {the anti-pattern found}

**Problem:** {one sentence explaining why this is risky}

**Fix:**
```bash
# Before
{code before}

# After
{code after}
```

---

### MEDIUM

#### {Finding title}

**File:** `{filepath}`
**Pattern:** {the pattern}
**Problem:** {brief explanation}

**Fix:**
```bash
{fix}
```

---

### LOW / INFORMATIONAL

- **{issue}:** {brief description and fix}
- **{issue}:** {brief description and fix}

---

## Recommended actions

1. {Priority 1 - usually: add `set -euo pipefail` to scripts}
2. {Priority 2}
3. {Priority 3}

---

## Escalation

{If any findings require ci-release-worker-bee or typescript-node-worker-bee, note them here:}
- {Finding X} -> escalate to {peer Bee} because {reason}

---

## Snippets ready to use

{Copy-paste the key configs/fixes here so the developer can apply them immediately.}

```bash
{ready-to-apply configuration or sc