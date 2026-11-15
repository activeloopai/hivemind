# Badge Discipline

> Source: `research/external/2026-05-20-shields-io-badges.md`

Badges are a professionalism signal, not a decoration surface. Three badges done right communicate: "this project is maintained, tested, and versioned." Eight badges with four vanity items communicate the opposite.

---

## The hard limit: 3-5 badges in the header

Place badges immediately after the title/tagline, before any prose. Do not exceed 5. If you need to decide between two badges, always keep the one that is dynamic (live data) and drop the one that is static or vanity.

---

## Approved badge types (ordered by priority)

| Rank | Badge type | Signal | Shields.io pattern |
|---|---|---|---|
| 1 | **CI/CD status** | "Does the build pass?" | `https://img.shields.io/github/actions/workflow/status/{owner}/{repo}/{workflow}.yml` |
| 2 | **Test coverage** | "Is the code tested?" | `https://img.shields.io/codecov/c/github/{owner}/{repo}` (Codecov) |
| 3 | **Version / release** | "What version is current?" | `https://img.shields.io/github/v/release/{owner}/{repo}` |
| 4 | **Downloads** | "Is anyone using this?" (OSS only) | `https://img.shields.io/npm/dm/{package}` (npm), `https://img.shields.io/pypi/dm/{package}` (PyPI) |
| 5 | **License** | "Can I use this?" | `https://img.shields.io/github/license/{owner}/{repo}` |

Use only what applies to the project. A library without a downloads metric should not fake it with a zero-count badge.

---

## Vanity badges: cut them all

| Anti-pattern badge | Why it fails |
|---|---|
| "Made with ❤️" | Communicates nothing about the project's quality or fitness |
| "PRs welcome" | Every open source project accepts PRs; this is noise |
| "Awesome" | Self-nominated; dilutes the signal of every other badge |
| Star count badge | Circular, it's already on the GitHub repo page |
| Language percentage badge | GitHub shows this automatically; redundant |
| "Maintained" (static) | A static "maintained" badge is the first sign a project is unmaintained |

---

## Keeping badges live with GitHub Actions

A CI badge is only useful if it reflects the current build state. Wire it to GitHub Actions so it updates on every push:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

Badge URL for this workflow:
```
![CI](https://img.shields.io/github/actions/workflow/status/{owner}/{repo}/ci.yml?branch=main)
```

---

## Stale badge detection

During an audit, check each badge URL:
1. Does it resolve to a live image (200 OK)?
2. Does the data reflect the current repo state (not a fork's build, not a deleted branch)?
3. Is the branch pinned (`?branch=main`)? Unpinned badges default to the default branch, which changes on rename.

Flag any badge that fails these checks as `❌ stale` in the audit table.

---

## Badge placement markdown

```markdown
# project-name

> One-line tagline

[![CI](https://img.shields.io/github/actions/workflow/status/owner/repo/ci.yml)](https://github.com/owner/repo/actions)
[![Coverage](https://img.shields.io/codecov/c/github/owner/repo)](https://codecov.io/gh/owner/repo)
[![npm version](https://img.shields.io/npm/v/package-name)](https://www.npmjs.com/package/package-name)
[![License](https://img.shields.io/github/license/owner/repo)](LICENSE)
```

One badge per line is more readable. Group them on a single line only if there are exactly 2.

---

*See `examples/before-after-oss.md` for a badge audit in action.*
