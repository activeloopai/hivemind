import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the SSO/plugin-install failure where
// `claude plugin install hivemind` died with:
//   "Subdirectory 'claude-code' not found in repository ... at the specified ref/s"
//
// Root cause: commit 0fdfe698 ("consolidate agent harnesses under harnesses/")
// moved claude-code/ -> harnesses/claude-code/, but `.claude-plugin/marketplace.json`
// still pinned source.path = "claude-code". The release workflow only rewrites
// source.sha, never source.path, so the stale path shipped to every user.
//
// Invariant: the git-subdir source.path MUST point at a real plugin directory
// in this repo (one that contains .claude-plugin/plugin.json). Because each
// release commit is built from this working tree, working-tree correctness
// implies the pinned-sha checkout will also resolve.

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");

describe("marketplace.json git-subdir source.path", () => {
  const marketplace = JSON.parse(
    readFileSync(resolve(repoRoot, ".claude-plugin/marketplace.json"), "utf-8"),
  );

  it("points every git-subdir plugin at a directory that exists and is a plugin", () => {
    expect(Array.isArray(marketplace.plugins)).toBe(true);
    expect(marketplace.plugins.length).toBeGreaterThan(0);

    for (const plugin of marketplace.plugins) {
      const src = plugin.source;
      if (!src || src.source !== "git-subdir") continue;

      const dir = resolve(repoRoot, src.path);
      expect(existsSync(dir), `marketplace path "${src.path}" must exist in repo`).toBe(true);

      const manifest = resolve(dir, ".claude-plugin/plugin.json");
      expect(
        existsSync(manifest),
        `marketplace path "${src.path}" must contain .claude-plugin/plugin.json`,
      ).toBe(true);
    }
  });

  it("does NOT use the pre-consolidation root path 'claude-code'", () => {
    for (const plugin of marketplace.plugins) {
      expect(plugin.source?.path).not.toBe("claude-code");
    }
  });
});
