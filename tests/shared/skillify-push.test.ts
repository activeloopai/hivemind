import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  runPush,
  readLocalSkill,
  computePushContributors,
} from "../../src/skillify/push.js";

/**
 * Tests for the manual local -> Deeplake skill push. The Deeplake query fn is
 * the only mocked boundary: a spy captures every SQL statement so we assert on
 * the SELECT (version lookup) + INSERT (append-only row) the real code emits.
 *
 * The local filesystem is real (a temp dir): push reads an actual SKILL.md, so
 * frontmatter parsing + author/version/contributor derivation are exercised
 * end-to-end, not stubbed.
 */

let root: string;

function writeSkill(name: string, frontmatter: string, body: string): string {
  const dir = join(root, ".claude", "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `${frontmatter}\n\n${body}\n`);
  return dir;
}

const FM = (lines: string[]) => ["---", ...lines, "---"].join("\n");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "skillify-push-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("readLocalSkill", () => {
  it("parses frontmatter fields and trims the body", () => {
    writeSkill("posthog-smoke", FM([
      'name: posthog-smoke',
      'description: "Smoke-test posthog events"',
      'trigger: "posthog test"',
      'author: kamo',
      'source_sessions:',
      '  - s1',
      '  - s2',
      'contributors:',
      '  - kamo',
      '  - levon',
      'version: 3',
      'created_by_agent: claude_code',
      'created_at: 2026-01-01T00:00:00Z',
      'updated_at: 2026-02-01T00:00:00Z',
    ]), "## Rules\n1. fire a real event\n");

    const s = readLocalSkill(join(root, ".claude", "skills"), "posthog-smoke");
    expect(s).toMatchObject({
      description: "Smoke-test posthog events",
      trigger: "posthog test",
      author: "kamo",
      sourceSessions: ["s1", "s2"],
      contributors: ["kamo", "levon"],
      version: 3,
      agent: "claude_code",
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(s.body).toBe("## Rules\n1. fire a real event");
  });

  it("throws a clear error naming the exact missing path", () => {
    const expectedPath = join(root, ".claude", "skills", "ghost", "SKILL.md");
    expect(() => readLocalSkill(join(root, ".claude", "skills"), "ghost"))
      .toThrow(`skill 'ghost' not found at ${expectedPath}`);
  });

  it("throws the exact no-frontmatter message", () => {
    const dir = join(root, ".claude", "skills", "bare");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "just a body, no frontmatter\n");
    const expectedPath = join(root, ".claude", "skills", "bare", "SKILL.md");
    expect(() => readLocalSkill(join(root, ".claude", "skills"), "bare"))
      .toThrow(`skill 'bare' at ${expectedPath} has no valid frontmatter — cannot push`);
  });

  it("rejects a path-traversal name before touching disk", () => {
    expect(() => readLocalSkill(join(root, ".claude", "skills"), "../etc/passwd"))
      .toThrow("invalid skill name: contains path separator or '..': ../etc/passwd");
  });

  it("defaults version to 1 and omits author for a legacy file without those fields", () => {
    writeSkill("legacy", FM([
      'name: legacy',
      'description: "old skill"',
    ]), "body");
    const s = readLocalSkill(join(root, ".claude", "skills"), "legacy");
    expect(s.version).toBe(1);
    expect(s.author).toBeUndefined();
    expect(s.contributors).toEqual([]);
  });
});

describe("computePushContributors", () => {
  it("appends the pusher when not already present", () => {
    expect(computePushContributors(["kamo"], "kamo", "emanuele")).toEqual(["kamo", "emanuele"]);
  });
  it("does not duplicate the pusher", () => {
    expect(computePushContributors(["kamo", "emanuele"], "kamo", "emanuele")).toEqual(["kamo", "emanuele"]);
  });
  it("seeds [author] when the base list is empty but an author is known", () => {
    expect(computePushContributors([], "kamo", "emanuele")).toEqual(["kamo", "emanuele"]);
  });
  it("returns just the pusher when there is no base and no author (legacy)", () => {
    expect(computePushContributors([], undefined, "emanuele")).toEqual(["emanuele"]);
  });
});

