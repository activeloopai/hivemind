import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Hivemind");
  }
  return channel;
}

/** Safe log: never pass secrets through this helper. */
export function logSafe(message: string): void {
  getOutputChannel().appendLine(message);
}

export function logError(message: string, err?: unknown): void {
  const detail = err instanceof Error ? err.message : err ? String(err) : "";
  logSafe(detail ? `${message}: ${detail}` : message);
}
