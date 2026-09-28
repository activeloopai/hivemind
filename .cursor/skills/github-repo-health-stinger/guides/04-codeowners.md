# 04 - CODEOWNERS Audit

*Research basis: `research/external/03-codeowners-docs.md`*

## What to check

1. **Presence:** Does `CODEOWNERS` exist at `./CODEOWNERS`, `.github/CODEOWNERS`, or `docs/CODEOWNERS`?
2. **Syntax validity:** Any malformed patterns or non-existent team/user references?
3. **Coverage:** What percentage of source paths have a matching owner?
4. **Ownership type:** Team ownership (`@org/team`) vs. individual (`@username`) - teams are more resilient.
5. **Security-sensitive path coverage:** `.github/workflows/`, `config/`, `.env.example`, `package.json` - do they have restricted owners?
6. **Monorepo patterns:** Do all sub-packages have explicit owners?

## Data collection

```bash
# Check file locations
ls CODEOWNERS .github/CODEOWNERS docs/CODEOWNERS 2>/dev/null

# List all owners referenced
grep -v '^#' CODEOWNERS | awk '{for (i=2; i<=NF; i++) print $i}' | sort -u

# Check owner validity (requires gh CLI)
# Teams:
gh api /orgs/{org}/teams --jq '.[].slug'
# Individuals: manually verify @username exists on GitHub
```

## Coverage gap detection

Walk the repo directory tree and for each path, find the last matching CODEOWNERS pattern (bottom-wins). Paths with no match are "unowned."

For a monorepo:
```bash
# Quick coverage report script
python3 - <<'EOF'
import subprocess, pathlib, re

codeowners_path = pathlib.Path('.github/CODEOWNERS')
rules = []
for line in codeowners_path.read_text().splitlines():
    line = line.split('#')[0].strip()
    if line:
        parts = line.split()
        rules.append((parts[0], parts[1:]))

# Walk and match... (abbreviated; full script in examples/codeowners-coverage-check.py)
EOF
```

## Scoring rubric

See `research/external/03-codeowners-docs.md` for full rubric. Summary:

| Condition | Score |
|---|---|
| Exists, no errors, full coverage, team ownership | 10 |
| Exists, minor gaps, team ownership | 8 |
| Exists, individual ownership only | 6 |
| Exists, errors or > 30% unowned | 4 |
| Not present | 0 |

## Report section template

```markdown
### CODEOWNERS (Score: X/10)

**Location:** `.github/CODEOWNERS`
**Syntax errors:** None / {list errors}
**Coverage:** 85% of source paths have an owner (unowned: `scripts/`, `docs/adr/`)
**Ownership type:** Mixed (team + individual)

**Security-sensitive paths:**
| Path | Owner | Appropriate? |
|---|---|---|
| `.github/workflows/` | @org/release-team | ✅ |
| `config/` | @username | ⚠️ Individual, not team |
| `package.json` | Not covered | ❌ |

**Findings:**
- RECOMMEND: Add `package.json` to CODEOWNERS assigned to @org/platform-team @org/release-team (effort: 5 minutes).
- RECOMMEND: Change `config/` ownership from @username to @org/platform-team (team resilience).
- RECOMMEND: Add wildcard catch-all `* @org/engineering-leads` at top of file to co