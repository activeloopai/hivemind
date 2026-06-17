/**
 * Backend-pushed notifications.
 *
 * Hits `GET /me/notifications` on the deeplake-api with the user's bearer
 * token. Returns the active notifications targeting that user (or any of
 * their orgs). Failure paths — timeout, network error, non-200 response,
 * malformed JSON — all degrade to "no notifications" so a flaky backend
 * never breaks the SessionStart hook.
 *
 * Hard timeout: 1.5s. The SessionStart hook's overall timeout is 5s in
 * hooks.json; leaving headroom for state/queue I/O + delivery.
 */

import type { Credentials } from "../../commands/auth-creds.js";
import type { Notification, Severity } from "../types.js";
import { log as _log } from "../../utils/debug.js";

const log = (msg: string) => _log("notifications-backend", msg);

const FETCH_TIMEOUT_MS = 1500;
const DEFAULT_API_URL = "https://api.deeplake.ai";

interface ServerNotification {
  id: string;
  target_user_id?: string | null;
  target_org_id?: string | null;
  severity?: string;
  title?: string;
  body?: string;
  dedup_key?: string;
  created_at?: string;
  expires_at?: string | null;
  dismissed_at?: string | null;
}

interface ServerListResponse {
  notifications?: ServerNotification[];
}

const ALLOWED_SEVERITIES: ReadonlySet<Severity> = new Set(["info", "warn", "error"]);

function normalizeSeverity(s: unknown): Severity {
  return typeof s === "string" && ALLOWED_SEVERITIES.has(s as Severity)
    ? (s as Severity)
    : "info";
}

/**
 * Translate a server-shape notification into the client's Notification.
 * Drops malformed entries (missing id/title/body) by returning null so the
 * caller can filter them out.
 */
function toClient(n: ServerNotification): Notification | null {
  if (!n.id || typeof n.id !== "string") return null;
  if (!n.title || typeof n.title !== "string") return null;
  if (!n.body || typeof n.body !== "string") return null;
  return {
    // Prefix with `backend:` so a future local-only rule can never collide
    // with a server-issued id, even if both happen to use the same string.
    id: `backend:${n.id}`,
    severity: normalizeSeverity(n.severity),
    title: n.title,
    body: n.body,
    // dedupKey wraps server fields the client cares about. The server's
    // dedup_key is hashed in here so a server that reuses the same UUID
    // with a fresh dedup_key (rare but supported) re-fires for the user.
    dedupKey: { id: n.id, dedup_key: n.dedup_key ?? "" },
    // The body is server-controlled free text shown to the user as a banner
    // (e.g. the deeplake-api low-balance "top up to avoid service
    // interruption" push). Like every user-facing notification, it must NOT
    // reach the model's additionalContext — an imperative/billing string in
    // the agent prompt is the prompt-injection shape we're closing. User
    // channel only.
    userVisibleOnly: true,
  };
}

/**
 * Fetch notifications from the deeplake-api. Never throws — returns [] on
 * any error. Logs to ~/.deeplake/hook-debug.log when HIVEMIND_DEBUG=1.
 */
export async function fetchBackendNotifications(
  creds: Credentials | null,
): Promise<Notification[]> {
  if (!creds?.token) return [];

  const apiUrl = creds.apiUrl ?? DEFAULT_API_URL;
  const url = `${apiUrl}/me/notifications`;

  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        ...(creds.orgId ? { "X-Activeloop-Org-Id": creds.orgId } : {}),
      },
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      log(`fetch ${url} returned ${resp.status}`);
      return [];
    }
    const body = (await resp.json()) as ServerListResponse;
    if (!body || !Array.isArray(body.notifications)) {
      log(`fetch ${url} returned malformed body`);
      return [];
    }
    const out: Notification[] = [];
    for (const sn of body.notifications) {
      const c = toClient(sn);
      if (c) out.push(c);
    }
    log(`fetched ${out.length} backend notification(s) from ${apiUrl}`);
    return out;
  } catch (e: unknown) {
    log(`fetch ${url} failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  } finally {
    clearTimeout(timeoutHandle);
  }
}
