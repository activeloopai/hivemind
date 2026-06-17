import * as vscode from "vscode";
import type { StatusSnapshot } from "../types/health";
import { autoWireHooks, unwireHooks, setBundledExtensionSrc } from "../health";
import { promptLoginMethod, logout } from "../auth";
import { getOutputChannel } from "../utils/output";
import { wikiWorkerLogPath } from "../utils/paths";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

export async function runOnboarding(poll: () => Promise<StatusSnapshot>): Promise<void> {
  const wire = await autoWireHooks();
  if (!wire.ok) {
    await vscode.window.showErrorMessage(wire.message);
  } else if (wire.reloadRequired) {
    await vscode.window.showInformationMessage(wire.message, "Reload Window").then((c) => {
      if (c === "Reload Window") void vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
  }
  await promptLoginMethod();
  await poll();
}

export async function wireHooksCommand(): Promise<void> {
  const result = await autoWireHooks();
  if (result.ok) {
    const actions = result.reloadRequired ? ["Reload Window"] : [];
    await vscode.window.showInformationMessage(result.message, ...actions).then((c) => {
      if (c === "Reload Window") void vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
  } else {
    await vscode.window.showErrorMessage(result.message);
  }
}

export function openLogsCommand(): void {
  const ch = getOutputChannel();
  ch.show(true);
  if (existsSync(wikiWorkerLogPath())) {
    try {
      const tail = readFileSync(wikiWorkerLogPath(), "utf-8").split(/\r?\n/).slice(-40).join("\n");
      ch.appendLine("--- wiki-worker.log (tail) ---");
      ch.appendLine(tail);
    } catch {
      ch.appendLine("(could not read wiki-worker.log)");
    }
  }
}

export async function unwireHooksCommand(): Promise<void> {
  const result = await unwireHooks();
  if (result.ok) {
    const actions = result.reloadRequired ? ["Reload Window"] : [];
    await vscode.window.showInformationMessage(result.message, ...actions).then((c) => {
      if (c === "Reload Window") void vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
  } else {
    await vscode.window.showErrorMessage(result.message);
  }
}

export function registerHivemindCommands(
  poll: () => Promise<StatusSnapshot>,
  showDetail: () => void,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("hivemind.runOnboarding", () => runOnboarding(poll)),
    vscode.commands.registerCommand("hivemind.login", () => promptLoginMethod().then(() => poll())),
    vscode.commands.registerCommand("hivemind.logout", () => logout().then(() => poll())),
    vscode.commands.registerCommand("hivemind.showStatus", showDetail),
    vscode.commands.registerCommand("hivemind.wireHooks", wireHooksCommand),
    vscode.commands.registerCommand("hivemind.unwireHooks", unwireHooksCommand),
    vscode.commands.registerCommand("hivemind.openLogs", openLogsCommand),
  ];
}
