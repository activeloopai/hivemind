import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";

// Regression test for the static tree-sitter import bug (PR #295).
//
// Root cause: esbuild hoisted `import "tree-sitter"` to the top of
// bundle/cli.js even though the module was only used inside commands/graph.js.
// When the optional tree-sitter native addon failed to build (e.g. Node 24 +
// arm64 where no prebuild exists), EVERY hivemind command — including `install`
// — crashed with ERR_MODULE_NOT_FOUND at load time. The installer would appear
// to succeed, but hivemind was dead on first run.
//
// Fix: lazy `import()` of commands/graph.js + esbuild `splitting: true`.
// These tests exercise the bundle as a subprocess so they catch load-time
// crashes that `node --check` (syntax-only) cannot detect.

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const CLI = join(REPO_ROOT, "bundle/cli.js");
const TREE_SITTER_NM = join(REPO_ROOT, "node_modules/tree-sitter");
const TREE_SITTER_NM_HIDDEN = join(REPO_ROOT, "node_modules/.tree-sitter-absent");

const bundleBuilt = existsSync(CLI);

function runCli(args: string[]) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env },
  });
}

describe.skipIf(!bundleBuilt)(
  "CLI bundle runtime smoke test (requires: npm run build)",
  () => {
    describe("tree-sitter present — normal path", () => {
      it("--version exits 0", () => {
        const r = runCli(["--version"]);
        expect(r.status).toBe(0);
        expect(r.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
      });

      it("help exits 0", () => {
        const r = runCli(["help"]);
        expect(r.status).toBe(0);
      });
    });

    describe("tree-sitter absent — optional dep not available", () => {
      const treeSitterWasPresent = existsSync(TREE_SITTER_NM);

      beforeAll(() => {
        if (treeSitterWasPresent) renameSync(TREE_SITTER_NM, TREE_SITTER_NM_HIDDEN);
      });

      afterAll(() => {
        if (treeSitterWasPresent && existsSync(TREE_SITTER_NM_HIDDEN)) {
          renameSync(TREE_SITTER_NM_HIDDEN, TREE_SITTER_NM);
        }
      });

      it("--version exits 0 — no ERR_MODULE_NOT_FOUND crash (regression: PR #295)", () => {
        // Before the fix, bundle/cli.js had a top-level `import "tree-sitter"`
        // (hoisted by esbuild), so the process exited with ERR_MODULE_NOT_FOUND
        // before any command handler ran.
        const r = runCli(["--version"]);
        expect(r.status).toBe(0);
        expect(r.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
      });

      it("help exits 0 — load-time crash does not affect non-graph commands", () => {
        const r = runCli(["help"]);
        expect(r.status).toBe(0);
      });

      it("graph exits 1 with a friendly user message, not an uncaught exception", () => {
        const r = runCli(["graph"]);
        // Must be a handled exit — process.exit(1), not an unhandled crash.
        expect(r.status).toBe(1);
        // The error message must mention tree-sitter so the user knows why.
        expect(r.stderr).toContain("tree-sitter");
        // Must NOT be Node.js's raw ERR_MODULE_NOT_FOUND (which would print a
        // full stack trace and exit(1) via uncaughtException — a crash, not a
        // graceful degradation).
        expect(r.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
        expect(r.stderr).not.toContain("at node:internal");
      });
    });
  },
);
