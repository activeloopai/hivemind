import { runHivemindCli } from "../webview/data-bridge";
import { logSafe } from "../utils/output";
import { backfillCursorLinks, syncSkillsToCursor } from "./skill-sync";

/**
 * Run skill pull fan-out and Cursor symlink sync on extension activation.
 * Respects HIVEMIND_AUTOPULL_DISABLED (same contract as SessionStart auto-pull).
 */
export async function runAutoSyncOnActivation(projectRoot?: string): Promise<void> {
  if (process.env.HIVEMIND_AUTOPULL_DISABLED === "1") {
    logSafe("Auto skill sync skipped (HIVEMIND_AUTOPULL_DISABLED=1).");
    return;
  }

  const cwd = projectRoot ?? process.cwd();
  try {
    const pullResult = await runHivemindCli(
      ["skillify", "pull", "--all-users", "--to", "global"],
      cwd,
    );
    if (pullResult.ok) {
      logSafe("Auto skill pull completed.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logSafe(`Auto-pull skipped: ${msg}`);
  }

  try {
    const backfilled = backfillCursorLinks(projectRoot);
    if (backfilled > 0) {
      logSafe(`Backfilled Cursor links for ${backfilled} manifest entries.`);
    }
    const state = syncSkillsToCursor(projectRoot);
    if (state.erroredCount > 0) {
      logSafe(
        `Cursor skill sync: ${state.syncedCount} synced, ${state.skippedCount} partial, ${state.erroredCount} failed.`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logSafe(`Cursor skill sync failed: ${msg}`);
  }
}
