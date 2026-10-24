import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changedFilesFromGit, expandToCandidateFiles } from "../../src/docs/candidates.js";
import type { GraphNode, GraphSnapshot } from "../../src/graph/types.js";

function node(id: string, source_file: string): GraphNode {
  return { id, label: id, kind: "function", source_file, source_location: "L1", language: "typescript", exported: true };
}
function snap(nodes: GraphNode[], links: Array<{ source: string; target: string; relation: string }> = []): GraphSnapshot {
  return { nodes, links } as unknown as GraphSnapshot;
}

const WORKING_TREE = "diff --name-only -z --no-renames HEAD";
const LAST_COMMIT = "diff --name-only -z --no-renames HEAD~1 HEAD";
const UNTRACKED = "ls-files --full-name -z --others --exclude-standard";

describe("changedFilesFromGit", () => {
  it("unions working-tree changes with the last commit, deduped", async () => {
    const git = vi.fn((args: string[]) => {
      if (args.join(" ") === WORKING_TREE) return "src/money.ts\0src/cart.ts\0";
      if (args.join(" ") === LAST_COMMIT) return "src/cart.ts\0src/util.ts\0";
      return "";
    });
    const out = changedFilesFromGit("/x", git)!;
    expect(new Set(out)).toEqual(new Set(["src/money.ts", "src/cart.ts", "src/util.ts"]));
  });

  it("asks every pathname-producing git call for NUL-delimited output, and diffs without rename detection", () => {
    const git = vi.fn((_args: string[]) => "");
    changedFilesFromGit("/x", git);
    const calls = git.mock.calls.map(([args]) => args.join(" "));
    expect(calls).toEqual([WORKING_TREE, UNTRACKED, LAST_COMMIT]);
  });

  it("keeps entries exactly as git reports them — no trimming, no newline splitting", () => {
    const git = vi.fn((args: string[]) => {
      if (args.join(" ") === WORKING_TREE) return " lead.ts\0trail.ts \0a b.ts\0line\nbreak.ts\0";
      if (args.join(" ") === UNTRACKED) return "日本語.ts\0";
      return "";
    });
    expect(changedFilesFromGit("/x", git)).toEqual([" lead.ts", "trail.ts ", "a b.ts", "line\nbreak.ts", "日本語.ts"]);
  });

  it("returns null when git is unavailable (→ caller does a full scan)", () => {
    const git = vi.fn(() => null); // not a repo / git missing
    expect(changedFilesFromGit("/x", git)).toBeNull();
  });

  it("returns [] when git works but nothing changed", () => {
    const git = vi.fn(() => "");
    expect(changedFilesFromGit("/x", git)).toEqual([]);
  });

  it("includes untracked (new, non-ignored) files — the new-file case", () => {
    const git = vi.fn((args: string[]) => (args.join(" ") === UNTRACKED ? "src/tax.ts\0" : ""));
    expect(changedFilesFromGit("/x", git)).toEqual(["src/tax.ts"]);
  });
});

