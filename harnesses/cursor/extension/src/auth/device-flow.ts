import { execFileSync } from "node:child_process";
import * as vscode from "vscode";
import { loadStoredCredentials, type StoredCredentials } from "./detector";
import { credentialsPath, deeplakeConfigDir } from "../utils/paths";
import { logSafe } from "../utils/output";
import { assertSafeCredentialFields, openExternalUrl, sanitizeApiUrl } from "./safe-url";

const DEFAULT_API_URL = "https://api.deeplake.ai";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function requestDeviceCode(apiUrl: string): Promise<DeviceCodeResponse> {
  const base = sanitizeApiUrl(apiUrl, DEFAULT_API_URL);
  const resp = await fetch(`${base}/auth/device/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!resp.ok) throw new Error(`Device flow unavailable: HTTP ${resp.status}`);
  return resp.json() as Promise<DeviceCodeResponse>;
}

async function pollForToken(deviceCode: string, apiUrl: string): Promise<DeviceTokenResponse | null> {
  const base = sanitizeApiUrl(apiUrl, DEFAULT_API_URL);
  const resp = await fetch(`${base}/auth/device/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  if (resp.ok) return resp.json() as Promise<DeviceTokenResponse>;
  if (resp.status === 400) {
    const err = (await resp.json().catch(() => null)) as { error?: string } | null;
    if (err?.error === "authorization_pending" || err?.error === "slow_down") return null;
    if (err?.error === "expired_token") throw new Error("Device code expired. Try again.");
    if (err?.error === "access_denied") throw new Error("Authorization denied.");
  }
  throw new Error(`Token polling failed: HTTP ${resp.status}`);
}

async function apiGet(path: string, token: string, apiUrl: string): Promise<unknown> {
  const base = sanitizeApiUrl(apiUrl, DEFAULT_API_URL);
  const resp = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

async function apiPost(path: string, body: unknown, token: string, apiUrl: string): Promise<unknown> {
  const base = sanitizeApiUrl(apiUrl, DEFAULT_API_URL);
  const resp = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

export async function saveCredentialsFromToken(token: string, apiUrl: string): Promise<StoredCredentials> {
  const safeApiUrl = sanitizeApiUrl(apiUrl, DEFAULT_API_URL);
  const user = (await apiGet("/me", token, safeApiUrl)) as { id: string; name: string; email?: string };
  const userName = user.name || (user.email ? user.email.split("@")[0] : "unknown");
  const orgs = (await apiGet("/organizations", token, safeApiUrl)) as { id: string; name: string }[];
  if (!Array.isArray(orgs) || orgs.length === 0) throw new Error("No organizations found for this account.");
  const org = orgs[0];
  const tokenData = (await apiPost(
    "/users/me/tokens",
    { name: `hivemind-extension-${Date.now()}`, duration: 365 * 24 * 3600, organization_id: org.id },
    token,
    safeApiUrl,
  )) as { token: { token: string } };

  const creds: StoredCredentials = {
    token: tokenData.token.token,
    orgId: org.id,
    orgName: org.name,
    userName,
    apiUrl: safeApiUrl,
    savedAt: new Date().toISOString(),
  };

  assertSafeCredentialFields(creds);

  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(deeplakeConfigDir(), { recursive: true, mode: 0o700 });
  writeFileSync(credentialsPath(), JSON.stringify(creds, null, 2), { mode: 0o600 });
  return creds;
}

export async function loginBrowserFlow(): Promise<StoredCredentials> {
  const apiUrl = sanitizeApiUrl(process.env.HIVEMIND_API_URL, DEFAULT_API_URL);
  const code = await requestDeviceCode(apiUrl);
  await openExternalUrl(code.verification_uri_complete);
  await vscode.window.showInformationMessage(
    `Complete sign-in in your browser. Code: ${code.user_code}`,
    "Open browser again",
  ).then(async (choice) => {
    if (choice === "Open browser again") await openExternalUrl(code.verification_uri_complete);
  });

  const interval = Math.max(code.interval || 5, 5) * 1000;
  const deadline = Date.now() + code.expires_in * 1000;

  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Waiting for Hivemind sign-in…", cancellable: true },
    async (_progress, cancelToken) => {
      while (Date.now() < deadline) {
        if (cancelToken.isCancellationRequested) throw new Error("Login cancelled.");
        await new Promise((r) => setTimeout(r, interval));
        const result = await pollForToken(code.device_code, apiUrl);
        if (result) {
          logSafe("Hivemind browser login succeeded.");
          return saveCredentialsFromToken(result.access_token, apiUrl);
        }
      }
      throw new Error("Device code expired.");
    },
  );
}

export async function loginViaHivemindCli(): Promise<boolean> {
  try {
    execFileSync("hivemind", ["login"], { stdio: "inherit", timeout: 300000 });
    return loadStoredCredentials() !== null;
  } catch {
    return false;
  }
}
