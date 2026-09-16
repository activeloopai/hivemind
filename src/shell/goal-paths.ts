/**
 * Path classifier + decompose/compose helpers for goal paths inside
 * the Deeplake VFS.
 *
 * The agent operates on a normal-looking filesystem under the memory
 * mount; the VFS in deeplake-fs.ts uses these helpers to detect goal
 * paths and dispatch reads/writes to the dedicated hivemind_goals
 * table instead of the generic memory table. Path encoding is the
 * source of truth for owner / status / goal_id; the row `content`
 * column stores only the descriptive markdown body.
 *
 * Path convention (always absolute, always start with the memory
 * mount; the mount prefix itself is stripped before classification):
 *
 *   /memory/goal/<owner>/<status>/<goal_id>.md
 *
 * status ∈ {opened, in_progress, closed}. owner is the user_email or
 * userName the agent reports. goal_id is a stable UUID-ish slug the
 * agent generates at create time.
 *
 * Anything that does not match this prefix is classified as "memory"
 * and handled by the existing VFS code path. Malformed goal paths
 * (wrong number of segments, missing .md extension, unknown status
 * value) are also "memory" — the caller can decide to reject them at
 * the write boundary if desired.
 */

const VALID_STATUS = new Set(["opened", "in_progress", "closed"]);

/** Classification result for a VFS path. */
export type PathKind = "goal" | "memory";

export interface GoalPathParts {
  owner: string;
  status: "opened" | "in_progress" | "closed";
  goal_id: string;
}

/**
 * Strip any leading mount prefix and split the remainder into path
 * segments. Returns `null` for empty paths.
 *
 * The deeplake-shell mount is configurable AND agent writes can
 * arrive in multiple shapes:
 *   - Write tool, mount-relative:           /goal/<u>/<s>/<id>.md
 *   - Some test mounts:                     /memory/goal/<u>/...
 *   - Bash `echo > ~/...` inside the shell
 *     where HOME=mount=/:                   /.deeplake/memory/goal/<u>/...
 *   - Bash on the host filesystem:          /home/<user>/.deeplake/memory/goal/<u>/...
 *
 * We accept all of them by finding the last occurrence of
 * `/memory/` in the path and treating everything after it as the
 * mount-relative form. Fallback for paths without `/memory/` is the
 * original "strip leading slash + optional memory/ prefix" logic.
 */
function segmentsUnderMemory(p: string): string[] | null {
  let s = p.replace(/\/+$/, "");
  // If the path contains a /memory/ segment anywhere, take what
  // follows the LAST such occurrence. This covers .deeplake/memory/
  // and /home/<user>/.deeplake/memory/ prefixes that arrive from
  // Bash `echo > ~/...` redirects inside the deeplake-shell.
  const memIdx = s.lastIndexOf("/memory/");
  if (memIdx >= 0) {
    s = s.slice(memIdx + "/memory/".length);
  } else {
    s = s.replace(/^\/+/, "");
    if (s === "memory") return null;
    if (s.startsWith("memory/")) s = s.slice("memory/".length);
  }
  if (s.length === 0) return null;
  return s.split("/");
}

/**
 * Classify a VFS path into "goal" or "memory". Performs the
 * minimum validation needed to dispatch — full validation (status
 * enum, segment count, .md extension) happens via decompose helpers.
 */
export function classifyPath(p: string): PathKind {
  const segs = segmentsUnderMemory(p);
  if (!segs) return "memory";
  if (segs[0] === "goal") {
    // /memory/goal/<owner>/<status>/<goal_id>.md → 4 segs after stripping "memory/"
    if (segs.length === 4 && segs[3].endsWith(".md") && VALID_STATUS.has(segs[2])) {
      return "goal";
    }
    return "memory";
  }
  return "memory";
}

/**
 * Decompose a goal path into its structural parts. Throws when the
 * path is not a well-formed goal path — call `classifyPath` first if
 * you want a soft check.
 */
export function decomposeGoalPath(p: string): GoalPathParts {
  const segs = segmentsUnderMemory(p);
  if (!segs || segs.length !== 4 || segs[0] !== "goal") {
    throw new Error(`Not a goal path: ${p}`);
  }
  const status = segs[2];
  if (!VALID_STATUS.has(status)) {
    throw new Error(`Invalid goal status in path: ${p} (got '${status}')`);
  }
  const filename = segs[3];
  if (!filename.endsWith(".md")) {
    throw new Error(`Goal path must end with .md: ${p}`);
  }
  return {
    owner: segs[1],
    status: status as GoalPathParts["status"],
    goal_id: filename.slice(0, -".md".length),
  };
}

/**
 * Build the canonical goal path from its parts. Output matches the
 * VFS-internal form (no mount prefix) because that is what
 * deeplake-fs caches and DB rows store.
 */
export function composeGoalPath(parts: GoalPathParts): string {
  return `/goal/${parts.owner}/${parts.status}/${parts.goal_id}.md`;
}
