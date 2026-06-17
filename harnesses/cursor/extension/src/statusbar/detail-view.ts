import * as vscode from "vscode";
import type { StatusSnapshot } from "../types/health";
import { formatIdentity } from "../auth/detector";
import { promptLoginMethod } from "../auth";
import { autoWireHooks, getHivemindInstallCommand } from "../health";
import { wireHooksCommand } from "./commands";

export async function showStatusDetail(snapshot: StatusSnapshot): Promise<void> {
  const items: vscode.QuickPickItem[] = snapshot.health.dimensions.map((d) => ({
    label: `${d.status === "ok" ? "$(check)" : "$(warning)"} ${d.label}`,
    description: d.message,
    detail: d.remediation,
  }));

  items.push({
    label: "$(key) Hivemind identity",
    description: formatIdentity(snapshot.auth),
  });

  if (snapshot.auth.cursorAgentLoggedIn === false) {
    items.push({
      label: "$(warning) cursor-agent login",
      description: snapshot.auth.cursorAgentMessage ?? "Log in to cursor-agent for summaries",
    });
  }

  items.push({ label: "", kind: vscode.QuickPickItemKind.Separator, description: "Actions" });
  items.push({ label: "$(sign-in) Log in to Hivemind", description: "Browser or API key" });
  items.push({ label: "$(plug) Wire / refresh hooks", description: "Merge Hivemind lifecycle hooks" });
  items.push({ label: "$(rocket) Run full onboarding", description: "Wire hooks + log in" });

  const d1 = snapshot.health.dimensions.find((d) => d.id === "d1");
  if (d1?.installCommand) {
    items.push({
      label: "$(copy) Copy Hivemind install command",
      description: d1.installCommand,
    });
  }

  const pick = await vscode.window.showQuickPick(items, {
    title: "Hivemind Status",
    matchOnDescription: true,
  });
  if (!pick) return;

  if (pick.label.includes("Log in")) {
    await promptLoginMethod();
    return;
  }
  if (pick.label.includes("Wire")) {
    await wireHooksCommand();
    return;
  }
  if (pick.label.includes("onboarding")) {
    await vscode.commands.executeCommand("hivemind.runOnboarding");
    return;
  }
  if (pick.label.includes("Copy Hivemind install")) {
    await vscode.env.clipboard.writeText(getHivemindInstallCommand());
    await vscode.window.showInformationMessage("Install command copied to clipboard.");
  }
}
