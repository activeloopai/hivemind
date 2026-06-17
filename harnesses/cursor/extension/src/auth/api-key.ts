import * as vscode from "vscode";
import { saveCredentialsFromToken } from "./device-flow";
import { loadStoredCredentials } from "./detector";
import { logSafe } from "../utils/output";

const DEFAULT_API_URL = "https://api.deeplake.ai";

export async function loginApiKey(): Promise<boolean> {
  const token = await vscode.window.showInputBox({
    prompt: "Enter your Hivemind API token",
    password: true,
    ignoreFocusOut: true,
    placeHolder: "Paste token (never logged or stored in settings)",
  });
  if (!token) return false;

  const apiUrl = process.env.HIVEMIND_API_URL ?? DEFAULT_API_URL;
  try {
    await saveCredentialsFromToken(token.trim(), apiUrl);
    logSafe("Hivemind API key login succeeded.");
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid token";
    await vscode.window.showErrorMessage(`Login failed: ${msg}`);
    return false;
  }
}

export async function promptLoginMethod(): Promise<boolean> {
  const choice = await vscode.window.showQuickPick(
    [
      { label: "Browser sign-in (device flow)", id: "browser" },
      { label: "API key", id: "apikey" },
      { label: "Terminal (hivemind login)", id: "cli" },
    ],
    { placeHolder: "Choose Hivemind login method" },
  );
  if (!choice) return false;

  if (choice.id === "browser") {
    const { loginBrowserFlow } = await import("./device-flow");
    try {
      await loginBrowserFlow();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      await vscode.window.showErrorMessage(msg);
      return false;
    }
  }
  if (choice.id === "apikey") {
    return loginApiKey();
  }
  const { loginViaHivemindCli } = await import("./device-flow");
  return loginViaHivemindCli();
}

export function getActiveCredentialsSummary(): string | undefined {
  const creds = loadStoredCredentials();
  if (!creds) return undefined;
  return creds.userName ?? creds.orgName ?? "Logged in";
}
