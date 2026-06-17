# Security Audit - Repo Sweep Chunk C4 (Skillify)

- **Auditor:** security-worker-bee
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C4 - Skillify
- **Scope:** all `.ts` files under `src/skillify/` (38 files)
- **Stinger:** `.cursor/skills/security-stinger/SKILL.md`

## Executive Summary

The skillify pipeline is, on the whole, well defended. Path-traversal on skill writes,
credential file modes, worker spawning, and the gate-runner bypass are all already
hardened. The audit found **one Critical finding cluster**: a set of Deep Lake SQL
statements that interpolate a config-driven table name directly into the query string
without passing it through `sqlIdent()`. This is the exact `sqlIdent`-on-identifier gap
the C3 sweep flagged, recurring in five statements across three skillify files while the
rest of the pipeline (`skills-table.ts`, `skillopt-improve.ts`, `skill-org-publish.ts`)
applies `sqlIdent` consistently. All five sites were remediated in-session.

No QA report exists for chunk C4, so the `security -> quality` ordering is intact. C3
quality-worker-bee is running in parallel against `src/hooks/` only; no files outside
`src/skillify/` were touched.

## Findings

### Critical

#### C4-SEC-01 - Missing `sqlIdent` on config-driven table name (Deep Lake SQL injection)

Five Deep Lake SQL statements interpolated a config-derived table identifier
(`config.skillsTableName` / `config.sessionsTableName`, surfaced as `args.tableName`,
`sessionsTable`, `cfg.sessionsTable`) straight into the query with no identifier
validation. The Deep Lake HTTP endpoint has no parameterized queries, so a tainted
identifier is raw injection (catalog A3; rubric: "SQL injection into the Deep Lake API via
a missing `sqlIdent` on a config-driven identifier" = Critical). The rest of the codebase
already routes every table name through `sqlIdent()`, which rejects anything outside
`[A-Za-z_][A-Za-z0-9_]*` - these five were the inconsistency.

Evidence (pre-fix):

- `src/skillify/pull.ts:142` - `` `FROM "${args.tableName}"${whereClause} ` `` (used by
  `runPull` / SessionStart auto-pull via `config.skillsTableName`).
- `src/skillify/skill-invocations.ts:108` - `` `... FROM "${sessionsTable}" WHERE ...` ``
- `src/skillify/skill-invocations.ts:147` - `` `SELECT message FROM "${sessionsTable}" WHERE path LIKE ...` ``
- `src/skillify/skillify-worker.ts:196` - `` `FROM "${cfg.sessionsTable}" ` `` (candidate-session listing)
- `src/skillify/skillify-worker.ts:214` - `` `FROM "${cfg.sessionsTable}" ` `` (session-row fetch)

**Remediation (applied):** wrapped each identifier in `sqlIdent(...)` from
`src/utils/sql.ts`, adding the import where it was absent (`pull.ts`,
`skillify-worker.ts`; `skill-invocations.ts` already imported `sqlStr`). Values in these
statements were already escaped via `sqlStr`/`esc`, so only the identifier needed closing.
Minimal blast radius: 8 insertions, 6 deletions across 3 files; no behavioral change for a
valid table name (a legitimate name passes `sqlIdent` unchanged), and an invalid one now
throws instead of injecting.

### High

None detected.

### Medium

#### C4-SEC-02 - Mined-skill body is LLM output over raw traces, not PII-sanitized (documented)

`skillify-worker.ts` builds the gate prompt from raw session pairs and writes the gate's
returned `body` verbatim into `SKILL.md` (`skill-writer.ts` `writeNewSkill`/`mergeSkill`)
and into the `skills` table (`insertSkillRow`). Per the Stinger's attack-surface model the
Haiku skillify gate IS the designated quality/safety checkpoint (A6 / C8), so this is the
intended architecture rather than a defect. There is no secondary key-redaction pass over
the mined body before it becomes a permanent, org-pullable artifact, so a secret that
survived the gate would propagate. Not fixed in-session (adding a redaction layer to the
mined-body path is an architectural change beyond minimal blast radius). Recommended
follow-up below.

### Low

None detected.

## Categories Checked (Catalogs A / B / C)

| Category | Result |
|---|---|
| A1 - Missing scope/org check on captured-trace reads | Queries scope by `project` + `author` (skillify-worker `authorClause`); no unscoped cross-tenant read introduced. None detected. |
| A2 - String-gate trusted with dynamic path | No ad-hoc shell on computed paths in skillify; worker spawn uses fixed argv. None detected. |
| A3 - Missing `sqlIdent` on config-driven identifier | **C4-SEC-01 (Critical) - found and fixed (5 sites).** |
| A4 - Rules File Backdoor (hidden Unicode) | Out of scope for `src/skillify`; no `.cursor/rules` edits in chunk. None detected. |
| A5 - Hallucinated / squatted deps | No new dependencies added in scope. None detected. |
| A6 / C8 - Prompt-injection via mined skills | Gate is the designated checkpoint; verdict `name` validated via `assertValidSkillName` before any path write. Documented as C4-SEC-02. |
| A7 / C2 - Token / PII leakage to logs | `wlog`/`log` emit names, versions, counts, reasons - no token, header, or raw trace body logged. None detected. |
| A8 - gate-runner bypass tampering | `gate-runner.ts` `createRequire` + renamed `execFileSync` preserved; spawn uses fixed argv array, no shell, no input-built command string. None detected. |
| B1 - SQL injection (values) | Values escaped via `sqlStr`/`sqlLike`/`esc`; LIKE patterns use `likeEscape` + `ESCAPE '\\'`. None detected (beyond identifier fix). |
| B3 / C3 - Caller-supplied org/scope | Org id + scope derive from `loadConfig()` credential context, never from tool args or captured payloads. None detected. |
| B8 - Prototype pollution | Frontmatter parser assigns known keys; JSON parses are array/string-guarded. None detected. |
| Path traversal (skill writes) | `assertValidSkillName` (kebab-case, rejects `/` `\` `..`, len<=100) on every write; `assertValidAuthor` on the author path segment; pull validates name AND author before constructing any path. None detected. |
| Auto-pull path validation | `runPull` validates name + author before `mkdirSync`/`writeFileSync`; invalid/empty rows skipped. None detected. |
| Argument injection (spawn) | `skillopt-worker` resolves only whitelisted agent binaries (`AGENT_CMD`) by walking PATH in Node (no shell); `spawn-skillify-worker` uses `spawnDetachedNodeWorker(path, [configFile])`. None detected. |
| C1 / C6 - Credential file/handling | `spawn-skillify-worker` writes config (holds the org token) with `mode 0o600` in a `0o700` tmpdir, with defensive `chmodSync`. None detected. |
| C5 - Token persisted into a trace | No token written into `skills`/`sessions` rows in scope; gate child env sets `HIVEMIND_CAPTURE=false`. None detected. |
| Gate verdict parsing (KEEP/MERGE/SKIP) | `parseVerdict` rejects any verdict outside the enum and returns null on parse failure; verdict `name`/`body` re-validated downstream. None detected. |
| Unpull deletion safety | `rmSync` targets only manifest-tracked dir names or readdir-derived single-segment names (no traversal); refuses `--all`/`--legacy-cleanup` combined with author filters. None detected. |

## Files Changed

| File | Change |
|---|---|
| `src/skillify/pull.ts` | +import `sqlIdent`; wrap `args.tableName` in `buildPullSql` |
| `src/skillify/skill-invocations.ts` | import `sqlIdent`; wrap `sessionsTable` in 2 SELECTs |
| `src/skillify/skillify-worker.ts` | +import `sqlIdent`; wrap `cfg.sessionsTable` in 2 SELECTs |

`git diff --stat`: 3 files changed, 8 insertions(+), 6 deletions(-). Lint: clean on all three files.

## Recommended Follow-Up

1. **Mined-body redaction (C4-SEC-02):** add a `safeLog`-style key-redaction pass over the
   gate `body` before `writeNewSkill`/`insertSkillRow`, so a credential that slips past the
   Haiku gate cannot become a permanent, auto-pulled org artifact. Architectural; track
   separately.
2. **Lint rule / guard:** consider a small unit assertion (or CI grep) that every
   `FROM "${...}"` / `INTO "${...}"` in `src/**` routes through `sqlIdent`, to stop this
   recurring gap (C3 and C4 both surfaced it).
