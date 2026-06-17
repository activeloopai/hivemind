/**
 * Deeplake authentication — Device Authorization Flow (RFC 8628)
 * and org/workspace management.
 */

import { execFileSync } from "node:child_process";
import { deeplakeClientHeader } from "../utils/client-header.js";
import { hivemindInstallIDHeader } from "./install-id.js";
import {
  type Credentials,
  loadCredentials,
  saveCredentials,
  deleteCredentials,
} from "./auth-creds.js";

// Re-export so existing importers keep working without churn.
export { loadCredentials, saveCredentials, deleteCredentials };
export type { Credentials };

const DEFAULT_API_URL = "https://api.deeplake.ai";

// Output goes to stderr by default (safe for hooks).
// auth-login.js sets this to console.log for direct CLI usage.
export let authLog = (msg: string) => process.stderr.write(msg + "\n");

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

// ── JWT Helpers ──────────────────────────────────────────────────────────────

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) payload += "=";
    return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// ── API Helpers ──────────────────────────────────────────────────────────────

async function apiGet(path: string, token: string, apiUrl: string, orgId?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader(),
  };
  if (orgId) headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { headers });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json();
}

async function apiPost(path: string, body: unknown, token: string, apiUrl: string, orgId?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader(),
  };
  if (orgId) headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
  return resp.json();
}

async function apiDelete(path: string, token: string, apiUrl: string, orgId?: string): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...deeplakeClientHeader(),
  };
  if (orgId) headers["X-Activeloop-Org-Id"] = orgId;
  const resp = await fetch(`${apiUrl}${path}`, { method: "DELETE", headers });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text().catch(() => "")}`);
}

// ── Device Flow ──────────────────────────────────────────────────────────────

export async function requestDeviceCode(apiUrl = DEFAULT_API_URL): Promise<DeviceCodeResponse> {
  const resp = await fetch(`${apiUrl}/auth/device/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
      ...hivemindInstallIDHeader(),
    },
  });
  if (!resp.ok) throw new Error(`Device flow unavailable: HTTP ${resp.status}`);
  return resp.json() as Promise<DeviceCodeResponse>;
}

