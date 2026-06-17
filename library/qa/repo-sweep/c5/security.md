# Security Audit - Repo Sweep C5 (Graph)

- **Auditor:** `security-worker-bee`
- **Date:** 2026-06-16
- **Branch:** `pr/05-security-quality-repo-sweep`
- **Chunk:** C5 - Graph
- **Scope:** All `.ts` files under `src/graph/` (34 files), plus the shared helpers they depend on (`src/utils/sql.ts`, `src/utils/repo-identity.ts`).

---

## Executive Summary

The `src/graph/` subsystem is in good security shape. SQL construction is correctly confined to two files (`deeplake-push.ts`, `deeplake-pull.ts`), where every identifier goes through `sqlIdent()` and every value through `sqlStr()`. Process spawning (`git` CLI, the detached pull worker) uses `execFileSync`/`spawn` with array arguments and no shell, so repo paths and branch names cannot inject arguments. `repo-identity.ts` only hashes the normalized git remote URL; it is never used in a network request, so there is no SSRF.

One **High** finding was identified and **fixed in-session**: `vfs-handler.ts` built the snapshot file path from an unvalidated `commit_sha`/`snapshot_sha256` read out of `.last-build.json`, creating a path-traversal + prompt-injection sink. Both sibling code paths that consume the same field (`session-context.ts` and `diff.ts`) already validate it as hex; `vfs-handler.ts` was the lone exception. The fix mirrors the established pattern.

No credential, token, or captured-trace PII exposure was found in this chunk. No Critical findings.

Scope note: full-fidelity coverage. This chunk is squarely within the Stinger's target stack (TypeScript / Node / Deep Lake SQL API).

---

## Findings

### [HIGH] Path traversal + prompt-injection via unvalidated snapshot id in the graph VFS - FIXED

- **File:** `src/graph/vfs-handler.ts:189-190` (pre-fix)
- **Category:** OWASP A01 Broken Access Control / A03 Injection (path traversal) feeding the prompt-injection surface.
- **Evidence (pre-fix):**
  ```ts
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  const snapPath = join(baseDir, "snapshots", `${fileBase}.json`);
  ```
- **Analysis:** `last` comes from `readLastBuild()`, which by design validates only the *type* of `commit_sha`/`snapshot_sha256` (string), not the *shape* - see the explicit comment in `src/graph/last-build.ts:122-126`. A tampered `~/.hivemind/graphs/<key>/worktrees/<id>/.last-build.json` containing a shape-valid string such as `../../../../etc/some` would make `snapPath` escape the `snapshots/` directory, causing an arbitrary `*.json` file to be read, parsed, and rendered into agent context (the graph VFS output is consumed by the agent at query time). The canonical writer in `snapshot.ts` always emits 40-char or 64-char hex, so legitimate builds are unaffected.
- **Why High (not Critical):** Exploitation requires pre-existing write access to a file under the user's `~/.hivemind/` tree. It is not remotely triggerable and involves no credential/PII data path directly. It is rated High rather than Medium because (a) the sink feeds attacker-influenceable content into the agent prompt context, and (b) the two sibling consumers of the identical field already treat this exact tampering as an in-scope threat and guard against it - the inconsistency is the bug.
- **Corroboration (two sources):**
  1. `src/graph/session-context.ts:92-101` validates `commit_sha` (`/^[0-9a-f]{4,64}$/`) and `snapshot_sha256` (`/^[0-9a-f]{64}$/`) before interpolating into the prompt/path, with a documented "Tampered-file defence" rationale.
  2. `src/graph/diff.ts:78-85` (`loadSnapshotByCommit`) applies `/^[0-9a-f]{4,64}$/i` before building the snapshot path, citing "a value like `../etc/passwd` escapes the snapshots dir."
- **Remediation applied:** Added a hex-shape guard on `fileBase` before constructing `snapPath`, returning a best-effort `no-graph` result on failure. Minimal blast radius (one guard clause); behavior for all legitimate builds is unchanged.
  ```ts
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  if (!/^[0-9a-f]{4,64}$/.test(fileBase)) {
    return { kind: "no-graph", message: "Last-build metadata is invalid (non-hex snapshot id)." };
  }
  const snapPath = join(baseDir, "snapshots", `${fileBase}.json`);
  ```

---

## Category Scorecard

