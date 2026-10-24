import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

/**
 * Tests for the disk-side of src/cli/install-pi.ts. The pure helpers
 * (`upsertHivemindBlock`, `stripHivemindBlock`) already have coverage
 * in install-helpers.test.ts. Here we drive installPi / uninstallPi
 * end-to-end against a tmp ~/.pi/agent/ tree, exercising:
 *   - AGENTS.md create + idempotent re-install
 *   - extension copy + version stamp
 *   - legacy SKILL.md cleanup
 *   - uninstall preserving non-hivemind AGENTS.md content
 */

let tmpRoot: string;
let tmpHome: string;
let tmpPkg: string;

beforeEach(() => {
  tmpRoot = join(tmpdir(), `hm-pi-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tmpHome = join(tmpRoot, "home");
  tmpPkg = join(tmpRoot, "pkg");
  mkdirSync(tmpHome, { recursive: true });

  mkdirSync(join(tmpPkg, "harnesses", "pi", "extension-source"), { recursive: true });
  writeFileSync(join(tmpPkg, "harnesses", "pi", "extension-source", "hivemind.ts"), "// fake pi extension");
  writeFileSync(join(tmpPkg, "package.json"), JSON.stringify({ version: "7.7.7" }));

  setFakeHome(tmpHome);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  clearFakeHome();
  vi.restoreAllMocks();
  vi.resetModules();
});

async function importInstaller(): Promise<typeof import("../../src/cli/install-pi.js")> {
  vi.resetModules();
  vi.doMock("../../src/cli/util.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/cli/util.js")>();
    return { ...actual, pkgRoot: () => tmpPkg };
  });
  return await import("../../src/cli/install-pi.js");
}

const BEGIN = "<!-- BEGIN hivemind-memory -->";
const END = "<!-- END hivemind-memory -->";

// Exact bytes written by the two Pi installer revisions that shipped a
// per-agent skill (3b7d8a01 and 5ba761c0). These fixtures protect the legacy
// migration without treating the shared Pi version stamp as skill ownership.
const LEGACY_SKILL_V2 = `---
name: hivemind-memory
description: Global team and org memory powered by Activeloop. Always check both local context AND Hivemind memory when recalling information.
---

# Hivemind Memory

You have persistent memory at \`~/.deeplake/memory/\` — global memory shared across all sessions, users, and agents in the org.

## Memory Structure

\`\`\`
~/.deeplake/memory/
├── index.md                          ← START HERE — table of all sessions
├── summaries/
│   ├── session-abc.md                ← AI-generated wiki summary
│   └── session-xyz.md
└── sessions/
    └── username/
        ├── user_org_ws_slug1.jsonl   ← raw session data
        └── user_org_ws_slug2.jsonl
\`\`\`

## How to Search

1. **First**: Read \`~/.deeplake/memory/index.md\` — quick scan of all sessions with dates, projects, descriptions
2. **If you need details**: Read the specific summary at \`~/.deeplake/memory/summaries/<session>.md\`
3. **If you need raw data**: Read the session JSONL at \`~/.deeplake/memory/sessions/<user>/<file>.jsonl\`
4. **Keyword search**: \`grep -r "keyword" ~/.deeplake/memory/\`

Do NOT jump straight to reading raw JSONL files. Always start with index.md and summaries.

## Important Constraints

- Use \`grep\` (NOT \`rg\`/ripgrep) for keyword search — \`rg\` may not be installed on the host system.
- Only use these bash builtins to interact with \`~/.deeplake/memory/\`: \`cat\`, \`ls\`, \`grep\`, \`echo\`, \`jq\`, \`head\`, \`tail\`, \`sed\`, \`awk\`, \`wc\`, \`sort\`, \`find\`. The memory filesystem does NOT support \`rg\`, \`python\`, \`python3\`, \`node\`, or \`curl\`.
- If a file returns empty after 2 attempts, skip it and move on. Report what you found rather than retrying exhaustively.
`;

const LEGACY_SKILL_V1 = LEGACY_SKILL_V2.replace(
  "- Use `grep` (NOT `rg`/ripgrep) for keyword search — `rg` may not be installed on the host system.\n- Only use these bash builtins to interact with `~/.deeplake/memory/`: `cat`, `ls`, `grep`, `echo`, `jq`, `head`, `tail`, `sed`, `awk`, `wc`, `sort`, `find`. The memory filesystem does NOT support `rg`, `python`, `python3`, `node`, or `curl`.",
  "- Only use bash builtins (`cat`, `ls`, `grep`, `echo`, `jq`, `head`, `tail`, `sed`, `awk`, `wc`, `sort`, `find`) to interact with `~/.deeplake/memory/`. The memory filesystem does NOT support `python`, `python3`, `node`, or `curl`.",
);

describe("installPi — cold install", () => {
  it("creates AGENTS.md with exactly one hivemind marker pair", async () => {
    const { installPi } = await importInstaller();
    installPi();
    const agents = readFileSync(join(tmpHome, ".pi", "agent", "AGENTS.md"), "utf-8");
    expect(agents).toContain(BEGIN);
    expect(agents).toContain(END);
    expect((agents.match(new RegExp(BEGIN, "g")) ?? []).length).toBe(1);
  });

  it("copies the extension source verbatim", async () => {
    const { installPi } = await importInstaller();
    installPi();
    const dst = readFileSync(join(tmpHome, ".pi", "agent", "extensions", "hivemind.ts"), "utf-8");
    expect(dst).toBe("// fake pi extension");
  });

  it("stamps the version under the .hivemind sentinel directory", async () => {
    const { installPi } = await importInstaller();
    installPi();
    expect(readFileSync(join(tmpHome, ".pi", "agent", ".hivemind", ".hivemind_version"), "utf-8"))
      .toBe("7.7.7");
  });

  it("throws with a 'reinstall the package' hint when the extension source is absent", async () => {
    rmSync(join(tmpPkg, "harnesses", "pi", "extension-source"), { recursive: true, force: true });
    const { installPi } = await importInstaller();
    expect(() => installPi()).toThrow(/pi extension source missing/);
    expect(() => installPi()).toThrow(/Reinstall the @deeplake\/hivemind package/);
  });
});

describe("installPi — re-install / cleanup", () => {
  it("preserves a user's pre-existing AGENTS.md content; appends the hivemind block once", async () => {
    mkdirSync(join(tmpHome, ".pi", "agent"), { recursive: true });
    writeFileSync(join(tmpHome, ".pi", "agent", "AGENTS.md"), "# My Pi notes\nUser content here.\n");
    const { installPi } = await importInstaller();
    installPi();
    const agents = readFileSync(join(tmpHome, ".pi", "agent", "AGENTS.md"), "utf-8");
    expect(agents).toContain("# My Pi notes");
    expect(agents).toContain("User content here.");
    expect((agents.match(new RegExp(BEGIN, "g")) ?? []).length).toBe(1);
  });

  it("re-running installPi 5x produces exactly one block (idempotent)", async () => {
    const { installPi } = await importInstaller();
    for (let i = 0; i < 5; i++) installPi();
    const agents = readFileSync(join(tmpHome, ".pi", "agent", "AGENTS.md"), "utf-8");
    expect((agents.match(new RegExp(BEGIN, "g")) ?? []).length).toBe(1);
    expect((agents.match(new RegExp(END, "g")) ?? []).length).toBe(1);
  });

  it.each([LEGACY_SKILL_V1, LEGACY_SKILL_V2])(
    "cleans up an unmodified legacy per-agent SKILL.md drop on install",
    async (legacySkillBody) => {
      // Older installer dropped a SKILL.md under skills/hivemind-memory/ —
      // now removed because pi reads the shared agentskills location too,
      // creating a collision with the codex installer.
      const legacy = join(tmpHome, ".pi", "agent", "skills", "hivemind-memory");
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, "SKILL.md"), legacySkillBody);
      const { installPi } = await importInstaller();
      installPi();
      expect(existsSync(legacy)).toBe(false);
    },
  );

  it("preserves all user files despite an old global Hivemind version stamp", async () => {
    const legacy = join(tmpHome, ".pi", "agent", "skills", "hivemind-memory");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "SKILL.md"), "user-authored skill");
    writeFileSync(join(legacy, "notes.txt"), "user notes");
    mkdirSync(join(tmpHome, ".pi", "agent", ".hivemind"), { recursive: true });
    writeFileSync(join(tmpHome, ".pi", "agent", ".hivemind", ".hivemind_version"), "6.0.0\n");
    const { installPi, uninstallPi } = await importInstaller();
    installPi();
    expect(readFileSync(join(legacy, "SKILL.md"), "utf-8")).toBe("user-authored skill");
    expect(readFileSync(join(legacy, "notes.txt"), "utf-8")).toBe("user notes");

    uninstallPi();
    expect(readFileSync(join(legacy, "SKILL.md"), "utf-8")).toBe("user-authored skill");
    expect(readFileSync(join(legacy, "notes.txt"), "utf-8")).toBe("user notes");
    expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("remove it manually"));
  });

  it("preserves a modified historical skill instead of adopting it", async () => {
    const legacy = join(tmpHome, ".pi", "agent", "skills", "hivemind-memory");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "SKILL.md"), `${LEGACY_SKILL_V2}\n# My customization\n`);
    const { installPi } = await importInstaller();
    installPi();
    expect(readFileSync(join(legacy, "SKILL.md"), "utf-8")).toContain("# My customization");
  });

  it("preserves a legacy skill directory containing any extra file", async () => {
    const legacy = join(tmpHome, ".pi", "agent", "skills", "hivemind-memory");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "SKILL.md"), LEGACY_SKILL_V2);
    writeFileSync(join(legacy, "user.txt"), "keep me");
    const { installPi } = await importInstaller();
    installPi();
    expect(readFileSync(join(legacy, "SKILL.md"), "utf-8")).toBe(LEGACY_SKILL_V2);
    expect(readFileSync(join(legacy, "user.txt"), "utf-8")).toBe("keep me");
  });

  it("preserves symlinks and file/directory mismatches at the legacy path", async () => {
    const skills = join(tmpHome, ".pi", "agent", "skills");
    const legacy = join(skills, "hivemind-memory");
    const userSkill = join(tmpHome, "user-skill");
    mkdirSync(userSkill, { recursive: true });
    writeFileSync(join(userSkill, "SKILL.md"), LEGACY_SKILL_V2);
    mkdirSync(skills, { recursive: true });
    symlinkSync(userSkill, legacy);

    const { installPi, uninstallPi } = await importInstaller();
    installPi();
    expect(lstatSync(legacy).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(userSkill, "SKILL.md"), "utf-8")).toBe(LEGACY_SKILL_V2);
    uninstallPi();
    expect(lstatSync(legacy).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(userSkill, "SKILL.md"), "utf-8")).toBe(LEGACY_SKILL_V2);

    rmSync(legacy);
    writeFileSync(legacy, LEGACY_SKILL_V2);
    installPi();
    expect(lstatSync(legacy).isFile()).toBe(true);
    expect(readFileSync(legacy, "utf-8")).toBe(LEGACY_SKILL_V2);
    uninstallPi();
    expect(lstatSync(legacy).isFile()).toBe(true);
    expect(readFileSync(legacy, "utf-8")).toBe(LEGACY_SKILL_V2);
  });
});

