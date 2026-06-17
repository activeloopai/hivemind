import * as vscode from "vscode";

const ALLOWED_AUTH_HOSTS = new Set([
  "api.deeplake.ai",
  "app.deeplake.ai",
  "auth.deeplake.ai",
]);

/** Validate HTTPS URLs from the device-flow API before opening externally. */
export function assertSafeExternalUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid verification URL from auth server.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Verification URL must use HTTPS.");
  }
  if (!ALLOWED_AUTH_HOSTS.has(parsed.hostname)) {
    throw new Error(`Unexpected auth host: ${parsed.hostname}`);
  }
  return parsed;
}

export async function openExternalUrl(raw: string): Promise<boolean> {
  try {
    const parsed = assertSafeExternalUrl(raw);
    return vscode.env.openExternal(vscode.Uri.parse(parsed.toString()));
  } catch {
    return false;
  }
}

export function sanitizeApiUrl(raw: string | undefined, fallback: string): string {
  const candidate = raw ?? fallback;
  const parsed = assertSafeExternalUrl(candidate.endsWith("/") ? candidate.slice(0, -1) : candidate);
  return parsed.origin;
}

const TOKENish = /^[\x21-\x7E]{8,4096}$/;

export function assertSafeCredentialFields(fields: {
  token: string;
  orgId: string;
  orgName?: string;
  userName?: string;
  apiUrl?: string;
}): void {
  if (!TOKENish.test(fields.token)) throw new Error("Invalid token shape from auth server.");
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(fields.orgId)) throw new Error("Invalid org id from auth server.");
  if (fields.userName && !/^[a-zA-Z0-9._-]{1,128}$/.test(fields.userName)) {
    throw new Error("Invalid user name from auth server.");
  }
  if (fields.orgName && fields.orgName.length > 256) {
    throw new Error("Invalid org name from auth server.");
  }
  if (fields.apiUrl) sanitizeApiUrl(fields.apiUrl, fields.apiUrl);
}