| Focus area | Result |
|---|---|
| tree-sitter extraction -> SQL injection via symbol names / file paths | **None detected.** Extracted symbol names and file paths become node `id`/`label`/`source_file` values. They reach Deep Lake SQL only inside the canonical snapshot JSON, which is escaped wholesale by `sqlStr(canonical)` in `deeplake-push.ts:155`. No symbol/path is interpolated into SQL as a bare identifier or unquoted value. Extractors (`extract/*.ts`, `extract/shared.ts`) are pure tree-sitter parsing - no `eval`, `new Function`, shell, or SQL. |
| Graph JSON snapshot writes - path traversal on `<key>` | **None detected.** `repoKey` is the 16-char SHA-1 hex slice from `deriveProjectKey()` (`repo-identity.ts:99`); it cannot contain `/` or `..`. `repoDir()`/`graphsRoot()` (`snapshot.ts:40-47`) join it safely. The snapshot filename is the commit SHA or content SHA-256 (hex from a trusted local build on the write path). |
| `build-lock.ts` - TOCTOU / race conditions | **None detected.** Lock acquisition uses `writeFileSync(..., { flag: "wx" })` (atomic `O_CREAT \| O_EXCL`); stale recovery `unlink`s then re-attempts the `wx` write so only one recoverer wins; release is owner-gated by PID. The TOCTOU surface is correctly closed. |
| Graph DB queries - `sqlIdent`/`sqlStr` on all interpolations | **None detected.** Only `deeplake-push.ts` and `deeplake-pull.ts` build SQL. Table name -> `sqlIdent()`. Every value (`orgId`, `workspaceId`, `repoSlug`/`repoKey`, `userId`, `worktreeId`, `commitSha`/`head`, `branch`, `ts`, `generator`, the full snapshot blob) -> `sqlStr()`. Numeric columns are JS numbers. No unescaped interpolation found. |
| `repo-identity.ts` - SSRF via git remote URL | **None detected.** `normalizeGitRemoteUrl()` output is only fed to `createHash("sha1")`. It is never used as a request target, redirect, or shell argument. No SSRF. `execSync("git config --get remote.origin.url")` is a constant command (no interpolation); the URL is read from stdout, not built into the command. |
| Process spawning - argument injection via repo paths / branch names | **None detected.** `git-hook-install.ts`, `deeplake-pull.ts`, and `repo-identity.ts` use `execFileSync("git", [..args], { cwd })` / `execSync` with a constant string - no shell, args passed as an array. `spawn-pull-worker.ts` uses `spawn("nohup", ["node", workerPath, "--cwd", cwd])` (no `shell: true`). The generated post-commit hook embeds the resolved `hivemind` binary path via correct POSIX single-quote escaping (`quoteForShell`), and that path comes from `which hivemind`, not user input. |
| Snapshot file permissions - world-readable code structure | **Informational (Low).** Snapshot/cache/handle/history files are written with the default umask (typically `0644`). They contain code-structure metadata (symbol names, file paths) for the user's own repo, not credentials or captured prompts (those live in the `sessions`/`memory` tables and `~/.deeplake/credentials.json`, both out of this chunk's scope and handled at `0600`/`0700` elsewhere). On a single-user dev machine this matches the repo's own file modes; no remediation required. The only explicit mode is `0o755` on the git hook file, which is intentional (it must be executable). |
| Credential / token leakage to logs | **None detected.** No `console.*`/logger call in `src/graph/` interpolates a token, `Authorization` header, or credential content. `deeplake-push.ts`/`deeplake-pull.ts` return structured outcome objects; error messages carry stage + error text, not secrets. |
| Captured-trace PII exposure | **None detected.** This chunk handles code-graph data, not `sessions`/`memory` captured traces. |
| Prompt-injection surface (graph injected at SessionStart) | **Hardened.** `session-context.ts` validates hashes before injecting; `vfs-handler.ts` now does the same after this audit's fix. Graph content rendered to the agent is honestly labeled as a fallible AST index. |
| Dynamic `require`/`eval`/`fetch`/network in read path | **None detected.** The VFS read path performs zero network calls and no dynamic code execution. |

---

## Files Changed

| File | Change | Severity addressed |
|---|---|---|
| `src/graph/vfs-handler.ts` | Added hex-shape validation of the snapshot `fileBase` before building `snapPath`, closing a path-traversal + prompt-injection sink. | High |

`git diff` verified: the only change in scope is the single guard clause above. (An unrelated modification to `src/skillify/skill-writer.ts` present in the worktree belongs to the concurrent C4 agent and was deliberately left untouched and excluded from this commit.)

---

## Recommendations (non-blocking, follow-up)

- **Consolidate the hex-validation pattern.** Three files now independently re-implement the `/^[0-9a-f]{4,64}$/` snapshot-id guard (`session-context.ts`, `diff.ts`, `vfs-handler.ts`). Consider a shared `isValidSnapshotId()` helper in `src/graph/` (or `src/utils/`) so a future code path that reads `.last-build.json` cannot forget it. (Low priority; documented here, not actioned, to keep this audit's blast radius minimal.)
- **Concurrency gap in `deeplake-push.ts`** (SELECT-before-INSERT with no UNIQUE constraint) is already documented in-code as an accepted v1.1 follow-up; it is a data-integrity concern, not a security vulnerability, and is out of scope here.

---

## Ordering Note

No `*-qa-report.md` / `*-quality-report.md` for chunk C5 was found predating this audit; `security-worker-bee` ran before `quality-worker-bee` for this chunk, as required.
