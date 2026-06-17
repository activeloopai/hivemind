import { existsSync } from "node:fs";
import type { AuthState } from "../types/health";
import { credentialsPath } from "../utils/paths";
import { readJson } from "../utils/fs-json";
import { runHealthCheck } from "../health/checker";
import { sanitizeApiUrl } from "./safe-url";

export interface StoredCredentials {
  token: string;
  orgId: string;
  orgName?: string;
  userName?: string;
  workspaceId?: string;
  apiUrl?: string;
  savedAt: string;
}

const DEFAULT_API_URL = "https://api.deeplake.ai";

export function loadStoredCredentials(): StoredCredentials | null {
  return readJson<StoredCredentials>(credentialsPath());
}

export function isCredentialFilePresent(): boolean {
  return existsSync(credentialsPath()) && loadStoredCredentials() !== null;
}

async function validateCredentialsOnline(creds: StoredCredentials): Promise<"online" | "logged_out" | "offline"> {
  const apiUrl = sanitizeApiUrl(creds.apiUrl, DEFAULT_API_URL);
  try {
    const resp = await fetch(`${apiUrl}/me`, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 401 || resp.status === 403) return "logged_out";
    return resp.ok ? "online" : "offline";
  } catch {
    return "offline";
  }
}

export async function detectAuthState(): Promise<AuthState> {
  const creds = loadStoredCredentials();
  const health = await runHealthCheck();
  const d3 = health.dimensions.find((d) => d.id === "d3");
  const cursorAgentLoggedIn = d3?.status === "ok";
  const cursorAgentMessage = d3?.message;

  if (!creds) {
    return {
      state: "logged_out",
      cursorAgentLoggedIn,
      cursorAgentMessage,
    };
  }

  const identity = creds.userName ?? creds.orgName ?? creds.orgId;
  const online = await validateCredentialsOnline(creds);
  if (online === "offline") {
    return {
      state: "unknown_offline",
      identity,
      orgName: creds.orgName,
      workspaceId: creds.workspaceId,
      cursorAgentLoggedIn,
      cursorAgentMessage,
    };
  }
  if (online === "logged_out") {
    return {
      state: "logged_out",
      identity,
      orgName: creds.orgName,
      workspaceId: creds.workspaceId,
      cursorAgentLoggedIn,
      cursorAgentMessage,
    };
  }

  return {
    state: "logged_in",
    identity,
    orgName: creds.orgName,
    workspaceId: creds.workspaceId,
    cursorAgentLoggedIn,
    cursorAgentMessage,
  };
}

export function formatIdentity(auth: AuthState): string {
  if (!auth.identity) return "Not logged in";
  const parts = [auth.identity];
  if (auth.orgName) parts.push(`org: ${auth.orgName}`);
  if (auth.workspaceId) parts.push(`workspace: ${auth.workspaceId}`);
  return parts.join(" · ");
}
