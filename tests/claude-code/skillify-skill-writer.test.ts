import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import {
  writeNewSkill,
  mergeSkill,
  composeDescription,
  parseFrontmatter,
  listSkills,
  resolveSkillsRoot,
  assertValidSkillName,
  capSkillName,
  MAX_SKILL_NAME_LEN,
} from "../../src/skillify/skill-writer.js";

let projectRoot: string;
let skillsRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), "skillify-skill-writer-"));
  skillsRoot = join(projectRoot, ".claude", "skills");
});

afterEach(() => {
  try { rmSync(projectRoot, { recursive: true, force: true }); } catch { /* nothing */ }
});

const VALID_BODY = `## When to use\n\nFor X.\n\n## Workflow\n\nStep 1.\n\n## Anti-patterns\n\n- Don't Y.`;

describe("writeNewSkill", () => {
  it("creates SKILL.md with frontmatter + body, version=1", () => {
    const result = writeNewSkill({
      skillsRoot,
      name: "my-skill",
      description: "Does X",
      trigger: "When X happens",
      body: VALID_BODY,
      sourceSessions: ["s1", "s2"],
      agent: "claude_code",
    });

    expect(result.action).toBe("created");
    expect(result.version).toBe(1);
    expect(result.path).toBe(join(skillsRoot, "my-skill", "SKILL.md"));
    expect(existsSync(result.path)).toBe(true);
    // Caller (the worker → Deeplake INSERT) needs createdAt/updatedAt back.
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.updatedAt).toBe(result.createdAt);

    const text = readFileSync(result.path, "utf-8");
    expect(text).toContain("name: my-skill");
    // The trigger is folded into the host-visible description (the host reads
    // `description`, not `trigger`); the raw trigger field is still written.
    expect(text).toContain(`description: "Does X. Use this skill when X happens"`);
    expect(text).toContain(`trigger: "When X happens"`);
    expect(text).toContain("version: 1");
    expect(text).toContain("created_by_agent: claude_code");
    expect(text).toContain("- s1");
    expect(text).toContain("- s2");
    expect(text).toContain("## Workflow");
  });

  it("throws when the skill already exists", () => {
    writeNewSkill({ skillsRoot, name: "dup", description: "", body: VALID_BODY, sourceSessions: [], agent: "x" });
    expect(() =>
      writeNewSkill({ skillsRoot, name: "dup", description: "", body: VALID_BODY, sourceSessions: [], agent: "x" })
    ).toThrow(/already exists/);
  });

  it("creates parent directory if missing", () => {
    const result = writeNewSkill({
      skillsRoot, name: "n", description: "", body: VALID_BODY, sourceSessions: [], agent: "x",
    });
    expect(existsSync(join(skillsRoot, "n"))).toBe(true);
    expect(existsSync(result.path)).toBe(true);
  });

  it("length-caps an over-long name and returns the canonical name", () => {
    const long = "pg-deeplake-multi-layer-issue-diagnosis-and-workaround-prioritization";
    const result = writeNewSkill({
      skillsRoot, name: long, description: "", body: VALID_BODY, sourceSessions: [], agent: "x",
    });
    // result.name is the capped on-disk name (what callers must record) …
    expect(result.name.length).toBeLessThanOrEqual(64);
    expect(result.name).toBe(capSkillName(long));
    // … the dir + frontmatter use it, not the raw name.
    expect(existsSync(join(skillsRoot, result.name, "SKILL.md"))).toBe(true);
    expect(existsSync(join(skillsRoot, long))).toBe(false);
    const fm = readFileSync(join(skillsRoot, result.name, "SKILL.md"), "utf-8");
    expect(fm).toContain(`name: ${result.name}`);
  });

  it("validates the RAW name before capping — rejects an invalid truncated-away tail", () => {
    // First chars form a valid slug; the tail (dropped by capping) hides `..`.
    // Validating the capped prefix would miss it — writeNewSkill must see raw.
    const evil = "a".repeat(60) + "-b/../../x";
    expect(() =>
      writeNewSkill({ skillsRoot, name: evil, description: "", body: VALID_BODY, sourceSessions: [], agent: "x" })
    ).toThrow(/path separator|kebab-case/);
  });
});

