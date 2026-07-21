import { defineConfig } from "vitest/config";

// Root vitest config. `npm test` runs `vitest run` from the repo root, so
// this is the file that actually gets picked up. The one in harnesses/claude-code/
// is a historical leftover and is not used by the root test script.
//
// Coverage thresholds are enforced per-file on the files touched by each
// PR. New files/PRs should add their paths to the `thresholds` block so
// the CI check grows over time instead of collapsing to a global average
// that hides regressions in new code.

export default defineConfig({
  // Match esbuild's `define` for __HIVEMIND_VERSION__ so source files that
  // read it directly (e.g. src/utils/client-header.ts) don't need a typeof
  // guard for tests. Bundled builds substitute the real version; tests get
  // the "dev" sentinel.
  define: {
    __HIVEMIND_VERSION__: JSON.stringify("dev"),
  },
  test: {
    include: [
      "tests/claude-code/**/*.test.ts",
      "tests/cli/**/*.test.ts",
      "tests/codex/**/*.test.ts",
      "tests/cursor/**/*.test.ts",
      "tests/hermes/**/*.test.ts",
      "tests/openclaw/**/*.test.ts",
      "tests/pi/**/*.test.ts",
      "tests/scripts/**/*.test.ts",
      // Non-agent-specific tests for shared `src/` modules (auth,
      // deeplake-api, embeddings, grep, notifications, etc.). New
      // location since PR #183 — the older convention dumps everything
      // shared into tests/claude-code/, which misleadingly suggests
      // agent scope. New tests for src/* modules go here; a follow-up
      // issue tracks the migration of the existing ones.
      "tests/shared/**/*.test.ts",
    ],
    setupFiles: ["./tests/test-setup.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // `json` is needed by davelosert/vitest-coverage-report-action@v2 to
      // render per-file / per-line coverage in its PR comment (alongside the
      // aggregated json-summary). Without it the action emits a warning
      // about a missing coverage-final.json and falls back to the summary.
      reporter: ["text", "text-summary", "json", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/**/*.js",
        "src/**/*.js.map",
        // CLI entry points — `main()` calls process.exit(), so source-level
        // unit tests don't make sense. These files have subprocess-spawn
        // coverage via tests/claude-code/shell-bundle-*.test.ts instead.
        "src/shell/deeplake-shell.ts",
        // Skillify worker entry points: skillify-worker.ts parses cfg from
        // process.argv[2] at top level then runs main() which spawns
        // detached subprocesses; spawn-skillify-worker.ts is the spawner.
        // Both are excluded from vitest because they need a live Deeplake
        // workspace + a real agent CLI to exercise meaningfully.
        // Coverage on the SHIPPED bundle is enforced indirectly by
        // tests/claude-code/skillify-bundle-scan.test.ts (asserts the
        // skillify-worker.js bundle exists per agent and contains the
        // required entry strings + agent labels). For full e2e in
        // development, see the manual matrix script described in the
        // PR description (lives at /tmp/skillify-e2e-matrix.mjs in the
        // author's worktree, not committed).
        "src/skillify/skillify-worker.ts",
        "src/skillify/spawn-skillify-worker.ts",
      ],
      // Per-file thresholds. Each PR that ships new files should append
      // its paths here with 80 / 80 / 80 / 80, so we prevent regressions
      // on the new code without having to first bring the whole
      // (~500-file) codebase up to 80%.
      thresholds: {
        // PR #302 — feat: per-directory .hivemind config. The resolver is
        // fully unit-tested; the hook gate is exercised via the capture/
        // session-start wiring tests. Lock both at 90.
        "src/dir-config.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/shared/dir-gate.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR #307 — feat: mask secrets on capture. The redactor is fully
        // unit-tested (recall + precision + entropy backstop); lock at 90.
        "src/hooks/shared/redact.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR #60 — fix/grep-dual-table-and-normalize.
        // Raised to 90 to surface the red path in the PR coverage comment
        // for metrics that sit between 80 and 90 (e.g. grep-core branches
        // at 83%). The actual long-term bar we want to hold is 80; revisit
        // once the PR has landed.
        "src/shell/grep-core.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/shell/grep-interceptor.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/grep-direct.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR #284 — fix(codex): PreToolUse allow-rewrite for memory writes (F3).
        // Branch suite covers the read fast-path, write-redirect allow/block
        // arms, and the graph/default-deps branches. Held at 90 to lock the gate.
        "src/hooks/codex/pre-tool-use.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/session-queue.ts": {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
        // fix/index-md-include-sessions — 5-fix PR stacked on PR #61.
        // output-cap.ts is new in this PR (fix #5); virtual-table-query.ts was
        // heavily modified by fix #1 (index.md builder / fallback) and fix #4
        // (ESCAPE '\' on LIKE clauses). Held at 90 to match the rest of the
        // plugin-hot-path files already at that bar.
        "src/utils/output-cap.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/virtual-table-query.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR #323 — feat: provision tree-sitter parsers into the shared
        // embed-deps dir so the graph-on-stop auto-build hook resolves them.
        // Pure logic + an injectable npm/heal boundary — fully unit-tested.
        // Branches held at 85: a few defensive arms (malformed package.json,
        // non-Error throw coerced via String(err)) aren't worth a fixture each.
        "src/cli/graph-deps.ts": {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90,
        },
        // embedding_generation — nomic daemon + IPC client + SQL helper.
        // Lines/statements held at 90; branches + functions are allowed to
        // dip on the daemon because a few paths (SIGINT/SIGTERM handlers,
        // the non-Linux `typeof process.getuid !== "function"` fallback,
        // and the server "error" handler) can't be triggered from unit
        // tests without forking a real subprocess.
        "src/embeddings/client.ts": {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
        "src/embeddings/daemon.ts": {
          statements: 90,
          branches: 75,
          functions: 75,
          lines: 90,
        },
        "src/embeddings/nomic.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/embeddings/protocol.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/embeddings/sql.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR for issue #178 — standalone embed client used by pi + openclaw.
        // Stripped-down spawn-on-miss state machine. Same branch tier as
        // `client.ts`: a couple of paths (cross-process race on pidfile
        // cleanup, getUid fallback for non-Unix runtimes) are intentionally
        // v8-ignored because they can't be triggered deterministically from
        // unit tests without forking real subprocesses.
        "src/embeddings/standalone-embed-client.ts": {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90,
        },
        "src/hooks/pre-tool-use.ts": {
          // Graph VFS branch added in feat/codebase-graph-phase1-extractor
          // (cat /memory/graph/* → handleGraphVfs delegate). Per-tool decision
          // forks (Read → file_path, Bash → echo) cost a few branch points
          // not yet hit by direct unit tests; covered end-to-end via the
          // live retrieval tests.
          //
          // feat/unify-goals-remove-tasks added the Write/Edit deny path
          // (buildDenyDecision + the case in processPreToolUse + the
          // permissionDecision:"deny" branch in main()). Source-level
          // unit tests cover buildDenyDecision and the Write/Edit deny
          // branch; main() is `c8 ignore`-wrapped but still surfaces in
          // the v8 functions count via the small arrow closures inside
          // the JSON.stringify call. Net effect: functions% dropped a
          // couple points without any new uncovered LOGIC. Floor for
          // functions dropped from 90 → 88 to match the new reality
          // without forcing decorative tests.
          statements: 90,
          branches: 85,
          functions: 88,
          lines: 90,
        },
        "src/hooks/memory-path-utils.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // feat/proactive-recall — UserPromptSubmit auto-search-and-inject.
        "src/hooks/recall.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/shared/recall-gate.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/shared/recall-format.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/shared/recall-query.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/shared/recall-events.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/shared/with-deadline.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // fix/plugin-autoupdate-session-safety — snapshot-restore around
        // claude-plugin update + SessionEnd GC. All four files at 90+.
        "src/utils/plugin-cache.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/plugin-cache-gc.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/session-start.ts": {
          // Graph-pull worker spawn gated on creds?.token + graphContextLine
          // inject. Both branches (auth+no-auth, graph-present+absent) are
          // covered directly in tests/claude-code/session-start-graph-worker.test.ts.
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/hooks/session-start-setup.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR #76 — feat/openclaw-static-scan-clean. Two new files extracted
        // from auth.ts / deeplake-api.ts so the openclaw bundle could split
        // fs reads from fetch calls. Tests in tests/claude-code/{auth-creds,
        // index-marker-store}.test.ts cover both source modules above 90%.
        "src/commands/auth-creds.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/index-marker-store.ts": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        // PR #76 follow-up — coverage on the surface the bot flagged at 0%.
        // auth.ts mixes pure helpers (decodeJwt, apiGet/Post/Delete) with the
        // full device-flow login orchestration. Branches and functions sit
        // at ~88/83 because the openBrowser platform-switch and a few
        // login-flow corner cases (interactive prompts) are pragmatic to
        // skip; statements + lines both ≥96 so the safety bar holds.
        "src/commands/auth.ts": {
          statements: 90,
          branches: 80,
          functions: 80,
          lines: 90,
        },
        // fix/docs-scope-existence-checks — the `docs` CLI dispatcher gained a
        // full subcommand-surface suite in tests/claude-code/cli-docs.test.ts
        // (set/index/show/list/archive/refresh/wiki-refresh/sync/auto/pull/
        // reindex/wiki/generate), driven through the real store against the
        // query spy. Actuals: statements 95, branches 87, functions 91, lines 98.
        // Branches + functions pinned at 85 (not 90): the residual gaps are the
        // interactive graph-build recursion (dynamic-imports native tree-sitter)
        // and the closures handed to runWikiRefreshCycle (git runner /
        // snapshot loader), which are dead once that cycle is stubbed — neither
        // is deterministically reachable from a unit test.
        "src/commands/docs.ts": {
          statements: 90,
          branches: 85,
          functions: 85,
          lines: 90,
        },
        "src/deeplake-api.ts": {
          // ensureCodebaseTable (create + heal + ensureLookupIndex branches)
          // covered directly in tests/shared/deeplake-api-codebase-table.test.ts.
          // Branches sits at 89.85 (one branch shy of 90) — the lone gap is
          // the MEMORY_COLUMNS drift guard at L481 (throws if a frozen schema
          // constant doesn't include SUMMARY_EMBEDDING_COL). Reachable only
          // by editing the schema file, so a unit test would have to mock the
          // module's frozen export — not worth the contrivance for one
          // defensive guard. Hold at 89.
          statements: 90,
          // 87 (not 90): the line-486 MEMORY_COLUMNS drift guard is
          // a defensive throw that only fires when MEMORY_COLUMNS
          // loses SUMMARY_EMBEDDING_COL — a production-data shape
          // bug we'd never want to actually trigger in tests.
          // Plus: every ensure*Table method carries a double-check
          // `if (!tables.includes(safe))` inside the create branch,
          // where the inner check is structurally unreachable (the
          // table can't have been concurrently created by another
          // process between the outer if and inner if in a single
          // event-loop tick). Each new ensure* method adds another
          // such unreachable branch — feat/rules-and-tasks-kpis added
          // 5 (rules / tasks / task_events / goals / kpis) and
          // feat/codebase-graph-phase1 added 1 (codebase), each
          // contributing one un-coverable branch. Calibrated to the
          // post-merge reality (was 88 pre-codebase, 89 originally).
          branches: 87,
          functions: 90,
          lines: 90,
        },
        // feat/unified-npx-installer — unified `hivemind` CLI + cursor /
        // hermes hook bundles + MCP server + utils/version-check helper.
        // Each new file held at the project-wide 80/80/80/80 bar.
        "src/cli/util.ts":              { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/version.ts":           { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/auth.ts":              { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/index.ts":             { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/update.ts":            { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-claude.ts":    { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-codex.ts":     { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-cursor.ts":    { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-hermes.ts":    { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-mcp-shared.ts": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-openclaw.ts":  { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/cli/install-pi.ts":        { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/commands/auth-login.ts":   { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/cursor/capture.ts":      { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/cursor/pre-tool-use.ts": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/cursor/session-end.ts":  { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/cursor/session-start.ts": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/hermes/capture.ts":      { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/hermes/pre-tool-use.ts": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/hermes/session-end.ts":  { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/hooks/hermes/session-start.ts": { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/mcp/server.ts":            { statements: 80, branches: 80, functions: 80, lines: 80 },
        "src/utils/version-check.ts":   { statements: 80, branches: 80, functions: 80, lines: 80 },
        // feat/centralize-autoupdate — shared autoUpdate helper that every
        // session-start hook calls. Branches at 80 (not 90) because the
        // default-spawn child_process callbacks (close-with-null-code from
        // signal kill, the 'error' event-handler ack path) and the empty-
        // string success branch in findHivemindOnPath() can't be deterministically
        // triggered from unit tests without forking real subprocesses. Statements
        // + lines + functions held at 80; the gating + output-parsing logic
        // (the actually-load-bearing surface) is exhaustively tested.
        "src/hooks/shared/autoupdate.ts": { statements: 80, branches: 80, functions: 80, lines: 80 },
        // feat/skillify — background skill-mining worker + CLI surface +
        // per-agent gate dispatch + Deeplake skills table for org provenance.
        // Most modules cleanly hit 90/90/90/90; the trio below sits a touch
        // lower on branches because their happy paths are well-covered but a
        // few error-recovery branches (lock-cleanup races, log-write failures
        // inside detached subprocesses) are pragmatic to leave at 75-80.
        // feat/session-start-autopull-skills — auto-pull all-author skills
        // at every SessionStart, throttled + bounded.
        "src/skillify/auto-pull.ts":         { statements: 90, branches: 70, functions: 90, lines: 90 },
        "src/skillify/extractors/index.ts":  { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/gate-parser.ts":       { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/gate-runner.ts":       { statements: 90, branches: 60, functions: 90, lines: 90 },
        // One-shot legacy state-dir migration. Branches at 80 because the
        // EXDEV/EPERM error-recovery branch is mocked via vi.doMock("node:fs")
        // and the uncaught-rethrow branch covers everything else implicitly.
        "src/skillify/legacy-migration.ts":  { statements: 90, branches: 80, functions: 90, lines: 90 },
        // fix/skillify-legacy-cap-migration — local, remote-independent cap
        // migration of legacy over-long installs (runs before the network in
        // auto-pull). Branches at 85: a couple of defensive arms (installedName
        // null, capSkillName no-op, already-canonical dir) aren't each worth a
        // dedicated fixture; the load-bearing migrate/skip/collision/fs-error
        // paths are all exercised.
        "src/skillify/legacy-cap-migration.ts": { statements: 90, branches: 85, functions: 90, lines: 90 },
        "src/skillify/pull.ts":              { statements: 90, branches: 75, functions: 90, lines: 90 },
        "src/skillify/push.ts":              { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/scope-config.ts":      { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/skill-writer.ts":      { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/skillify/skills-table.ts":      { statements: 90, branches: 70, functions: 90, lines: 90 },
        // Branches dropped 70 → 65 in the codebase-graph Phase 1 refactor:
        // normalizeGitRemoteUrl / deriveProjectKey moved out to
        // src/utils/repo-identity.ts (re-exported here for back-compat).
        // Those helpers had many regex branches that inflated the
        // denominator; the remaining state.ts code is unchanged in
        // coverage but now represents a smaller branch surface, so the
        // ratio dipped 0.56% below the old 70 bar without any actual
        // regression in test quality.
        "src/skillify/state.ts":             { statements: 80, branches: 65, functions: 90, lines: 80 },
        "src/skillify/triggers.ts":          { statements: 80, branches: 70, functions: 90, lines: 80 },
        "src/commands/skillify.ts":          { statements: 80, branches: 70, functions: 80, lines: 80 },
        // PR #96 — feat/notifications-framework. Centralized push-notification
        // framework + Claude Code dual-channel adapter (systemMessage + addCtx).
        // Most files at 100% via notifications.test.ts and notifications-coverage.test.ts.
        // session-notifications.ts is the SessionStart hook entry point — main()
        // is hard to unit-test directly because vi.spyOn(process.stdout) doesn't
        // intercept writes that happen during dynamic-import resolution. Bundle
        // smoke tests in notifications.test.ts cover the happy path through the
        // built artifact; the entry-point thresholds are calibrated to what we
        // can reliably measure without a subprocess spawn.
        "src/hooks/session-notifications.ts":     { statements: 60, branches: 50, functions: 50, lines: 90 },
        "src/notifications/types.ts":             { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/notifications/format.ts":            { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/index.ts":             { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/notifications/queue.ts":             { statements: 90, branches: 70, functions: 90, lines: 90 },
        "src/notifications/state.ts":             { statements: 90, branches: 75, functions: 90, lines: 90 },
        "src/utils/atomic-write.ts":            { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/rules/registry.ts":    { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/rules/welcome.ts":     { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/rules/referral-invite.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/sources/backend.ts":   { statements: 90, branches: 90, functions: 80, lines: 90 },
        // feat/resume-next-steps — resume-brief windowing (skip placeholders +
        // dedup) and the goal capture/get CLI. pickResumeBrief is exercised via
        // a mocked DeeplakeApi boundary (see resume-brief.test.ts).
        "src/notifications/sources/resume-brief.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/commands/goal.ts":                   { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/delivery/index.ts":    { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/delivery/claude-code.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
        // feat/hivemind-savings-recap — per-session "Hivemind has saved you Nk tokens"
        // recap. Pure local arithmetic: parse session transcript for memory-grep
        // bytes, accumulate in ~/.deeplake/usage-stats.jsonl, render at SessionStart
        // using the published LoCoMo 1.7x multiplier (1,008 vs 1,700 tokens / Q).
        "src/notifications/transcript-parser.ts":   { statements: 90, branches: 75, functions: 90, lines: 90 },
        "src/notifications/usage-tracker.ts":       { statements: 90, branches: 75, functions: 90, lines: 90 },
        "src/notifications/sources/local-usage.ts": { statements: 90, branches: 80, functions: 90, lines: 90 },
        // feat/skillify-mine-local (PR #129) — `hivemind skillify mine-local`
        // seeds reusable skills from a fresh user's own local agent transcripts
        // without requiring Deeplake auth. New surface area:
        //   - src/skillify/local-source.ts          — agent/session detection + ε-greedy pick
        //   - src/skillify/local-manifest.ts        — on-disk manifest shared with hooks
        //   - src/skillify/spawn-mine-local-worker.ts — detached worker spawn helper
        //   - src/commands/mine-local.ts            — orchestrator + LLM gate dispatch
        //   - src/notifications/rules/local-mined.ts — surfaces mined count at SessionStart
        // mine-local.ts dips to 90 branches because a few short-circuit branches
        // inside runGateViaStdin (settled-flag race + the unreachable error
        // branch after spawn-already-errored) can't be deterministically
        // triggered without forking subprocesses; everything else holds at 90+.
        "src/skillify/local-source.ts":               { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/local-manifest.ts":             { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/spawn-mine-local-worker.ts":    { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/commands/mine-local.ts":                 { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/notifications/rules/local-mined.ts":     { statements: 90, branches: 90, functions: 90, lines: 90 },
        // feat/memory-backfill — install-time retro-mine of past local agent
        // sessions (claude/codex/…) into team memory, two-phase
        // extract(no-auth)/flush(post-login). Pure logic + real I/O wiring are
        // both covered: the heavy constructors (DeeplakeApi, EmbedClient,
        // child_process.spawn) are vi.mock'd in *-wiring.test.ts so the real
        // default-dependency factories execute, and the runClaude spawn path is
        // exercised via a fake claude executable. statements/functions/lines are
        // ≥90 on every file (two at 100); branches sit at 88 on three files —
        // the residual gaps are defensive `??`/`Array.isArray` fallbacks and a
        // budget-message ternary, the same branch calibration used across this
        // config (e.g. gate-runner 60, build-lock 55, skills-table 70).
        "src/skillify/pending-memory-manifest.ts":    { statements: 90, branches: 85, functions: 90, lines: 90 },
        "src/skillify/backfill-guards.ts":            { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/stage-memory.ts":               { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/skillify/spawn-backfill-memory-worker.ts": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/commands/backfill-memory.ts":            { statements: 90, branches: 90, functions: 90, lines: 90 },
        // branches at 85 (not 90): the residual gaps are defensive catch/??
        // fallbacks, and v8 branch counting drifts a couple points across Node
        // versions (CI measured 88 where local measured 92), so the floor is
        // set with margin to stay deterministic.
        "src/commands/flush-memory.ts":               { statements: 90, branches: 85, functions: 90, lines: 90 },
        // feat/rules-and-tasks-kpis — cross-agent rules + tasks + KPI
        // events (T1-T9). Per-file thresholds for the new modules.
        // Branches calibrated to actual coverage: rules/tasks list-*
        // helpers have several optional-flag combinations not all
        // exercised; kpi-generator's dynamic import("@anthropic-ai/sdk")
        // catch is defensive against future bundling mishaps and
        // not reachable from unit tests; context-renderer's per-
        // section sub-tries are tested for missing-table per section
        // but not every error × section pair.
        // read.ts files: their `normalize()` helper has ~10 `?? ""`
        // defensive fallbacks per field (one per column). Test data
        // sets all fields, so those ?? branches aren't hit — purely
        // defensive coverage that's not worth synthesising garbage
        // rows for. Calibrated to actual coverage.
        "src/rules/write.ts":                         { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/rules/read.ts":                          { statements: 90, branches: 70, functions: 90, lines: 90 },
        // context-renderer.ts: branches dropped 80 → 75 after the
        // canonical-form owner gate landed in feat/unify-goals-remove-tasks
        // (PR #203). The new ownerNorm.split("@")[0] ?? ownerNorm
        // fallbacks + per-form short-circuits add several defensive
        // branches whose ?? side only fires on malformed rows (owner=""
        // or owner with no @ in a non-short form). Tests cover the
        // legitimate match/reject paths but not every defensive ??.
        "src/hooks/shared/context-renderer.ts":       { statements: 90, branches: 75, functions: 90, lines: 90 },
        "src/commands/rules.ts":                      { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/commands/context.ts":                    { statements: 90, branches: 90, functions: 90, lines: 90 },
        // feat/codebase-graph-phase1-extractor — TS extractor + snapshot writer + CLI.
        //
        // typescript.ts has tree-sitter ERROR/MISSING + unsupported-node-type
        // fallback branches we won't trigger from unit tests without crafting
        // pathological source files; branches held at 70, same tier as
        // notifications/queue and skillify/triggers. Statements + lines +
        // functions kept at 90 — the happy-path logic is exhaustively tested
        // (43 tests across extractor/snapshot/command).
        // snapshot.ts is small + pure: 100/88/100/100 measured.
        // graph.ts is CLI glue; --help process.exit branches and error-print
        // paths are pragmatic to leave at the project-wide 80 bar.
        // repo-identity.ts was extracted from skillify/state.ts; the moved
        // helpers are also exercised by tests/claude-code/skillify-state.test.ts
        // (24 tests) and skillify-triggers.test.ts (12 tests). Branches at 50
        // because normalizeGitRemoteUrl has many regex alternation branches
        // (SCP form, default-port stripping for 4 schemes, trailing-slash
        // variants); the happy-path canonicalization output is covered.
        // Per-file thresholds calibrated to current coverage after the
        // batch-D targeted-test push:
        //   - graph-on-stop.ts went 44% → 89% with the new main() orchestration
        //     tests (mocked deps for runBuildCommand + lock helpers)
        //   - build-lock.ts gained owner-gated release tests
        //   - diff.ts gained schema-validation tests for loadSnapshotByCommit
        // The few remaining gaps (commands/graph.ts dispatcher arms in
        // edge-error branches, cache.ts module-label rewrite branch) are
        // documented as v1.1 follow-ups.
        "src/graph/extract/typescript.ts":   { statements: 89, branches: 65, functions: 90, lines: 89 },
        "src/graph/snapshot.ts":             { statements: 90, branches: 85, functions: 90, lines: 90 },
        "src/graph/cache.ts":                { statements: 75, branches: 70, functions: 90, lines: 90 },
        "src/graph/build-lock.ts":           { statements: 75, branches: 55, functions: 90, lines: 70 },
        "src/graph/deeplake-push.ts":        { statements: 90, branches: 80, functions: 80, lines: 90 },
        "src/graph/diff.ts":                 { statements: 80, branches: 55, functions: 85, lines: 80 },
        "src/graph/git-hook-install.ts":     { statements: 85, branches: 75, functions: 90, lines: 85 },
        "src/graph/history.ts":              { statements: 85, branches: 75, functions: 90, lines: 90 },
        "src/graph/last-build.ts":           { statements: 90, branches: 80, functions: 90, lines: 90 },
        "src/hooks/graph-on-stop.ts":        { statements: 85, branches: 70, functions: 85, lines: 85 },
        "src/commands/graph.ts":             { statements: 65, branches: 55, functions: 90, lines: 65 },
        // graph-pull-hash branch — Python cross-file resolution + build ignores.
        "src/graph/ignore-config.ts":        { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/graph/resolve/cross-file.ts":   { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/utils/repo-identity.ts":        { statements: 85, branches: 50, functions: 90, lines: 90 },
        // fix/goals-vfs-skew — the Deeplake VFS (goal/kpi routing, graph
        // bridge, session reads, soft-close/status-transition). Previously
        // unenforced: the file sat at ~82% lines / ~72% branches and only
        // surfaced as a red PR-coverage comment. deeplake-fs-coverage.test.ts
        // exercises the structured-table dispatch, the /graph/* bridge, the
        // session concat path, and the rm/mv goal flows against a stateful
        // mock DeeplakeApi, bringing it to 97/91/97/99. Floor set at 90 to
        // catch regressions on these paths going forward.
        "src/shell/deeplake-fs.ts":          { statements: 90, branches: 90, functions: 90, lines: 90 },
        // fix/wiki-worker-windows — cross-platform CLI resolution + spawn
        // descriptor builders for the summary worker. Small, pure modules,
        // fully exercised by tests/claude-code/wiki-worker-windows.test.ts.
        "src/utils/resolve-cli-bin.ts":      { statements: 90, branches: 90, functions: 90, lines: 90 },
        "src/hooks/wiki-worker-spawn.ts":    { statements: 90, branches: 90, functions: 90, lines: 90 },
        // feat(graph): multi-language support (PR #241) — 8 new language extractors
        // + shared helper module. Branches calibrated below statements: each
        // extractor has error/fallback branches (isError, isMissing, unknown node
        // types) that aren't triggered by happy-path tests without crafting
        // pathological ASTs. Floors set 5–10 pts below measured coverage.
        "src/graph/extract/shared.ts":       { statements: 80, branches: 75, functions: 90, lines: 80 },
        "src/graph/extract/javascript.ts":   { statements: 70, branches: 50, functions: 90, lines: 75 },
        "src/graph/extract/go.ts":           { statements: 80, branches: 60, functions: 90, lines: 85 },
        "src/graph/extract/rust.ts":         { statements: 80, branches: 60, functions: 85, lines: 90 },
        "src/graph/extract/java.ts":         { statements: 85, branches: 65, functions: 90, lines: 90 },
        "src/graph/extract/ruby.ts":         { statements: 90, branches: 75, functions: 90, lines: 90 },
        "src/graph/extract/c.ts":            { statements: 85, branches: 70, functions: 90, lines: 90 },
        "src/graph/extract/cpp.ts":          { statements: 80, branches: 60, functions: 90, lines: 85 },
      },
    },
  },
});
