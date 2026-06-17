import * as vscode from "vscode";
import { join } from "node:path";
import { HealthPoller } from "./statusbar/poller";
import { getStatusBarPresentation } from "./statusbar/indicator";
import { registerHivemindCommands } from "./statusbar/commands";
import { showStatusDetail } from "./statusbar/detail-view";
import { DashboardPanel, registerDashboardWebview } from "./webview/DashboardPanel";
import { runAutoSyncOnActivation } from "./bridge/auto-sync";
import { setBundledExtensionSrc } from "./health";
import { logSafe } from "./utils/output";
import type { StatusSnapshot } from "./types/health";

let statusBarItem: vscode.StatusBarItem | undefined;
let poller: HealthPoller | undefined;

export function activate(context: vscode.ExtensionContext): void {
  logSafe("Hivemind extension activating…");
  setBundledExtensionSrc(join(context.extensionUri.fsPath, "bundle"));

  poller = new HealthPoller();
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "hivemind.showStatus";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const updateBar = (snap: StatusSnapshot): void => {
    const pres = getStatusBarPresentation(snap.barState);
    statusBarItem!.text = pres.text;
    statusBarItem!.tooltip = snap.tooltip;
    statusBarItem!.backgroundColor = new vscode.ThemeColor(pres.backgroundColor);
  };

  context.subscriptions.push(
    poller.onUpdate((snap) => updateBar(snap)),
    vscode.commands.registerCommand("hivemind.pollHealthNow", () => poller!.pollOnce(workspaceRoot)),
    ...registerHivemindCommands(
      () => poller!.pollOnce(workspaceRoot),
      () => {
        void poller!.pollOnce(workspaceRoot).then((snap) => showStatusDetail(snap));
      },
    ),
    vscode.commands.registerCommand("hivemind.openDashboard", () => {
      DashboardPanel.createOrShow(context.extensionUri, context);
    }),
  );

  registerDashboardWebview(context);

  void runAutoSyncOnActivation(workspaceRoot);

  poller.start();

  if (!context.globalState.get<boolean>("hivemind.onboardingPrompted")) {
    void poller.pollOnce(workspaceRoot).then(async (snap) => {
      if (snap.barState !== "healthy") {
        const run = await vscode.window.showInformationMessage(
          "Hivemind is not fully configured for Cursor yet.",
          "Run onboarding",
          "Later",
        );
        if (run === "Run onboarding") {
          await vscode.commands.executeCommand("hivemind.runOnboarding");
        }
      }
      await context.globalState.update("hivemind.onboardingPrompted", true);
    });
  }
}

export function deactivate(): void {
  poller?.stop();
  statusBarItem?.dispose();
}