describe("mergeSkill", () => {
  it("does NOT cap — updates a legacy >64-char target in place, no truncated fork", () => {
    // Round-1 regression: a MERGE into a pre-cap over-long skill must find and
    // update THAT dir (preserving version/lineage), not create a truncated v1.
    // Verified end-to-end against the real functions on a real FS (2026-07-20).
    const long = "pg-deeplake-multi-layer-issue-diagnosis-and-workaround-prioritization"; // 69 chars
    expect(long.length).toBeGreaterThan(64);
    mkdirSync(join(skillsRoot, long), { recursive: true });
    writeFileSync(join(skillsRoot, long, "SKILL.md"),
      `---\nname: ${long}\ndescription: old\nversion: 1\ncreated_by_agent: cc\ncreated_at: t\nupdated_at: t\n---\n\nlegacy body`);
    const before = listSkills(skillsRoot).length;

    const result = mergeSkill({
      skillsRoot, name: long, description: "new",
      body: "## Y\nmerged body", newSourceSessions: ["s2"], agent: "cc", editor: "bob",
    });

    // Target found + updated in place (uncapped), no new truncated dir.
    expect(result.name).toBe(long);
    expect(result.version).toBe(2);
    expect(result.path).toBe(join(skillsRoot, long, "SKILL.md"));
    expect(listSkills(skillsRoot).length).toBe(before);
    const text = readFileSync(join(skillsRoot, long, "SKILL.md"), "utf-8");
    expect(text).toContain("merged body");
    expect(text).toMatch(/^version: 2$/m);
  });

  it("bumps version, preserves created_at, updates updated_at, dedups source_sessions", () => {
    writeNewSkill({
      skillsRoot, name: "m", description: "v1 desc", body: "v1 body",
      sourceSessions: ["s1", "s2"], agent: "claude_code",
    });
    const v1Path = join(skillsRoot, "m", "SKILL.md");
    const v1Text = readFileSync(v1Path, "utf-8");
    const v1CreatedAt = v1Text.match(/^created_at:\s*(.*)$/m)?.[1];
    expect(v1CreatedAt).toBeTruthy();

    // Wait a millisecond so updated_at differs from created_at
    const start = Date.now();
    while (Date.now() === start) { /* spin */ }

    const result = mergeSkill({
      skillsRoot, name: "m", description: "v2 desc",
      body: "v2 merged body",
      newSourceSessions: ["s2", "s3"], // s2 is duplicate
      agent: "codex",
    });

    expect(result.action).toBe("merged");
    expect(result.version).toBe(2);
    // Worker passes result.createdAt straight to insertSkillRow — preserving
    // it across merges is what keeps the v=1 creation date in the skills
    // table (the previous behavior stamped now() on every INSERT, so every
    // row had created_at == updated_at).
    expect(result.createdAt).toBe(v1CreatedAt);
    expect(result.updatedAt).not.toBe(v1CreatedAt);

    const text = readFileSync(v1Path, "utf-8");
    expect(text).toContain("version: 2");
    expect(text).toContain(`description: "v2 desc"`);
    expect(text).toContain("v2 merged body");
    // created_at preserved, created_by_agent preserved (claude_code, not codex)
    expect(text).toContain(`created_at: ${v1CreatedAt}`);
    expect(text).toContain("created_by_agent: claude_code");
    // updated_at differs
    const updatedAt = text.match(/^updated_at:\s*(.*)$/m)?.[1];
    expect(updatedAt).not.toBe(v1CreatedAt);
    expect(result.updatedAt).toBe(updatedAt);

    // source_sessions: s1 (orig), s2 (dedup), s3 (new) — exactly 3 entries
    const sourceLines = (text.match(/^  - .+$/mg) ?? []);
    expect(sourceLines).toEqual(["  - s1", "  - s2", "  - s3"]);
  });

  it("throws when target skill does not exist (worker fallback uses this)", () => {
    expect(() =>
      mergeSkill({ skillsRoot, name: "missing", body: "x", newSourceSessions: [], agent: "x" })
    ).toThrow(/does not exist/);
  });

  it("preserves trigger from existing skill (gate's update is ignored)", () => {
    writeNewSkill({
      skillsRoot, name: "t", description: "", trigger: "original trigger",
      body: VALID_BODY, sourceSessions: [], agent: "x",
    });
    mergeSkill({ skillsRoot, name: "t", body: "new body", newSourceSessions: [], agent: "x" });
    const text = readFileSync(join(skillsRoot, "t", "SKILL.md"), "utf-8");
    expect(text).toContain(`trigger: "original trigger"`);
  });
});

