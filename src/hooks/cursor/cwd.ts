/**
 * The directory a Cursor hook event belongs to.
 *
 * Cursor runs user-level hooks (~/.cursor/hooks.json) with a process cwd that
 * is NOT the open project, so `process.cwd()` must never be used to locate a
 * `.hivemind` file. Prefer the per-event `cwd` (postToolUse / preToolUse),
 * then the first workspace root (every event carries `workspace_roots`), and
 * only fall back to the process cwd when Cursor sent neither.
 */
export function resolveCursorCwd(input: { cwd?: unknown; workspace_roots?: unknown }): string {
  if (typeof input.cwd === "string" && input.cwd) return input.cwd;
  const roots = input.workspace_roots;
  if (Array.isArray(roots) && roots.length > 0 && typeof roots[0] === "string" && roots[0]) return roots[0];
  return process.cwd();
}
