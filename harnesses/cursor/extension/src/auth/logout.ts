import { unlinkSync } from "node:fs";
import * as vscode from "vscode";
import { credentialsPath } from "../utils/paths";
import { logSafe } from "../utils/output";

export async function logout(): Promise<void> {
  let removed = false;
  let notFound = false;
  try {
    unlinkSync(credentialsPath());
    removed = true;
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      notFound = true;
    } else {
      const message = `Failed to clear credentials: ${e.message ?? "unknown error"}`;
      logSafe(message);
      await vscode.window.showErrorMessage(message);
      return;
    }
  }

  const message = removed
    ? "Hivemind credentials cleared from ~/.deeplake/credentials.json. Hooks remain installed; shared memory is inactive until you log in again."
    : notFound
      ? "No credentials file found to remove. Hooks remain installed."
      : "Credentials were not removed due to an unexpected error.";

  logSafe(message);
  await vscode.window.showInformationMessage(message);
}
