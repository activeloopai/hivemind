/**
 * Shared AGENTS.md hivemind-block management.
 *
 * AGENTS.md is the global agent-instructions file that several harnesses
 * auto-load into the model's context every session — SILENTLY, with no
 * user-visible TUI cell:
 *   - pi    → `~/.pi/agent/AGENTS.md`
 *   - Codex → `~/.codex/AGENTS.md`
 *
 * We manage only a marker-fenced block and never touch the user's own
 * content. The marker pair is shared across harnesses (they write to
 * different files, so there is no collision).
 */

export const HIVEMIND_BLOCK_START = "<!-- BEGIN hivemind-memory -->";
export const HIVEMIND_BLOCK_END = "<!-- END hivemind-memory -->";

/**
 * Insert or replace the hivemind block in `existing`. `block` is the full
 * marker-fenced block (START … END). Idempotent: a prior block (matched on
 * the marker pair) is stripped before re-appending, so repeated installs
 * leave exactly one block. User content outside the markers is preserved.
 */
export function upsertMarkedBlock(
  existing: string | null,
  block: string,
  start: string = HIVEMIND_BLOCK_START,
  end: string = HIVEMIND_BLOCK_END,
): string {
  if (!existing) return `${block}\n`;
  const first = findFirstBlock(existing, start, end);
  // No well-formed block (none at all, or only a stray/unclosed BEGIN) — append
  // a fresh one. We never pair a stray BEGIN with our block's END, so user text
  // under a half-written marker is preserved.
  if (!first) return `${existing.trimEnd()}\n\n${block}\n`;
  // Replace the first WELL-FORMED block IN PLACE — keeping its position relative
  // to the user's own notes so their overrides keep precedence — and strip any
  // DUPLICATE blocks from the tail (bad merge / manual paste collapse to one).
  const before = existing.slice(0, first.startIdx).trimEnd();
  const after = stripMarkedBlock(existing.slice(first.endIdx + end.length), start, end)
    .replace(/^\n+/, "")
    .trimEnd();
  const head = before ? `${before}\n\n` : "";
  const tail = after ? `\n\n${after}` : "";
  return `${head}${block}${tail}\n`;
}

/**
 * Remove EVERY hivemind block from `existing`, preserving surrounding content.
 * Loops so duplicate marker pairs are all removed; skips stray/unclosed BEGIN
 * markers (never pairing them with a later block's END) so user data under a
 * half-written marker is never truncated.
 */
export function stripMarkedBlock(
  existing: string,
  start: string = HIVEMIND_BLOCK_START,
  end: string = HIVEMIND_BLOCK_END,
): string {
  let text = existing;
  for (;;) {
    const block = findFirstBlock(text, start, end);
    if (!block) return text;
    const before = text.slice(0, block.startIdx).trimEnd();
    const after = text.slice(block.endIdx + end.length).replace(/^\n+/, "");
    if (!before && !after) text = "";
    else if (!before) text = after;
    else if (!after) text = `${before}\n`;
    else text = `${before}\n\n${after}`;
  }
}

/**
 * Locate the first WELL-FORMED block: a BEGIN whose matching END has no other
 * BEGIN before it. Stray/unclosed BEGIN markers (another BEGIN appears before
 * the next END, or there is no END at all) are skipped so they're never paired
 * with a later block's END — the shared guard both upsert and strip rely on to
 * avoid deleting user content between a stray marker and our block.
 */
function findFirstBlock(
  text: string,
  start: string,
  end: string,
): { startIdx: number; endIdx: number } | null {
  let from = 0;
  for (;;) {
    const startIdx = text.indexOf(start, from);
    if (startIdx === -1) return null;
    const endIdx = text.indexOf(end, startIdx);
    if (endIdx === -1) return null;
    const nextStart = text.indexOf(start, startIdx + start.length);
    if (nextStart !== -1 && nextStart < endIdx) {
      from = startIdx + start.length;
      continue;
    }
    return { startIdx, endIdx };
  }
}