describe("composeDescription (trigger → host-visible description)", () => {
  it("folds the trigger into the description as a 'Use this skill when' clause", () => {
    expect(composeDescription("Diagnose pg crashes", "When task pg:test cascades"))
      .toBe("Diagnose pg crashes. Use this skill when task pg:test cascades");
  });

  it("normalizes 'Use when X' / 'Use this skill when X' to a single clause", () => {
    expect(composeDescription("Build kernels", "Use when auditing CUDA paths"))
      .toBe("Build kernels. Use this skill when auditing CUDA paths");
    expect(composeDescription("Build kernels", "Use this skill when auditing CUDA paths"))
      .toBe("Build kernels. Use this skill when auditing CUDA paths");
  });

  it("returns the description unchanged when there is no trigger", () => {
    expect(composeDescription("Just a capability", "")).toBe("Just a capability");
    expect(composeDescription("Just a capability", undefined)).toBe("Just a capability");
  });

  it("returns just the trigger clause when the description is empty", () => {
    expect(composeDescription("", "When SDK open_table crashes"))
      .toBe("Use this skill when SDK open_table crashes");
  });

  it("is idempotent — re-composing an already-composed description is a no-op", () => {
    const once = composeDescription("Does X", "When Y happens");
    expect(composeDescription(once, "When Y happens")).toBe(once);
    // even when the trigger is re-phrased differently on a later render
    expect(composeDescription(once, "Use when Y happens")).toBe(once);
  });

  it("does not stack the clause across a writeNewSkill → mergeSkill roundtrip", () => {
    writeNewSkill({
      skillsRoot, name: "rt", description: "Capability", trigger: "When the thing breaks",
      body: VALID_BODY, sourceSessions: [], agent: "x",
    });
    mergeSkill({ skillsRoot, name: "rt", body: "new body", newSourceSessions: [], agent: "x" });
    const text = readFileSync(join(skillsRoot, "rt", "SKILL.md"), "utf-8");
    // exactly one occurrence — in the description line; the trigger field keeps
    // the raw "When the thing breaks" phrasing.
    expect((text.match(/Use this skill when/g) ?? []).length).toBe(1);
    expect(text).toContain(`description: "Capability. Use this skill when the thing breaks"`);
  });
});