describe("uninstallPi", () => {
  it("strips the hivemind block from AGENTS.md while preserving user content", async () => {
    mkdirSync(join(tmpHome, ".pi", "agent"), { recursive: true });
    writeFileSync(
      join(tmpHome, ".pi", "agent", "AGENTS.md"),
      `# Header\nuser line\n\n${BEGIN}\nstale\n${END}\n\n## After\nmore user\n`,
    );
    const { uninstallPi } = await importInstaller();
    uninstallPi();
    const agents = readFileSync(join(tmpHome, ".pi", "agent", "AGENTS.md"), "utf-8");
    expect(agents).not.toContain(BEGIN);
    expect(agents).not.toContain(END);
    expect(agents).toContain("# Header");
    expect(agents).toContain("user line");
    expect(agents).toContain("more user");
  });

  it("removes AGENTS.md when nothing remains after stripping", async () => {
    const { installPi, uninstallPi } = await importInstaller();
    installPi();
    uninstallPi();
    expect(existsSync(join(tmpHome, ".pi", "agent", "AGENTS.md"))).toBe(false);
  });

  it("removes the extension file and the version sentinel dir", async () => {
    const { installPi, uninstallPi } = await importInstaller();
    installPi();
    uninstallPi();
    expect(existsSync(join(tmpHome, ".pi", "agent", "extensions", "hivemind.ts"))).toBe(false);
    expect(existsSync(join(tmpHome, ".pi", "agent", ".hivemind"))).toBe(false);
  });

  it("removes an unmodified legacy SKILL.md drop if it survived from an older installer", async () => {
    const legacy = join(tmpHome, ".pi", "agent", "skills", "hivemind-memory");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "SKILL.md"), LEGACY_SKILL_V2);
    const { uninstallPi } = await importInstaller();
    uninstallPi();
    expect(existsSync(legacy)).toBe(false);
  });

  it("is a no-op when nothing exists (cold uninstall)", async () => {
    const { uninstallPi } = await importInstaller();
    expect(() => uninstallPi()).not.toThrow();
  });
});
