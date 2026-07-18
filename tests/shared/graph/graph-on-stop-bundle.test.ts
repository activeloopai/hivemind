import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Bundle-level guard for the graph-on-stop tree-sitter regression.
 *
 * The bug: graph-on-stop's build path statically imports `tree-sitter` (a
 * native optionalDependency). When esbuild bundles that chain into the entry,
 * it hoists `import ... from "tree-sitter"` to the TOP of the entry file, so
 * Node resolves it at MODULE LOAD — before main()'s try/catch runs. On an
 * install without the grammar, the Stop hook exits 1 (ERR_MODULE_NOT_FOUND).
 *
 * The fix builds graph-on-stop as its own `splitting: true` bundle so the
 * `await import("../commands/graph.js")` stays a runtime chunk load and the
 * tree-sitter statics live only in graph-chunks/. These assertions FAIL if
 * splitting is dropped or the tree-sitter chain leaks back into the entry —
 * the exact regression the unit test (which injects runBuildCommand) can't see.
 *
 * Scans the SHIPPED artifacts, so it also catches a stale build that didn't
 * regenerate. Skips a harness whose bundle isn't built (bundles are untracked;
 * run `npm run build` first — the harness with no bundle just isn't asserted).
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");
const HARNESSES = ["claude-code", "codex", "cursor", "hermes"];

describe("graph-on-stop shipped bundle (tree-sitter isolation)", () => {
  const built = HARNESSES.map((h) => ({
    harness: h,
    entry: join(REPO_ROOT, "harnesses", h, "bundle", "graph-on-stop.js"),
    chunkDir: join(REPO_ROOT, "harnesses", h, "bundle", "graph-chunks"),
  })).filter((b) => existsSync(b.entry));

  it("has at least one built harness bundle to check", () => {
    // Guards against the glob silently matching nothing (e.g. path drift) and
    // the suite reporting green without asserting anything.
    expect(built.length).toBeGreaterThan(0);
  });

  for (const b of built) {
    describe(b.harness, () => {
      const entrySrc = readFileSync(b.entry, "utf8");

      it("entry does NOT statically import tree-sitter", () => {
        // Any `from "tree-sitter..."` in the entry means the native import was
        // hoisted to module top → the exact load-time crash we fixed.
        expect(entrySrc).not.toMatch(/from\s*["']tree-sitter/);
      });

      it("entry loads the build path via a lazy graph-chunks/ import", () => {
        expect(entrySrc).toMatch(/import\(\s*["']\.\/graph-chunks\/graph-[^"']+\.js["']\s*\)/);
      });

      it("tree-sitter lives only in the lazy graph chunk", () => {
        expect(existsSync(b.chunkDir)).toBe(true);
        const chunks = readdirSync(b.chunkDir).filter((f) => f.endsWith(".js"));
        const withTreeSitter = chunks.filter((f) =>
          /from\s*["']tree-sitter/.test(readFileSync(join(b.chunkDir, f), "utf8")),
        );
        // At least one chunk must carry the grammar imports (proves they were
        // split out, not dropped), and the entry proved they're not inline.
        expect(withTreeSitter.length).toBeGreaterThan(0);
      });
    });
  }
});