describe("author + contributors (issue #118)", () => {
  it("writeNewSkill with author stamps frontmatter and seeds contributors=[author]", () => {
    const result = writeNewSkill({
      skillsRoot, name: "c1", description: "d", body: VALID_BODY,
      sourceSessions: [], agent: "x", author: "alice",
    });
    expect(result.author).toBe("alice");
    expect(result.contributors).toEqual(["alice"]);
    const text = readFileSync(result.path, "utf-8");
    expect(text).toContain("author: alice");
    // Contributors block is rendered with one entry — alice as the seed.
    expect(text).toMatch(/contributors:\n  - alice\n/);
  });

  it("writeNewSkill without author omits both fields (legacy/back-compat)", () => {
    const result = writeNewSkill({
      skillsRoot, name: "c2", description: "d", body: VALID_BODY,
      sourceSessions: [], agent: "x",
    });
    expect(result.author).toBeUndefined();
    expect(result.contributors).toEqual([]);
    const text = readFileSync(result.path, "utf-8");
    expect(text).not.toContain("author:");
    expect(text).not.toContain("contributors:");
  });

  it("mergeSkill with same author as v=1 does not duplicate the entry", () => {
    writeNewSkill({
      skillsRoot, name: "c3", description: "d", body: VALID_BODY,
      sourceSessions: [], agent: "x", author: "alice",
    });
    const result = mergeSkill({
      skillsRoot, name: "c3", body: "v2 body", newSourceSessions: [],
      agent: "x", editor: "alice",
    });
    // Same editor as author — list stays length-1.
    expect(result.contributors).toEqual(["alice"]);
    expect(result.author).toBe("alice");
    const text = readFileSync(result.path, "utf-8");
    // Exactly one entry under `contributors:`.
    expect(text.match(/contributors:\n((?:  - .+\n)+)/)?.[1].trim()).toBe("- alice");
  });

  it("mergeSkill by a different editor appends them — cross-author lineage recorded", () => {
    writeNewSkill({
      skillsRoot, name: "c4", description: "d", body: VALID_BODY,
      sourceSessions: [], agent: "x", author: "alice",
    });
    const result = mergeSkill({
      skillsRoot, name: "c4", body: "v2 body", newSourceSessions: [],
      agent: "x", editor: "emanuele",
    });
    expect(result.author).toBe("alice");
    // Order matters — author first, editor appended in arrival order.
    expect(result.contributors).toEqual(["alice", "emanuele"]);
    const text = readFileSync(result.path, "utf-8");
    expect(text).toContain("contributors:\n  - alice\n  - emanuele\n");
  });

  it("subsequent merge by the same editor does NOT duplicate them", () => {
    writeNewSkill({
      skillsRoot, name: "c5", description: "d", body: VALID_BODY,
      sourceSessions: [], agent: "x", author: "alice",
    });
    mergeSkill({
      skillsRoot, name: "c5", body: "v2", newSourceSessions: [],
      agent: "x", editor: "emanuele",
    });
    const result = mergeSkill({
      skillsRoot, name: "c5", body: "v3", newSourceSessions: [],
      agent: "x", editor: "emanuele",
    });
    expect(result.contributors).toEqual(["alice", "emanuele"]);
  });

  it("merging a legacy file (no author/contributors in frontmatter) does not invent an author", () => {
    // Write a SKILL.md by hand with the legacy frontmatter shape — no
    // author / contributors keys at all. mergeSkill must not retroactively
    // claim the editor wrote v=1.
    const legacy =
      `---\nname: legacy\ndescription: "old"\nsource_sessions:\n  - s1\nversion: 1\ncreated_by_agent: cc\ncreated_at: 2026\nupdated_at: 2026\n---\n\nold body`;
    const dir = join(skillsRoot, "legacy");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), legacy);
    const result = mergeSkill({
      skillsRoot, name: "legacy", body: "new body", newSourceSessions: [],
      agent: "x", editor: "emanuele",
    });
    // Author stays undefined (legacy row had none), but contributors
    // gets the editor — the new lineage starts here.
    expect(result.author).toBeUndefined();
    expect(result.contributors).toEqual(["emanuele"]);
  });
});

describe("parseFrontmatter", () => {
  it("parses standard frontmatter", () => {
    const text =
      `---\nname: x\ndescription: "d"\nsource_sessions:\n  - a\n  - b\nversion: 3\ncreated_by_agent: cc\ncreated_at: 2026\nupdated_at: 2026\n---\n\nbody here`;
    const parsed = parseFrontmatter(text);
    expect(parsed).not.toBeNull();
    expect(parsed!.fm.name).toBe("x");
    expect(parsed!.fm.description).toBe("d");
    expect(parsed!.fm.source_sessions).toEqual(["a", "b"]);
    expect(parsed!.fm.version).toBe(3);
    // parseFrontmatter strips one trailing newline after the closing ---;
    // the rest of the body is returned verbatim. Worker doesn't depend on
    // body shape (it replaces it wholesale on merge).
    expect(parsed!.body).toContain("body here");
  });

  it("returns null when no frontmatter", () => {
    expect(parseFrontmatter("plain text no frontmatter")).toBeNull();
    expect(parseFrontmatter("")).toBeNull();
  });

  it("returns null when frontmatter is unterminated", () => {
    expect(parseFrontmatter("---\nname: x\n")).toBeNull();
  });
});