describe("runPush", () => {
  const baseArgs = (over: Partial<Parameters<typeof runPush>[0]> = {}) => ({
    tableName: "skills",
    workspaceId: "ws1",
    from: "project" as const,
    cwd: root,
    skillName: "my-skill",
    pusher: "emanuele",
    scope: "me" as const,
    agent: "cli",
    now: "2026-06-24T00:00:00Z",
    ...over,
  });

  it("INSERTs a brand-new skill at its local version when not yet in the table", async () => {
    writeSkill("my-skill", FM([
      'name: my-skill',
      'description: "does a thing"',
      'trigger: "do the thing"',
      'author: kamo',
      'version: 1',
      'created_by_agent: claude_code',
      'created_at: 2026-05-01T00:00:00Z',
    ]), "## Steps\n1. go");

    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT")) return []; // not in table yet
      return [];
    });

    const res = await runPush({ ...baseArgs(), query });

    expect(res.action).toBe("pushed");
    expect(res.previousVersion).toBeNull();
    expect(res.version).toBe(1);
    expect(res.author).toBe("kamo");           // frontmatter author preserved
    expect(res.contributors).toEqual(["kamo", "emanuele"]); // pusher appended

    const inserts = calls.filter(s => s.includes("INSERT INTO"));
    expect(inserts).toHaveLength(1);
    const sql = inserts[0];
    expect(sql).toContain('INSERT INTO "skills"');
    expect(sql).toContain("'my-skill'");
    expect(sql).toContain("'kamo'");                 // author column
    expect(sql).toContain("'do the thing'");         // trigger
    expect(sql).toContain("## Steps");               // body
    expect(sql).toContain(JSON.stringify(["kamo", "emanuele"])); // contributors JSON
    expect(sql).toContain("'2026-05-01T00:00:00Z'"); // created_at preserved
    expect(sql).toContain("'2026-06-24T00:00:00Z'"); // updated_at = now
    expect(sql).toContain(", 1, ");                  // version literal
  });

  it("bumps to remote version + 1 when the skill already exists", async () => {
    writeSkill("my-skill", FM([
      'name: my-skill',
      'description: "v-local"',
      'author: kamo',
      'version: 1',
    ]), "local body");

    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT")) {
        return [{
          name: "my-skill", author: "kamo", version: 7,
          install: "project", scope: "me",
          contributors: JSON.stringify(["kamo"]), source_sessions: "[]", body: "old",
        }];
      }
      return [];
    });

    const res = await runPush({ ...baseArgs(), query });
    expect(res.previousVersion).toBe(7);
    expect(res.version).toBe(8);
    const insert = calls.find(s => s.includes("INSERT INTO"))!;
    expect(insert).toContain(", 8, ");
  });

  it("falls back to the pusher as author for a legacy file with no author", async () => {
    writeSkill("my-skill", FM([
      'name: my-skill',
      'description: "no author"',
    ]), "body");

    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      // The version SELECT must key on the fallback author.
      if (sql.startsWith("SELECT")) {
        expect(sql).toContain("author = 'emanuele'");
        return [];
      }
      return [];
    });

    const res = await runPush({ ...baseArgs(), query });
    expect(res.author).toBe("emanuele");
    expect(res.contributors).toEqual(["emanuele"]);
  });

  it("dry-run computes everything but emits no INSERT", async () => {
    writeSkill("my-skill", FM([
      'name: my-skill',
      'description: "x"',
      'author: kamo',
      'version: 2',
    ]), "body");

    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT")) return [{ name: "my-skill", author: "kamo", version: 4 }];
      return [];
    });

    const res = await runPush({ ...baseArgs(), dryRun: true, query });
    expect(res.action).toBe("dryrun");
    expect(res.version).toBe(5);                 // 4 + 1, still computed
    expect(calls.some(s => s.includes("INSERT INTO"))).toBe(false);
  });

  it("reads from the global root when from=global", async () => {
    // Write into a *project* dir; with from=global it must NOT be found there.
    writeSkill("only-in-project", FM(['name: only-in-project', 'description: "x"']), "body");
    const query = vi.fn(async () => []);
    const globalPath = join(homedir(), ".claude", "skills", "only-in-project", "SKILL.md");
    await expect(runPush({ ...baseArgs(), skillName: "only-in-project", from: "global", query }))
      .rejects.toThrow(`skill 'only-in-project' not found at ${globalPath}`);
  });

  it("treats a missing-table error on the version SELECT as a new skill (lazy-create on insert)", async () => {
    // Reproduces the first-ever-push case: the table doesn't exist yet, so the
    // version-lookup SELECT 400s. push must treat that as "no prior version"
    // and still INSERT (insertSkillRow lazy-creates the table).
    writeSkill("my-skill", FM(['name: my-skill', 'description: "x"', 'author: kamo', 'version: 1']), "body");
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith("SELECT")) {
        throw new Error('Query failed: 400: Table does not exist: relation "skills" does not exist');
      }
      return []; // INSERT / CREATE / heal all succeed
    });

    const res = await runPush({ ...baseArgs(), query });
    expect(res.previousVersion).toBeNull();
    expect(res.version).toBe(1);
    expect(res.action).toBe("pushed");
    expect(calls.some(s => s.includes("INSERT INTO"))).toBe(true);
  });

  it("rethrows a non-missing-table error from the version SELECT", async () => {
    writeSkill("my-skill", FM(['name: my-skill', 'description: "x"', 'author: kamo']), "body");
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT")) throw new Error("Query failed: 500: boom");
      return [];
    });
    await expect(runPush({ ...baseArgs(), query })).rejects.toThrow("Query failed: 500: boom");
  });

  it("preserves the remote lineage created_at when the local file has none", async () => {
    // Legacy local file: no created_at in frontmatter. The remote row already
    // carries the lineage's original creation time — re-pushing must keep it,
    // not reset it to now.
    writeSkill("my-skill", FM(['name: my-skill', 'description: "x"', 'author: kamo', 'version: 1']), "body");
    let insert = "";
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT")) {
        return [{ name: "my-skill", author: "kamo", version: 3, created_at: "2025-01-01T00:00:00Z" }];
      }
      if (sql.includes("INSERT INTO")) insert = sql;
      return [];
    });
    await runPush({ ...baseArgs(), query }); // baseArgs.now = 2026-06-24T00:00:00Z
    expect(insert).toContain("'2025-01-01T00:00:00Z'"); // created_at preserved from remote
    expect(insert).toContain("'2026-06-24T00:00:00Z'"); // updated_at = now
  });

  it("writes the configured scope onto the row", async () => {
    writeSkill("my-skill", FM(['name: my-skill', 'description: "x"', 'author: kamo']), "body");
    let insert = "";
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO")) insert = sql;
      return [];
    });
    await runPush({ ...baseArgs(), scope: "team", query });
    expect(insert).toContain("'team'");
  });
});