export async function pollForToken(deviceCode: string, apiUrl = DEFAULT_API_URL): Promise<DeviceTokenResponse | null> {
  const resp = await fetch(`${apiUrl}/auth/device/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...deeplakeClientHeader(),
      ...hivemindInstallIDHeader(),
    },
    body: JSON.stringify({ device_code: deviceCode }),
  });
  if (resp.ok) return resp.json() as Promise<DeviceTokenResponse>;
  if (resp.status === 400) {
    const err = await resp.json().catch(() => null) as { error?: string } | null;
    if (err?.error === "authorization_pending" || err?.error === "slow_down") return null;
    if (err?.error === "expired_token") throw new Error("Device code expired. Try again.");
    if (err?.error === "access_denied") throw new Error("Authorization denied.");
  }
  throw new Error(`Token polling failed: HTTP ${resp.status}`);
}

function openBrowser(url: string): boolean {
  // The URL is server-derived (device-flow `verification_uri_complete`), so
  // treat it as untrusted: only ever hand a parsed, https-scheme URL to an OS
  // opener. Anything else (other schemes, malformed) is refused outright.
  let safeUrl: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    safeUrl = parsed.href;
  } catch {
    return false;
  }
  try {
    // Fixed-argv spawn, never a shell. On Windows we use rundll32's
    // FileProtocolHandler rather than `cmd /c start`: cmd re-parses its own
    // command line (`&`, `^`, `|`), which would reintroduce an injection sink
    // even with fixed argv. rundll32 is execFile'd directly with no
    // interpreter, so the validated URL is passed as an opaque argument.
    if (process.platform === "darwin") {
      execFileSync("open", [safeUrl], { stdio: "ignore", timeout: 5000 });
    } else if (process.platform === "win32") {
      execFileSync("rundll32", ["url.dll,FileProtocolHandler", safeUrl], { stdio: "ignore", timeout: 5000 });
    } else {
      execFileSync("xdg-open", [safeUrl], { stdio: "ignore", timeout: 5000 });
    }
    return true;
  } catch {
    return false;
  }
}

export async function deviceFlowLogin(apiUrl = DEFAULT_API_URL): Promise<{ token: string; expiresIn: number }> {
  const code = await requestDeviceCode(apiUrl);

  const opened = openBrowser(code.verification_uri_complete);
  const msg = [
    "\nDeeplake Authentication",
    "─".repeat(40),
    `\nOpen this URL: ${code.verification_uri_complete}`,
    `Or visit ${code.verification_uri} and enter code: ${code.user_code}`,
    opened ? "\nBrowser opened. Waiting for sign in..." : "\nWaiting for sign in...",
  ].join("\n");

  // Return the message and polling function for the caller to handle
  process.stderr.write(msg + "\n");

  const interval = Math.max(code.interval || 5, 5) * 1000;
  const deadline = Date.now() + code.expires_in * 1000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));
    const result = await pollForToken(code.device_code, apiUrl);
    if (result) {
      process.stderr.write("\nAuthentication successful!\n");
      return { token: result.access_token, expiresIn: result.expires_in };
    }
  }
  throw new Error("Device code expired.");
}

// ── Organization Commands ────────────────────────────────────────────────────

export async function listOrgs(token: string, apiUrl = DEFAULT_API_URL): Promise<{ id: string; name: string }[]> {
  const data = await apiGet("/organizations", token, apiUrl) as { id: string; name: string }[];
  return Array.isArray(data) ? data : [];
}

export async function switchOrg(orgId: string, orgName?: string): Promise<void> {
  const creds = loadCredentials();
  if (!creds) throw new Error("Not logged in. Run deeplake login first.");
  // Token in creds is org-bound (org_id claim baked in at mint time at
  // /users/me/tokens). Re-mint against the destination org so the claim
  // matches creds.orgId — otherwise anything that trusts the token claim
  // instead of the X-Activeloop-Org-Id header resolves to the old org.
  // Name suffix uses Date.now() (not the date) because Deeplake's
  // /users/me/tokens rejects duplicate (user_id, name) with a misleading
  // 500 — same hazard the heal path documents; two switches the same day
  // would otherwise fail.
  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
  const tokenName = `deeplake-plugin-switch-${Date.now()}`;
  const tokenData = await apiPost("/users/me/tokens", {
    name: tokenName,
    duration: 365 * 24 * 3600,
    organization_id: orgId,
  }, creds.token, apiUrl) as { token: { token: string } };
  saveCredentials({ ...creds, orgId, orgName, token: tokenData.token.token });
}

// Detect and repair the legacy regression where `org switch` only rewrote
// orgId without re-minting the org-bound API token. Returns updated creds
// when a heal happens, the input creds when nothing to do, and the input
// creds (after logging) when the mint fails — never throws, never blocks
// session start.
//
// The same legacy regression that drifted the token also left `orgName` and
// `workspaceId` pointing at the previous org. Re-minting the token realigns
// every query (it carries the X-Activeloop-Org-Id header + an org-bound JWT)
// to creds.orgId, but two consumers read the OTHER fields and would still
// resolve to the stale org:
//   - billingUrl() (src/deeplake-api.ts) builds the "top up" link from
//     orgName → the user pays into the wrong org and the low-balance banner,
//     driven by creds.orgId's real balance, never clears.
//   - the SessionStart banner prints `org: ${orgName}` → "the shell said the
//     wrong org".
// So when we heal the token we also realign orgName and validate workspaceId
// against creds.orgId. The realign is best-effort and gated behind the token
// drift trigger: it costs one extra GET (two when a non-default workspace is
// set) only on the rare session where drift is actually detected, and a
// failure here must never undo the token heal.
export async function healDriftedOrgToken(
  creds: Credentials,
  log: (msg: string) => void = () => {},
): Promise<Credentials> {
  if (!creds.token || !creds.orgId) return creds;
  const payload = decodeJwtPayload(creds.token);
  const claimOrg = payload && typeof payload.org_id === "string" ? payload.org_id : undefined;
  if (!claimOrg || claimOrg === creds.orgId) return creds;
  log(`token org drift detected: jwt.org_id=${claimOrg} creds.orgId=${creds.orgId} — re-minting`);
  try {
    const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
    // Per-mint unique name. Deeplake rejects duplicate (user_id, name) with
    // a 500 ("token creation failed"), and the heal runs on EVERY session
    // start across multiple agents — a date-only suffix would collide as
    // soon as the second agent heals on the same day. Date.now() suffices:
    // resolution is ms, only one heal per session, single process per agent.
    const tokenName = `deeplake-plugin-heal-${Date.now()}`;
    const tokenData = await apiPost("/users/me/tokens", {
      name: tokenName,
      duration: 365 * 24 * 3600,
      organization_id: creds.orgId,
    }, creds.token, apiUrl) as { token: { token: string } };
    const healed: Credentials = { ...creds, token: tokenData.token.token };

    // Realign orgName + workspaceId to creds.orgId so billingUrl() and the
    // SessionStart banner stop pointing at the stale org. Two INDEPENDENT
    // best-effort blocks: a failed orgName lookup must not also skip the
    // workspace repair (and vice versa) — otherwise one transient 5xx on the
    // single session that heals the token leaves the OTHER field stale, and
    // the heal trigger (jwt.org_id !== creds.orgId) won't re-fire next session
    // to retry it. Both swallow errors so the token heal above still persists.
    // Each uses the freshly-minted token, which is bound to creds.orgId.
    try {
      const orgs = await listOrgs(healed.token, apiUrl);
      const matchedOrg = orgs.find(o => o.id === creds.orgId);
      if (matchedOrg && matchedOrg.name !== creds.orgName) {
        log(`orgName realigned: ${creds.orgName ?? "(unset)"} -> ${matchedOrg.name}`);
        healed.orgName = matchedOrg.name;
      }
    } catch (e) {
      log(`orgName realign skipped: ${(e as Error).message}`);
    }

    // "default" is the per-org sentinel the backend resolves itself, so it
    // needs no validation. Only a concrete workspace id/name can belong to
    // the previous org and must be re-resolved (or reset) against the new one.
    const currentWs = creds.workspaceId ?? "default";
    if (currentWs !== "default") {
      try {
        const wsList = await listWorkspaces(healed.token, apiUrl, creds.orgId);
        const lcWs = currentWs.toLowerCase();
        const wsMatch = wsList.find(w => w.id === currentWs || (w.name && w.name.toLowerCase() === lcWs));
        if (!wsMatch) {
          log(`workspace '${currentWs}' not in org ${creds.orgId} — reset to default`);
          healed.workspaceId = "default";
        } else if (wsMatch.id !== currentWs) {
          log(`workspace '${currentWs}' resolved to id '${wsMatch.id}'`);
          healed.workspaceId = wsMatch.id;
        }
      } catch (e) {
        log(`workspace realign skipped: ${(e as Error).message}`);
      }
    }

    saveCredentials(healed);
    log(`token re-minted for org=${creds.orgId}`);
    return healed;
  } catch (err) {
    log(`token re-mint failed (continuing with stale token): ${(err as Error).message}`);
    return creds;
  }
}

// ── Workspace Commands ───────────────────────────────────────────────────────

export async function listWorkspaces(token: string, apiUrl = DEFAULT_API_URL, orgId?: string): Promise<{ id: string; name: string }[]> {
  const raw = await apiGet("/workspaces", token, apiUrl, orgId) as { data?: { id: string; name: string }[] } | { id: string; name: string }[];
  const data = (raw as { data?: { id: string; name: string }[] }).data ?? (raw as { id: string; name: string }[]);
  return Array.isArray(data) ? data : [];
}

export async function switchWorkspace(workspaceId: string): Promise<void> {
  const creds = loadCredentials();
  if (!creds) throw new Error("Not logged in. Run deeplake login first.");
  saveCredentials({ ...creds, workspaceId });
}

// ── Member Commands ──────────────────────────────────────────────────────────

export async function inviteMember(
  username: string,
  accessMode: "ADMIN" | "WRITE" | "READ",
  token: string,
  orgId: string,
  apiUrl = DEFAULT_API_URL,
): Promise<void> {
  await apiPost(`/organizations/${orgId}/members/invite`, { username, access_mode: accessMode }, token, apiUrl, orgId);
}

export async function listMembers(
  token: string,
  orgId: string,
  apiUrl = DEFAULT_API_URL,
): Promise<{ user_id: string; name: string; email: string; role: string }[]> {
  const data = await apiGet(`/organizations/${orgId}/members`, token, apiUrl, orgId) as { members: { user_id: string; name: string; email: string; role: string }[] };
  return data.members ?? [];
}

export async function removeMember(
  userId: string,
  token: string,
  orgId: string,
  apiUrl = DEFAULT_API_URL,
): Promise<void> {
  await apiDelete(`/organizations/${orgId}/members/${userId}`, token, apiUrl, orgId);
}

// ── Full Login Flow ──────────────────────────────────────────────────────────

// Hydrate Credentials from a token: fetch /me, pick an org, optionally mint a
// long-lived API token, and persist. Shared by the device flow (which passes
// a short-lived Auth0 token and needs skipTokenMint=false) and the env-var /
// --token paths (which receive a long-lived token already and pass
// skipTokenMint=true). Centralizing here means there is exactly one place
// that writes ~/.deeplake/credentials.json from a token.
export async function saveCredentialsFromToken(
  token: string,
  apiUrl: string,
  opts: { skipTokenMint?: boolean } = {},
): Promise<Credentials> {
  const user = await apiGet("/me", token, apiUrl) as { id: string; name: string; email?: string };
  const userName = user.name || (user.email ? user.email.split("@")[0] : "unknown");
  process.stderr.write(`\nLogged in as: ${userName}\n`);

  const orgs = await listOrgs(token, apiUrl);
  if (orgs.length === 0) throw new Error("No organizations found for this account.");

  // Pick the org the token is bound to, in priority order:
  //   1. HIVEMIND_ORG_ID env var override (explicit user choice).
  //   2. `org_id` claim baked into the API-token JWT (skipTokenMint=true
  //      path: the token was minted server-side bound to this org, so
  //      using anything else would route hooks at the wrong org).
  //   3. Fall back to orgs[0] for the device-flow path (will be re-bound
  //      by the upcoming /users/me/tokens mint anyway).
  // Without these layers a multi-org user pasting an API key would
  // silently bind to the wrong org and every later capture would land
  // there. Codex review surfaced this on PR #190.
  const envOrgId = process.env.HIVEMIND_ORG_ID;
  let preferredOrgId: string | undefined = envOrgId;
  if (!preferredOrgId && opts.skipTokenMint) {
    const claims = decodeJwtPayload(token);
    const claimOrg = claims && typeof claims.org_id === "string" ? claims.org_id : undefined;
    if (claimOrg) preferredOrgId = claimOrg;
  }
  let orgId: string;
  let orgName: string;
  const matched = preferredOrgId ? orgs.find(o => o.id === preferredOrgId) : undefined;
  if (matched) {
    orgId = matched.id;
    orgName = matched.name;
    process.stderr.write(`Organization: ${orgName}\n`);
  } else if (orgs.length === 1) {
    orgId = orgs[0].id;
    orgName = orgs[0].name;
    process.stderr.write(`Organization: ${orgName}\n`);
  } else {
    process.stderr.write("\nOrganizations:\n");
    orgs.forEach((org, i) => process.stderr.write(`  ${i + 1}. ${org.name}\n`));
    orgId = orgs[0].id;
    orgName = orgs[0].name;
    if (opts.skipTokenMint) {
      process.stderr.write(`\nUsing: ${orgName} (set HIVEMIND_ORG_ID to override)\n`);
    } else {
      process.stderr.write(`\nUsing: ${orgName}\n`);
    }
  }

  let apiToken = token;
  if (!opts.skipTokenMint) {
    const tokenName = `deeplake-plugin-${new Date().toISOString().slice(0, 10)}`;
    const tokenData = await apiPost("/users/me/tokens", {
      name: tokenName,
      duration: 365 * 24 * 3600,
      organization_id: orgId,
    }, token, apiUrl) as { token: { token: string } };
    apiToken = tokenData.token.token;
  }

  const creds: Credentials = {
    token: apiToken,
    orgId,
    orgName,
    userName,
    workspaceId: "default",
    apiUrl,
    savedAt: new Date().toISOString(),
  };
  saveCredentials(creds);
  return creds;
}

export async function login(apiUrl = DEFAULT_API_URL): Promise<Credentials> {
  const { token: authToken } = await deviceFlowLogin(apiUrl);
  return saveCredentialsFromToken(authToken, apiUrl, { skipTokenMint: false });
}
