/**
 * Subsystem grouping for wiki pages — pure, no I/O.
 *
 * A "subsystem" is a directory prefix: the first two path segments, or three
 * when the tree nests everything under a `src/` root (so `src/pkg/core/…`
 * groups as `src/pkg/core`, not the useless `src/pkg`). Root-level files
 * group under their first segment.
 *
 * Split rule (failure design): a group larger than `maxFiles` is split one
 * directory level deeper; files that have no deeper level stay in the parent
 * group. This bounds every LLM page prompt without dropping members.
 */

export interface WikiGroup {
  /** Subsystem key, e.g. `xarray/backends` — becomes doc_id `wiki/<key>`. */
  key: string;
  /** Member source files (repo-relative), sorted. */
  files: string[];
}

export const DEFAULT_MAX_FILES = 40;

function keyFor(file: string, depth: number): string {
  const parts = file.split("/");
  if (parts.length <= depth) return parts.slice(0, -1).join("/") || parts[0];
  return parts.slice(0, depth).join("/");
}

function baseDepth(file: string): number {
  return file.split("/")[0] === "src" ? 3 : 2;
}

export function groupFilesBySubsystem(
  files: string[],
  opts: { maxFiles?: number } = {},
): WikiGroup[] {
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const key = keyFor(f, baseDepth(f));
    const list = groups.get(key) ?? [];
    list.push(f);
    groups.set(key, list);
  }

  // Split oversized groups one level deeper; members with no deeper directory
  // stay behind under the parent key.
  const out = new Map<string, string[]>();
  for (const [key, members] of groups) {
    if (members.length <= maxFiles) {
      out.set(key, members);
      continue;
    }
    const depth = key.split("/").length + 1;
    for (const f of members) {
      const deeper = keyFor(f, depth);
      const target = deeper === f ? key : deeper; // file with no deeper dir → parent
      const list = out.get(target) ?? [];
      list.push(f);
      out.set(target, list);
    }
  }

  return [...out.entries()]
    .map(([key, members]) => ({ key, files: [...members].sort() }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
