/**
 * Tests for src/skillify/legacy-cap-migration.ts.
 *
 * The migration is the REMOTE-INDEPENDENT counterpart to pull.ts's in-loop
 * cap migration: it scans the pulled manifest and caps any managed install
 * whose installed frontmatter `name` still exceeds the 64-char loader ceiling,
 * regardless of which org/workspace is routed (and while offline).
 *
 * Mocking policy (per CLAUDE.md): import and run the REAL modules. The only
 * seam we mock is the network — the auto-pull ordering test injects a QueryFn
 * spy so no HTTP happens. Filesystem effects are scoped to a temp HOME so the
 * developer's real ~/.deeplake / ~/.claude are never touched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { migrateLegacyCappedInstalls } from "../../src/skillify/legacy-cap-migration.js";
import { loadManifest, recordPull, type PulledEntry } from "../../src/skillify/manifest.js";
import { capSkillName, MAX_SKILL_NAME_LEN } from "../../src/skillify/skill-writer.js";
import { setFakeHome, clearFakeHome } from "../shared/fake-home.js";

// A real >64-char offender codex drops (68 chars), same one used in the
// pull.ts migration tests.
const LONG_NAME = "pg-deeplake-multi-layer-issue-diagnosis-and-workaround-prioritization";

let installRoot: string;
let fakeHome: string;

beforeEach(() => {
  // Isolate HOME so recordPull writes the manifest into the sandbox, not the
  // developer's real ~/.deeplake state.
  fakeHome = mkdtempSync(join(tmpdir(), "legacy-cap-home-"));
  setFakeHome(fakeHome);
  // Install root under the fake home — a plausible project skills root.
  installRoot = join(fakeHome, "proj", ".claude", "skills");
  mkdirSync(installRoot, { recursive: true });
});

afterEach(() => {
  try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* nothing */ }
  clearFakeHome();
});

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Write a SKILL.md with the given frontmatter name + version + body. */
function writeSkill(dir: string, name: string, version: number, body: string): void {
  const skillDir = join(installRoot, dir);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: "d"\nversion: ${version}\ncreated_by_agent: cc\ncreated_at: t\nupdated_at: t\n---\n\n${body}\n`,
  );
}

/**
 * Record a managed manifest entry for an on-disk dir. Defaults to a GLOBAL
 * install because the migration only ever touches global entries (project
 * installs belong to a specific cwd and must not be mutated from an unrelated
 * SessionStart).
 */
function record(over: Partial<PulledEntry> & Pick<PulledEntry, "dirName" | "name">): void {
  recordPull({
    author: "sasun",
    projectKey: "pk",
    remoteVersion: 2,
    install: "global",
    installRoot,
    pulledAt: "2026-05-06T00:00:00.000Z",
    symlinks: [],
    ...over,
  });
}

// ─── over-long managed entry is migrated ─────────────────────────────────────

describe("migrateLegacyCappedInstalls — happy path", () => {
  it("caps an over-long managed entry: frontmatter capped, dir renamed, manifest updated with rawName, stale dir gone", () => {
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 7, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 7 });
    expect(LONG_NAME.length).toBeGreaterThan(MAX_SKILL_NAME_LEN);

    const res = migrateLegacyCappedInstalls();

    expect(res.migrated).toBe(1);

    // Stale dir + its manifest entry are gone.
    expect(existsSync(join(installRoot, staleDir))).toBe(false);
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(false);

    // Exactly the capped dir remains.
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;
    const dirs = readdirSync(installRoot);
    expect(dirs).toEqual([cappedDir]);

    // Frontmatter name is capped (<=64) and the body/version are preserved.
    const text = readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8");
    const fmName = text.match(/^name: (.+)$/m)?.[1] ?? "";
    expect(fmName).toBe(capped);
    expect(fmName.length).toBeLessThanOrEqual(MAX_SKILL_NAME_LEN);
    expect(text).toContain("legacy body");
    expect(text).toContain("version: 7");

    // Manifest entry: canonical capped dir/name, rawName preserves the pre-cap name.
    const entry = loadManifest().entries.find(e => e.dirName === cappedDir);
    expect(entry).toBeDefined();
    expect(entry!.name).toBe(capped);
    expect(entry!.rawName).toBe(LONG_NAME);
    expect(entry!.remoteVersion).toBe(7);
  });

  it("is idempotent: a second run no-ops (already capped)", () => {
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 2, "b");
    record({ dirName: staleDir, name: LONG_NAME });

    const first = migrateLegacyCappedInstalls();
    expect(first.migrated).toBe(1);
    const manifestAfterFirst = JSON.stringify(loadManifest());
    const capped = capSkillName(LONG_NAME);
    const fileAfterFirst = readFileSync(join(installRoot, `${capped}--sasun`, "SKILL.md"), "utf-8");

    const second = migrateLegacyCappedInstalls();
    expect(second.migrated).toBe(0);
    // Nothing moved or rewritten on the second pass.
    expect(JSON.stringify(loadManifest())).toBe(manifestAfterFirst);
    expect(readFileSync(join(installRoot, `${capped}--sasun`, "SKILL.md"), "utf-8")).toBe(fileAfterFirst);
    expect(readdirSync(installRoot)).toEqual([`${capped}--sasun`]);
  });

  it("leaves an already-short managed entry untouched", () => {
    writeSkill("short-skill--sasun", "short-skill", 1, "x");
    record({ dirName: "short-skill--sasun", name: "short-skill", remoteVersion: 1 });

    const res = migrateLegacyCappedInstalls();
    expect(res.migrated).toBe(0);
    expect(existsSync(join(installRoot, "short-skill--sasun", "SKILL.md"))).toBe(true);
  });

  it("skips a managed entry whose SKILL.md is missing (unreadable name)", () => {
    // Manifest row present, but no SKILL.md on disk → readInstalledName is null.
    mkdirSync(join(installRoot, "gone--sasun"), { recursive: true });
    record({ dirName: "gone--sasun", name: "gone", remoteVersion: 1 });

    const res = migrateLegacyCappedInstalls();
    expect(res.migrated).toBe(0);
    // Manifest row left intact (no destructive op fired).
    expect(loadManifest().entries.some(e => e.dirName === "gone--sasun")).toBe(true);
  });

  it("skips a managed entry whose frontmatter name is empty", () => {
    // Empty `name:` → readInstalledName returns null (non-empty-string guard).
    writeSkill("empty-name--sasun", "", 1, "x");
    record({ dirName: "empty-name--sasun", name: "empty-name", remoteVersion: 1 });

    const res = migrateLegacyCappedInstalls();
    expect(res.migrated).toBe(0);
    expect(existsSync(join(installRoot, "empty-name--sasun", "SKILL.md"))).toBe(true);
  });

  it("no-ops when the entry already sits at the canonical capped dir but still reads an over-long name", () => {
    // Directory is already the capped dir, yet the frontmatter name was never
    // rewritten (over-long). cappedDir === entry.dirName so there's nothing to
    // move — the in-place idempotent guard returns without touching anything.
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;
    writeSkill(cappedDir, LONG_NAME, 3, "body");
    record({ dirName: cappedDir, name: capped, rawName: LONG_NAME, remoteVersion: 3 });

    const res = migrateLegacyCappedInstalls();
    expect(res.migrated).toBe(0);
    expect(readdirSync(installRoot)).toEqual([cappedDir]);
    expect(loadManifest().entries.some(e => e.dirName === cappedDir)).toBe(true);
  });
});

// ─── global fan-out symlinks are created + recorded ──────────────────────────

describe("migrateLegacyCappedInstalls — global symlink fan-out", () => {
  it("fans out a symlink into a detected agent root and records it on the canonical entry", () => {
    // A `~/.codex` marker makes detectAgentSkillsRoots surface `~/.agents/skills`
    // as a fan-out target, so the migration's step (d) creates + records a link.
    mkdirSync(join(fakeHome, ".codex"), { recursive: true });

    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 4, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 4 });

    const res = migrateLegacyCappedInstalls();
    expect(res.migrated).toBe(1);

    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;
    const link = join(fakeHome, ".agents", "skills", cappedDir);
    // The fan-out symlink exists and resolves to the canonical dir.
    expect(existsSync(link)).toBe(true);
    // The canonical manifest entry recorded the resolved symlink set.
    const entry = loadManifest().entries.find(e => e.dirName === cappedDir);
    expect(entry!.symlinks).toContain(link);
  });
});

// ─── unmanaged over-long dir is NOT touched ──────────────────────────────────

describe("migrateLegacyCappedInstalls — ownership", () => {
  it("never touches an over-long dir that has no manifest entry", () => {
    const userDir = `${LONG_NAME}--sasun`;
    writeSkill(userDir, LONG_NAME, 1, "user-owned body");
    // NB: no record() — the dir is unmanaged.

    const res = migrateLegacyCappedInstalls();

    expect(res.migrated).toBe(0);
    // The unmanaged dir is left exactly as-is.
    expect(existsSync(join(installRoot, userDir, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(installRoot, userDir, "SKILL.md"), "utf-8")).toContain("user-owned body");
    expect(readdirSync(installRoot)).toEqual([userDir]);
  });
});

// ─── collision skips ─────────────────────────────────────────────────────────

describe("migrateLegacyCappedInstalls — collision", () => {
  it("skips when the capped target is already claimed by another managed entry", () => {
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;

    // A DIFFERENT managed entry already sits at the capped destination.
    writeSkill(cappedDir, capped, 3, "owner body");
    record({ dirName: cappedDir, name: capped, rawName: "some-other-raw-name", remoteVersion: 3 });

    // The legacy over-long entry that would cap onto the same dir.
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 2, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 2 });

    const res = migrateLegacyCappedInstalls();

    // The over-long entry is skipped; owner and legacy dir both survive.
    expect(res.migrated).toBe(0);
    expect(existsSync(join(installRoot, staleDir, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(installRoot, staleDir, "SKILL.md"), "utf-8")).toContain("legacy body");
    // The owner's content is untouched (not overwritten by the collider).
    expect(readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8")).toContain("owner body");
    // Both manifest entries still present.
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(true);
    expect(loadManifest().entries.some(e => e.dirName === cappedDir)).toBe(true);
  });

  it("skips when a dir already sits on disk at the capped target (unmanaged occupant)", () => {
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;
    // Unmanaged dir occupying the capped destination (no manifest entry).
    writeSkill(cappedDir, capped, 1, "occupant body");

    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 2, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 2 });

    const res = migrateLegacyCappedInstalls();

    expect(res.migrated).toBe(0);
    // Neither dir was clobbered.
    expect(readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8")).toContain("occupant body");
    expect(readFileSync(join(installRoot, staleDir, "SKILL.md"), "utf-8")).toContain("legacy body");
  });
});

// ─── fs error leaves original intact ─────────────────────────────────────────

describe("migrateLegacyCappedInstalls — fs error", () => {
  it("leaves the original untouched and continues when the copy throws", async () => {
    // Two over-long managed entries. We make cpSync throw for the FIRST entry's
    // copy only, and assert the pass swallows the error, leaves the first
    // intact (dir + manifest row), and still migrates the second.
    const staleA = `${LONG_NAME}--sasun`;
    writeSkill(staleA, LONG_NAME, 2, "A body");
    record({ dirName: staleA, name: LONG_NAME, remoteVersion: 2 });

    // 66 chars — over the 64-char loader ceiling but within the 100-char
    // path-safety ceiling, so it's a valid slug that still needs capping.
    const longB = "pg-deeplake-multi-layer-issue-diagnosis-and-workaround-variant-two";
    const staleB = `${longB}--sasun`;
    writeSkill(staleB, longB, 2, "B body");
    record({ dirName: staleB, name: longB, remoteVersion: 2 });

    // Mock at the fs boundary: fail cpSync only when copying entry A's stale
    // dir; delegate everything else to the real fs.
    vi.resetModules();
    vi.doMock("node:fs", async () => {
      const real = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...real,
        cpSync: (from: any, to: any, opts: any) => {
          if (String(from).endsWith(staleA)) {
            const err = new Error("EPERM: simulated copy failure") as NodeJS.ErrnoException;
            err.code = "EPERM";
            throw err;
          }
          return real.cpSync(from, to, opts);
        },
      };
    });
    const { migrateLegacyCappedInstalls: run } = await import("../../src/skillify/legacy-cap-migration.js");
    const res = run();
    vi.doUnmock("node:fs");

    // A failed, B migrated.
    expect(res.migrated).toBe(1);
    // A's original dir + manifest entry survive intact.
    expect(existsSync(join(installRoot, staleA, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(installRoot, staleA, "SKILL.md"), "utf-8")).toContain("A body");
    expect(loadManifest().entries.some(e => e.dirName === staleA)).toBe(true);
    // B was migrated to its capped dir.
    const cappedB = `${capSkillName(longB)}--sasun`;
    expect(existsSync(join(installRoot, staleB))).toBe(false);
    expect(readFileSync(join(installRoot, cappedB, "SKILL.md"), "utf-8")).toContain("B body");
  });
});

// ─── copy-then-swap: post-copy failure is recoverable on retry ───────────────

describe("migrateLegacyCappedInstalls — post-copy failure & retry", () => {
  it("a write throw AFTER copy+record leaves the original intact; the retry reconciles & completes", async () => {
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 5, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 5 });
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;

    // First run: let the copy + canonical recordPull land, then make the
    // frontmatter-rewrite writeFileSync (step c) throw — the destructive
    // removal of the legacy dir/entry (step e) is never reached. This is the
    // dangerous window: a same-rawName canonical manifest row now exists but the
    // legacy leftover is still present.
    vi.resetModules();
    vi.doMock("node:fs", async () => {
      const real = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...real,
        writeFileSync: (p: any, data: any, opts?: any) => {
          // Only fail the frontmatter rewrite of the NEW capped SKILL.md; let
          // manifest .tmp writes (which pass a mode option) through.
          if (String(p).endsWith(join(cappedDir, "SKILL.md")) && opts === undefined) {
            throw new Error("simulated writeFileSync failure after copy+record");
          }
          return real.writeFileSync(p, data, opts);
        },
      };
    });
    const first = await import("../../src/skillify/legacy-cap-migration.js");
    const r1 = first.migrateLegacyCappedInstalls();
    vi.doUnmock("node:fs");

    // Migration did NOT complete: the legacy dir + its manifest row are intact.
    expect(r1.migrated).toBe(0);
    expect(existsSync(join(installRoot, staleDir, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(installRoot, staleDir, "SKILL.md"), "utf-8")).toContain("legacy body");
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(true);
    // The canonical manifest row WAS recorded (record-before-destroy), so the
    // retry can recognise the leftover via same-rawName reconciliation.
    const canonAfterFirst = loadManifest().entries.find(e => e.dirName === cappedDir);
    expect(canonAfterFirst).toBeDefined();
    expect(canonAfterFirst!.rawName).toBe(LONG_NAME);

    // Second run (real fs + real manifest): same-rawName reconciliation retires
    // the legacy leftover and leaves the canonical install in place.
    vi.resetModules();
    const second = await import("../../src/skillify/legacy-cap-migration.js");
    const r2 = second.migrateLegacyCappedInstalls();

    expect(r2.migrated).toBe(1);
    expect(existsSync(join(installRoot, staleDir))).toBe(false);
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(false);
    expect(readdirSync(installRoot)).toEqual([cappedDir]);
    const finalText = readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8");
    expect(finalText).toContain("legacy body");
    // The repair path re-migrated from the intact legacy, so the canonical
    // frontmatter is now properly capped (<=64) — not left half-written.
    expect(finalText.match(/^name: (.+)$/m)?.[1]).toBe(capped);
    const entry = loadManifest().entries.find(e => e.dirName === cappedDir);
    expect(entry!.rawName).toBe(LONG_NAME);
    expect(entry!.remoteVersion).toBe(5);
  });
});

// ─── same-rawName leftover is reconciled ─────────────────────────────────────

describe("migrateLegacyCappedInstalls — same-rawName reconciliation", () => {
  it("removes the legacy leftover when the canonical entry has the SAME rawName; canonical untouched", () => {
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;

    // Canonical install already produced by a prior migration/pull: SAME rawName.
    writeSkill(cappedDir, capped, 7, "canonical body");
    record({ dirName: cappedDir, name: capped, rawName: LONG_NAME, remoteVersion: 7 });

    // Legacy leftover with the still-over-long frontmatter name that caps onto
    // the same identity.
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 5, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, rawName: LONG_NAME, remoteVersion: 5 });

    const res = migrateLegacyCappedInstalls();

    // The leftover was reconciled (counts as a migration), not skipped.
    expect(res.migrated).toBe(1);
    // Legacy dir + manifest row gone.
    expect(existsSync(join(installRoot, staleDir))).toBe(false);
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(false);
    // Canonical dir + its content + manifest row fully untouched.
    expect(readdirSync(installRoot)).toEqual([cappedDir]);
    expect(readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8")).toContain("canonical body");
    const canon = loadManifest().entries.find(e => e.dirName === cappedDir);
    expect(canon!.remoteVersion).toBe(7);
    expect(canon!.rawName).toBe(LONG_NAME);
  });

  it("treats an ORPHANED canonical row (dir missing on disk) as repair, not as already-migrated", () => {
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;

    // Manifest row claims the canonical dir, but the dir was deleted manually —
    // retiring the legacy here would drop the only surviving copy.
    record({ dirName: cappedDir, name: capped, rawName: LONG_NAME, remoteVersion: 7 });

    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 5, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, rawName: LONG_NAME, remoteVersion: 5 });

    const res = migrateLegacyCappedInstalls();

    // Re-migrated from the legacy copy: canonical recreated with capped name…
    expect(res.migrated).toBe(1);
    expect(readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8")).toContain(`name: ${capped}`);
    expect(readFileSync(join(installRoot, cappedDir, "SKILL.md"), "utf-8")).toContain("legacy body");
    // …and the legacy dir + row retired only after the swap completed.
    expect(existsSync(join(installRoot, staleDir))).toBe(false);
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(false);
  });

  it("swallows a throw inside the reconciliation itself — the pass never escapes into the caller", async () => {
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;

    // Half-migrated canonical (frontmatter still over-long) triggers the
    // repair branch, whose rmSync we make throw.
    writeSkill(cappedDir, LONG_NAME, 7, "broken canonical");
    record({ dirName: cappedDir, name: capped, rawName: LONG_NAME, remoteVersion: 7 });
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 5, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, rawName: LONG_NAME, remoteVersion: 5 });

    vi.resetModules();
    vi.doMock("node:fs", async () => {
      const real = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...real,
        rmSync: (p: any, o: any) => {
          if (String(p).includes(cappedDir)) throw new Error("EIO: rm failed");
          return real.rmSync(p, o);
        },
      };
    });
    const { migrateLegacyCappedInstalls: migrate } = await import("../../src/skillify/legacy-cap-migration.js");

    // Must not throw — the per-entry catch swallows the reconciliation error…
    const res = migrate();
    expect(res.migrated).toBe(0);
    // …and BOTH copies are left in place for the next retry.
    expect(existsSync(join(installRoot, staleDir))).toBe(true);
    expect(existsSync(join(installRoot, cappedDir))).toBe(true);
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(true);
    vi.doUnmock("node:fs");
    vi.resetModules();
  });
});

// ─── path validation skips invalid author / frontmatter name ─────────────────

describe("migrateLegacyCappedInstalls — path validation", () => {
  it("skips (untouched) when the manifest author is a traversal string", () => {
    // A managed entry whose author would escape the install root if it fed a
    // directory name. dirName itself is a benign single segment so the manifest
    // loader accepts it; the author is the poison.
    const badAuthor = "..%2F..";
    const staleDir = `${LONG_NAME}--bad`;
    writeSkill(staleDir, LONG_NAME, 2, "poison body");
    record({ dirName: staleDir, name: LONG_NAME, author: badAuthor, remoteVersion: 2 });

    const res = migrateLegacyCappedInstalls();

    expect(res.migrated).toBe(0);
    // Left exactly as-is.
    expect(readdirSync(installRoot)).toEqual([staleDir]);
    expect(readFileSync(join(installRoot, staleDir, "SKILL.md"), "utf-8")).toContain("poison body");
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(true);
  });

  it("skips (untouched) when the installed frontmatter name is not a valid slug", () => {
    // Over-long AND non-kebab (path separator) frontmatter name — must be
    // rejected before any destination path is built.
    const badName = "../../etc/passwd-plus-a-very-long-tail-to-exceed-the-64-char-loader-ceiling";
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, badName, 2, "poison body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 2 });

    const res = migrateLegacyCappedInstalls();

    expect(res.migrated).toBe(0);
    expect(readdirSync(installRoot)).toEqual([staleDir]);
    expect(readFileSync(join(installRoot, staleDir, "SKILL.md"), "utf-8")).toContain("poison body");
    expect(loadManifest().entries.some(e => e.dirName === staleDir)).toBe(true);
  });
});

// ─── project-scoped entries are never mutated ────────────────────────────────

describe("migrateLegacyCappedInstalls — scope", () => {
  it("never migrates a project-scoped over-long entry", () => {
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 2, "project body");
    // Explicitly project-scoped — the migration must leave it alone.
    record({ dirName: staleDir, name: LONG_NAME, install: "project", remoteVersion: 2 });

    const res = migrateLegacyCappedInstalls();

    expect(res.migrated).toBe(0);
    expect(readdirSync(installRoot)).toEqual([staleDir]);
    expect(readFileSync(join(installRoot, staleDir, "SKILL.md"), "utf-8")).toContain("project body");
    expect(loadManifest().entries.some(e => e.dirName === staleDir && e.install === "project")).toBe(true);
  });
});

// ─── auto-pull invokes migration BEFORE any network call ─────────────────────

describe("autoPullSkills — invokes legacy-cap migration before the network", () => {
  it("migrates a legacy over-long install before issuing the SQL query", async () => {
    // Reset the module registry so the auto-pull import binds fresh.
    vi.resetModules();
    const { autoPullSkills } = await import("../../src/skillify/auto-pull.js");

    // A legacy over-long managed install present at SessionStart.
    const staleDir = `${LONG_NAME}--sasun`;
    writeSkill(staleDir, LONG_NAME, 2, "legacy body");
    record({ dirName: staleDir, name: LONG_NAME, remoteVersion: 2 });

    // Query spy that records ordering: assert the migration already renamed
    // the dir by the time the network SELECT fires.
    let migratedBeforeQuery = false;
    const capped = capSkillName(LONG_NAME);
    const cappedDir = `${capped}--sasun`;
    const queryFn = vi.fn(async (_sql: string) => {
      migratedBeforeQuery =
        existsSync(join(installRoot, cappedDir)) && !existsSync(join(installRoot, staleDir));
      return [];
    });

    const loadConfigFn = () => ({
      token: "tok", orgId: "org", orgName: "O", userName: "u",
      workspaceId: "default", apiUrl: "https://api.deeplake.ai",
      tableName: "memory", sessionsTableName: "sessions", skillsTableName: "skills",
      rulesTableName: "r", goalsTableName: "g", kpisTableName: "k",
      docsTableName: "d", codebaseTableName: "c",
      memoryPath: join(fakeHome, ".deeplake", "memory"),
    }) as any;

    const res = await autoPullSkills({
      loadConfigFn, queryFn, install: "project", cwd: join(fakeHome, "proj"),
    });

    // The migration ran and completed BEFORE the SELECT was issued.
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(migratedBeforeQuery).toBe(true);
    // The pull itself found no matching remote rows (routed org differs).
    expect(res.pulled).toBe(0);
    // And the stale dir was retired by the migration.
    expect(existsSync(join(installRoot, staleDir))).toBe(false);
    expect(existsSync(join(installRoot, cappedDir))).toBe(true);
  });
});