describe("listSkills", () => {
  it("returns [] when the directory does not exist", () => {
    expect(listSkills(join(projectRoot, "nope"))).toEqual([]);
  });

  it("lists every SKILL.md found one level deep", () => {
    writeNewSkill({ skillsRoot, name: "a", description: "", body: "A", sourceSessions: [], agent: "x" });
    writeNewSkill({ skillsRoot, name: "b", description: "", body: "B", sourceSessions: [], agent: "x" });
    // A non-skill file at the same level should NOT trip the listing
    mkdirSync(join(skillsRoot, "noskill"), { recursive: true });
    writeFileSync(join(skillsRoot, "noskill", "OTHER.md"), "x");

    const skills = listSkills(skillsRoot).map(s => s.name).sort();
    expect(skills).toEqual(["a", "b"]);
  });
});

describe("assertValidSkillName (path-traversal guard)", () => {
  it("accepts standard kebab-case names", () => {
    expect(() => assertValidSkillName("my-skill")).not.toThrow();
    expect(() => assertValidSkillName("postgres-explain-analyze")).not.toThrow();
    expect(() => assertValidSkillName("a")).not.toThrow();
    expect(() => assertValidSkillName("skill1")).not.toThrow();
    expect(() => assertValidSkillName("skill-with-9-numbers")).not.toThrow();
  });

  it("rejects path traversal attempts", () => {
    expect(() => assertValidSkillName("../etc/passwd")).toThrow(/path separator|kebab-case/);
    expect(() => assertValidSkillName("..")).toThrow(/path separator|'\\.'|\.\./);
    expect(() => assertValidSkillName("foo/bar")).toThrow(/path separator/);
    expect(() => assertValidSkillName("foo\\bar")).toThrow(/path separator/);
    expect(() => assertValidSkillName("/abs/path")).toThrow(/path separator/);
    expect(() => assertValidSkillName("..foo")).toThrow();
  });

  it("rejects empty / wrong type", () => {
    expect(() => assertValidSkillName("")).toThrow(/empty/);
    expect(() => assertValidSkillName(undefined as any)).toThrow(/empty/);
    expect(() => assertValidSkillName(null as any)).toThrow(/empty/);
    expect(() => assertValidSkillName(42 as any)).toThrow(/empty/);
  });

  it("rejects names longer than 100 chars (path-safety ceiling, not the loader limit)", () => {
    // assertValidSkillName is a path-safety validator with a generous ceiling
    // so it can vet a long remote name's characters before capSkillName trims
    // the length. The 64-char loader limit is capSkillName's job, not this one.
    expect(() => assertValidSkillName("a".repeat(101))).toThrow(/too long/);
    expect(() => assertValidSkillName("a".repeat(100))).not.toThrow();
    // A legacy 65-100 char name must still validate (push/merge look it up).
    expect(() => assertValidSkillName("a".repeat(80))).not.toThrow();
  });
});

