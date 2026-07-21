/**
 * SessionStart context note for the docs wiki — the one place the agent
 * learns the wiki exists.
 *
 * Gated on the SAME per-(org, project) consent registry that gates auto
 * sync (`~/.deeplake/docs-auto.json`): if the user opted this repo into
 * auto-maintained docs, they have a corpus worth advertising; if not, the
 * note would point at nothing. Local file read only — no network on the
 * SessionStart hot path.
 *
 * The wording is deliberately ON-DEMAND, not wiki-first: the QA benchmark
 * (autodoc-benchmark/RESULTS-arms.md, Phase 8 + 2026-07-09 rerun) showed
 * "read the wiki first" actively hurts answer quality, while on-demand
 * lookup is neutral. The note therefore frames the wiki as an orientation
 * tool and requires confirming claims against source.
 */

import { isAutoEnabled } from "./auto-registry.js";

const NOTE = `

DOCS WIKI (auto-synced for this repo): narrative wiki pages (one per subsystem) and per-file docs live under ~/.deeplake/memory/docs/, kept in sync with the code on every commit.
- Browse: \`ls ~/.deeplake/memory/docs/\` — wiki pages under \`docs/wiki/\`, per-file docs mirror source paths.
- Search: \`cat ~/.deeplake/memory/docs/find/<query words>\` (hybrid keyword+semantic).
Use them to ORIENT — which subsystem or files own a behavior. Confirm every claim about code behavior against the source files before citing it; do not answer from the wiki alone.
Note: the wiki may occasionally be incomplete or lag behind the code (first generation still running, or a refresh cycle pending). If a page is missing or contradicts the source, trust the source.`;

/**
 * Returns the wiki context note ("" when the repo has not opted in, or on
 * any registry read failure — a docs note must never break SessionStart).
 */
export function docsWikiContextNote(
  orgId: string,
  project: string,
  isAutoEnabledFn: (orgId: string, project: string) => boolean = isAutoEnabled,
): string {
  try {
    return isAutoEnabledFn(orgId, project) ? NOTE : "";
  } catch {
    return "";
  }
}