// Real repositories, each in its own temp dir. Global/system git config is
// replaced with an empty file, discovery can't climb out of the fixture, and
// commits run with hooks and signing disabled — nothing outside the temp dir
// is read or written.
describe("changedFilesFromGit against real temporary git repositories", () => {
  const ISOLATED_ENV_VARS = [
    "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM", "GIT_CEILING_DIRECTORIES",
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR",
    "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS",
  ];
  let root: string;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hm-docs-candidates-"));
    const emptyConfig = join(root, "empty-gitconfig");
    writeFileSync(emptyConfig, "");
    savedEnv = {};
    for (const k of ISOLATED_ENV_VARS) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    process.env.GIT_CONFIG_GLOBAL = emptyConfig;
    process.env.GIT_CONFIG_SYSTEM = emptyConfig;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    process.env.GIT_CEILING_DIRECTORIES = root;
  });

  afterEach(() => {
    for (const k of ISOLATED_ENV_VARS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    rmSync(root, { recursive: true, force: true });
  });

  function makeRepo(): { dir: string; g: (args: string[]) => string; write: (rel: string, body: string) => void; commit: (msg: string) => void } {
    const dir = join(root, "repo");
    mkdirSync(dir);
    const hooks = join(root, "no-hooks");
    mkdirSync(hooks);
    const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    g(["init", "-q"]);
    g(["config", "user.email", "t@example.invalid"]);
    g(["config", "user.name", "t"]);
    g(["config", "commit.gpgsign", "false"]);
    g(["config", "core.hooksPath", hooks]);
    const write = (rel: string, body: string) => {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    };
    const commit = (msg: string) => {
      g(["add", "-A"]);
      g(["commit", "-q", "--no-verify", "--no-gpg-sign", "-m", msg]);
    };
    return { dir, g, write, commit };
  }

  const DOC_BODY = "# Guide\n\nThis content is long enough to be detected as an exact rename.\n";

  it("staged rename reports both the old and the new path", () => {
    const { dir, g, write, commit } = makeRepo();
    write("docs/old.md", DOC_BODY);
    write("src/a.ts", "export const a = 1;\n");
    commit("init");
    write("src/b.ts", "export const b = 1;\n");
    commit("second"); // HEAD~1..HEAD touches only src/b.ts
    g(["mv", "docs/old.md", "docs/new.md"]);
    const out = new Set(changedFilesFromGit(dir));
    expect(out).toEqual(new Set(["docs/old.md", "docs/new.md", "src/b.ts"]));
  });

  it("committed rename (clean tree, post-commit path) reports both the old and the new path", () => {
    const { dir, g, write, commit } = makeRepo();
    write("docs/old.md", DOC_BODY);
    commit("init");
    g(["mv", "docs/old.md", "docs/new.md"]);
    commit("rename");
    expect(new Set(changedFilesFromGit(dir))).toEqual(new Set(["docs/old.md", "docs/new.md"]));
  });

  it("committed rename feeds expandToCandidateFiles, which keeps the deleted old path and its callers", () => {
    const { dir, g, write, commit } = makeRepo();
    write("src/money.ts", "export function addTax() { return 1; }\n");
    write("src/cart.ts", "import { addTax } from './money';\nexport const total = addTax();\n");
    commit("init");
    g(["mv", "src/money.ts", "src/pricing.ts"]);
    commit("rename");
    const changed = changedFilesFromGit(dir)!;
    // The stored graph still describes the pre-rename layout.
    const s = snap(
      [node("src/money.ts:addTax:function", "src/money.ts"), node("src/cart.ts:total:function", "src/cart.ts")],
      [{ source: "src/cart.ts:total:function", target: "src/money.ts:addTax:function", relation: "calls" }],
    );
    const out = new Set(expandToCandidateFiles(s, changed));
    expect(out.has("src/money.ts")).toBe(true);   // deleted old path — its docs must be revisited
    expect(out.has("src/pricing.ts")).toBe(true); // new path
    expect(out.has("src/cart.ts")).toBe(true);    // caller of the old path's symbol
  });

  it("preserves spaces, Unicode and (where the filesystem allows) newlines from all three git sources", () => {
    const { dir, write, commit } = makeRepo();
    const newlineOk = process.platform !== "win32";
    const committedName = "src/日本語 notes.ts";
    const trackedName = " lead  space.ts"; // leading space: a trim() would corrupt it
    const untrackedName = "docs/café guide.md".normalize("NFC");
    const newlineName = "src/line\nbreak.ts";
    write("seed.txt", "seed\n");
    write(trackedName, "export const x = 1;\n");
    commit("init");
    write(committedName, "export const y = 1;\n");
    if (newlineOk) write(newlineName, "export const z = 1;\n");
    commit("unusual names"); // HEAD~1..HEAD
    write(trackedName, "export const x = 2;\n"); // working-tree edit
    write(untrackedName, "# new\n"); // untracked
    const out = changedFilesFromGit(dir)!;
    const expected = [committedName, trackedName, untrackedName, ...(newlineOk ? [newlineName] : [])];
    expect(new Set(out)).toEqual(new Set(expected));
    for (const f of out) expect(f).not.toMatch(/^"|\\\d{3}/); // never Git's C-quoted form
  });

  it("reports untracked paths when nothing tracked changed", () => {
    const { dir, write, commit } = makeRepo();
    write("a.ts", "export const a = 1;\n");
    commit("init");
    write("fresh dir/new file.ts", "export const n = 1;\n");
    expect(changedFilesFromGit(dir)).toEqual(["fresh dir/new file.ts"]);
  });

  it("reports untracked filenames relative to the repository root from a nested cwd", () => {
    const { dir, write, commit } = makeRepo();
    write("src/existing.ts", "export const value = 1;\n");
    commit("init");
    write("src/new file.ts", "export const value = 2;\n");
    expect(changedFilesFromGit(join(dir, "src"))).toEqual(["src/new file.ts"]);
  });

  it("clean repo with a single commit returns [] (not null)", () => {
    const { dir, write, commit } = makeRepo();
    write("a.ts", "export const a = 1;\n");
    commit("init");
    expect(changedFilesFromGit(dir)).toEqual([]);
  });

  it("clean repo reports exactly the files touched by the last commit", () => {
    const { dir, write, commit } = makeRepo();
    write("a.ts", "export const a = 1;\n");
    write("b.ts", "export const b = 1;\n");
    commit("init");
    write("b.ts", "export const b = 2;\n");
    commit("edit b");
    expect(changedFilesFromGit(dir)).toEqual(["b.ts"]);
  });

  it("a directory that is not a git repository returns null", () => {
    const dir = join(root, "plain");
    mkdirSync(dir);
    expect(changedFilesFromGit(dir)).toBeNull();
  });
});

describe("expandToCandidateFiles", () => {
  // cart.ts:total calls money.ts:addTax  → editing money.ts must pull cart.ts in.
  const s = snap(
    [node("src/money.ts:addTax:function", "src/money.ts"), node("src/cart.ts:total:function", "src/cart.ts"), node("src/other.ts:x:function", "src/other.ts")],
    [{ source: "src/cart.ts:total:function", target: "src/money.ts:addTax:function", relation: "calls" }],
  );

  it("includes the changed file AND its transitive callers", () => {
    const out = new Set(expandToCandidateFiles(s, ["src/money.ts"]));
    expect(out.has("src/money.ts")).toBe(true);  // the changed file
    expect(out.has("src/cart.ts")).toBe(true);   // caller of addTax
    expect(out.has("src/other.ts")).toBe(false); // unrelated → not loaded
  });

  it("returns just the changed files when they define no graph symbols", () => {
    expect(expandToCandidateFiles(s, ["README.md"])).toEqual(["README.md"]);
  });

  it("retains a deleted/renamed-away path even when the graph no longer has nodes for it", () => {
    // Graph rebuilt after the rename: only the new path has nodes.
    const rebuilt = snap([node("src/pricing.ts:addTax:function", "src/pricing.ts")]);
    const out = new Set(expandToCandidateFiles(rebuilt, ["src/money.ts", "src/pricing.ts"]));
    expect(out).toEqual(new Set(["src/money.ts", "src/pricing.ts"]));
  });
});