describe("capSkillName (64-char frontmatter-name ceiling)", () => {
  const HASH_SUFFIX = /-[a-z0-9]{5}$/;

  it("leaves short names untouched", () => {
    expect(capSkillName("my-skill")).toBe("my-skill");
    expect(capSkillName("a".repeat(MAX_SKILL_NAME_LEN))).toHaveLength(MAX_SKILL_NAME_LEN);
  });

  it("truncates a >64 name to <=64 with a hyphen-aligned prefix + hash suffix", () => {
    const long = "pg-deeplake-multi-layer-issue-diagnosis-and-workaround-prioritization";
    expect(long.length).toBeGreaterThan(MAX_SKILL_NAME_LEN);
    const capped = capSkillName(long);
    expect(capped.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
    expect(capped).toMatch(HASH_SUFFIX);
    // The prefix before the hash is a hyphen-delimited prefix of the original.
    const prefix = capped.replace(HASH_SUFFIX, "");
    expect(long.startsWith(prefix)).toBe(true);
    expect(long[prefix.length]).toBe("-");
  });

  it("is idempotent — re-capping a capped name is a no-op", () => {
    const long = "pg-incident-tactical-relief-insufficient-structural-root-phased-fix";
    const capped = capSkillName(long);
    expect(capSkillName(capped)).toBe(capped);
  });

  it("gives distinct results to two long names sharing a prefix (no collision)", () => {
    // Same prefix through the hyphen boundary, different tail — must NOT collapse
    // onto one identity (which would overwrite/version-confuse the two skills).
    const base = "aaaa-bbbb-cccc-dddd-eeee-ffff-gggg-hhhh-iiii-jjjj-kkkk-llll";
    const a = capSkillName(`${base}-alpha-one-tail`);
    const b = capSkillName(`${base}-alpha-two-tail`);
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
    expect(b.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
  });

  it("disambiguates names differing only in the last char (low-order hash digits)", () => {
    // djb2 makes `…-0` and `…-1` differ by 1 in the final hash; a hash that
    // kept the HIGH-order base-36 digits would slice that difference away and
    // collide. The suffix must come from the low-order digits.
    const base = "seg-".repeat(16); // 64 chars, > ceiling once a tail is added
    const a = capSkillName(`${base}alpha0`);
    const b = capSkillName(`${base}alpha1`);
    expect(a.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
    expect(b.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
    expect(a).not.toBe(b);
  });

  it("produces a result that still passes assertValidSkillName", () => {
    const long = "a-" + "b".repeat(200);
    const capped = capSkillName(long);
    expect(() => assertValidSkillName(capped)).not.toThrow();
    expect(capped.endsWith("-")).toBe(false);
  });

  it("hard-truncates a hyphenless name that overflows", () => {
    const capped = capSkillName("x".repeat(200));
    expect(capped.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
    expect(capped.length).toBeGreaterThan(0);
  });

  it("rejects uppercase / underscores / spaces / dots", () => {
    expect(() => assertValidSkillName("MySkill")).toThrow(/kebab-case/);
    expect(() => assertValidSkillName("my_skill")).toThrow(/kebab-case/);
    expect(() => assertValidSkillName("my skill")).toThrow(/kebab-case/);
    expect(() => assertValidSkillName("my.skill")).toThrow(/kebab-case/);
    expect(() => assertValidSkillName("--double-dash")).toThrow(/kebab-case/);
    expect(() => assertValidSkillName("trailing-")).toThrow(/kebab-case/);
  });
});

describe("writeNewSkill / mergeSkill reject invalid names", () => {
  it("writeNewSkill throws on path-traversal name", () => {
    expect(() => writeNewSkill({
      skillsRoot, name: "../escape", description: "", body: VALID_BODY,
      sourceSessions: [], agent: "x",
    })).toThrow(/path separator|kebab-case/);
  });

  it("mergeSkill throws on path-traversal name", () => {
    // Pre-create a real skill so the does-not-exist check doesn't fire first
    writeNewSkill({ skillsRoot, name: "real", description: "", body: VALID_BODY, sourceSessions: [], agent: "x" });
    expect(() => mergeSkill({
      skillsRoot, name: "../real", body: "x", newSourceSessions: [], agent: "x",
    })).toThrow(/path separator|kebab-case/);
  });
});

describe("resolveSkillsRoot", () => {
  it("returns <cwd>/.claude/skills for project install", () => {
    expect(resolveSkillsRoot("project", "/tmp/foo")).toBe(join("/tmp/foo", ".claude", "skills"));
  });

  it("returns ~/.claude/skills for global install", () => {
    expect(resolveSkillsRoot("global", "/tmp/foo")).toBe(join(homedir(), ".claude", "skills"));
  });
});
