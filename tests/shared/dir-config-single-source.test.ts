import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SINGLE-SOURCE-OF-TRUTH GUARD for per-directory workspace routing.
 *
 * `.hivemind` routing broke repeatedly because it was wired writer-by-writer:
 * each new code path that built a DeeplakeApi from a raw `loadConfig()` silently
 * wrote/read the GLOBAL workspace instead of the directory's routed one (the
 * skillify/goals/rules/other-agent bugs). This test makes that class of
 * regression impossible to merge.
 *
 * The invariant: every module that constructs a `DeeplakeApi` MUST obtain its
 * config through a router — `loadRoutedConfig` (the single entry point) or
 * `resolveDirConfig`/`resolveCaptureConfig` (when it also needs the `collect`
 * flag) — UNLESS it is explicitly allow-listed below with a reason.
 *
 * Adding a new DeeplakeApi call site therefore forces a choice: route it, or
 * justify why it doesn't (account-level op, creds-based, no directory context).
 * A silent unrouted writer can no longer slip in.
 */

const __dir = fileURLToPath(new URL(".", import.meta.url));
const SRC = join(__dir, "..", "..", "src");

/**
 * Files that build a DeeplakeApi but intentionally do NOT route through
 * `.hivemind`. Each MUST carry a reason — this list is the audit trail.
 */
const ALLOWLIST: Record<string, string> = {
  "commands/session-prune.ts":
    "Account-level cleanup of the user's own sessions; not scoped to a directory's workspace.",
  "commands/docs.ts":
    "Docs use a separate per-(org,repo) consent + project-key model, not .hivemind workspace routing.",
  "mcp/cowork-ingest.ts":
    "Claude Cowork (desktop) has no directory context — a fixed COWORK_PROJECT, nothing to route on.",
  "notifications/sources/resume-brief.ts":
    "Display-only read built from creds.workspaceId; routing it means threading a resolved workspace in — tracked follow-up, not a silent writer.",
  "notifications/sources/open-goals.ts":
    "Display-only read (banner open-goals) built from the passed-in creds, not loadConfig — same follow-up as resume-brief.",
};

const ROUTER_TOKENS = ["loadRoutedConfig", "resolveDirConfig", "resolveCaptureConfig"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Repo-relative (posix) path under src/, e.g. "commands/goal.ts". */
function rel(abs: string): string {
  return abs.slice(SRC.length + 1).split("\\").join("/");
}

describe("dir-config single source of truth", () => {
  const files = walk(SRC);
  const apiSites = files.filter((f) => readFileSync(f, "utf-8").includes("new DeeplakeApi("));

  it("finds DeeplakeApi construction sites to guard (sanity)", () => {
    // If this ever hits 0 the glob/walk broke and the guard is silently vacuous.
    expect(apiSites.length).toBeGreaterThan(10);
  });

  it("every DeeplakeApi site routes through .hivemind or is allow-listed with a reason", () => {
    const offenders: string[] = [];
    for (const abs of apiSites) {
      const key = rel(abs);
      const src = readFileSync(abs, "utf-8");
      const routes = ROUTER_TOKENS.some((t) => src.includes(t));
      const allowed = key in ALLOWLIST;
      if (!routes && !allowed) {
        offenders.push(
          `${key}: builds a DeeplakeApi from an unrouted config. ` +
            `Use loadRoutedConfig() (src/dir-config.ts), or add an ALLOWLIST entry with a reason.`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the allow-list has no stale entries (each still builds a DeeplakeApi and still does not route)", () => {
    const stale: string[] = [];
    for (const key of Object.keys(ALLOWLIST)) {
      const abs = join(SRC, key);
      let src: string;
      try {
        src = readFileSync(abs, "utf-8");
      } catch {
        stale.push(`${key}: allow-listed but no longer exists — remove it.`);
        continue;
      }
      if (!src.includes("new DeeplakeApi(")) {
        stale.push(`${key}: allow-listed but no longer builds a DeeplakeApi — remove it.`);
      } else if (ROUTER_TOKENS.some((t) => src.includes(t))) {
        stale.push(`${key}: now routes — remove it from the allow-list so the guard covers it.`);
      }
    }
    expect(stale, stale.join("\n")).toEqual([]);
  });

  it("every allow-list entry carries a non-empty reason", () => {
    for (const [key, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.trim().length, `${key} needs a reason`).toBeGreaterThan(10);
    }
  });
});
