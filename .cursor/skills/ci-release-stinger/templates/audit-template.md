# Build / CI / Release Audit Output - {{project-name}}

**Date:** {{YYYY-MM-DD}}
**Reviewer:** ci-release-worker-bee
**Scope:** {{branch / PR / new workflow / release cut / bundle change}}
**Stack:** {{captured from inventory - Node engine range, package manager, harness bundle outputs, version source of truth, which workflows exist, Node matrix}}

---

## Executive summary

{{2-4 sentence synthesis. Lead with the headline finding. Mention severity counts and top recommendation.}}

## Inventory captured

| Artifact | Status | Notes |
|---|---|---|
| `package.json` scripts | | {{build/ci/test/prepack/postinstall present?}} |
| `files` allowlist | {{complete / drifted}} | {{all esbuild outdirs covered?}} |
| `esbuild.config.mjs` | | {{outdirs, define set on every target?}} |
| `scripts/sync-versions.mjs` | {{present}} | {{version single-sourced?}} |
| `scripts/pack-check.mjs` | {{present}} | {{wired into ci.yaml test job?}} |
| `scripts/ensure-tree-sitter.mjs` | {{present}} | {{postinstall wired?}} |
| `.github/workflows/*.yaml` | {{count}} | {{actions pinned, node pinned, permissions blocks}} |
| Node matrix | | {{cross-node-install range}} |
| Quality gate | | {{tsc + jscpd + vitest + husky}} |

## Pillar ratings

Ratings: Solid / Drifting / Needs work

| Pillar | Rating | Headline finding |
|---|---|---|
| Build + bundle (`guides/01`) | | |
| Version single-sourcing (`02`) | | |
| Quality gate (`03`) | | |
| Workflows (`04`) | | |
| Release flow (`05`) | | |
| npm release discipline (`06`) | | |
| Native deps (`08`) | | |

## Findings

### Must-fix ({{count}})

1. **`{{file:line}}`** - {{one-line summary}}
   - Reason: {{citation - guide section + research note or external URL}}
   - Fix: {{specific change}}

2. ...

### Should-refactor ({{count}})

1. **`{{file:line}}`** - ...

### Style ({{count}})

1. **`{{file:line}}`** - ...

## Checks captured (where available)

| Check | Current | Expected | Notes |
|---|---|---|---|
| Version sync across manifests | {{pass / drift}} | all match root | run `scripts/check-version-sync.sh` |
| esbuild outdirs vs. `files` | {{aligned / gap}} | every output shipped | run `scripts/audit-bundle.sh` |
| pack-check | {{pass / fail}} | no forbidden filenames | `npm run pack:check` |
| audit:openclaw | {{pass / fail}} | no ClawHub findings | `npm run audit:openclaw` |
| `npm run ci` | {{pass / fail}} | green | typecheck + dup + test |
| jscpd duplication % | {{%}} | < threshold 7 | |
| cross-node-install | {{pass / fail}} | Node 22 + 24 green | |

## Cross-Bee handoffs

- [ ] `security-worker-bee` - {{if any secret reachable past pack-check / supply-chain concern surfaced}}
- [ ] `dependency-audit-worker-bee` - {{if a lockfile / CVE concern surfaced}}
- [ ] `harness-integration-worker-bee` - {{if a bundle's export semantics are in question}}
- [ ] `changelog-release-notes-worker-bee` - {{if release-notes prose is needed}}
- [ ] `quality-worker-bee` - {{post-implementation verification}}

## Recommended next steps

1. {{highest-leverage fix - e.g., "add the new harness outdir to the files allowlist"}}
2. {{next}}
3. {{next}}

## References

- `guides/...` ({{list the guides actually cited}})
- `research/...` ({{list the research notes referenced}})
- {{external URLs cited inline above}}

---

*Produced by ci-release-stinger. See `SKILL.md` for methodology.*
