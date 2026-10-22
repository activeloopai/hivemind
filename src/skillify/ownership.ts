/**
 * One rule for "is this skill mine": the user is the `author`, or the user
 * is listed in `contributors`. A cross-author merge keeps the survivor's
 * `author` and adds every merged author to `contributors`, so each of them
 * continues to see and edit the merged skill as their own.
 */

export function isOwnSkill(
  me: string | undefined,
  author: string | undefined,
  contributors: readonly string[] = [],
): boolean {
  if (!me) return false;
  return author === me || contributors.includes(me);
}

/** Accept a JSON-encoded list or a real array; anything else is empty. */
export function parseContributorList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* not JSON */ }
  }
  return [];
}
