/**
 * Self-contained Deeplake data helper for the Cursor extension loaders.
 *
 * The loader scripts run via plain `node` spawned from the packaged
 * extension. The core Hivemind CLI source (repo-root `src/`) is neither
 * shipped in the vsix nor compiled to `.js`, so the old loaders that did
 * `import ... from "../../../../src/*.js"` always failed at runtime. This
 * module reimplements just the small slice of behaviour the loaders need,
 * with no dependency outside the scripts directory: reading credentials,
 * running a SQL query against the Deeplake HTTP endpoint, escaping SQL
 * literals, and deriving the per-repo graph key the core uses.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DEFAULT_API_URL = "https://api.deeplake.ai";

/** Accepted API URL prefixes. Prevents a tampered credentials.json from
 *  redirecting the bearer token to an attacker-controlled host. */
const ALLOWED_API_ORIGINS = [
  "https://api.deeplake.ai",
  "https://app.activeloop.ai",
];

export function sanitizeApiUrl(raw) {
  if (typeof raw !== "string") return DEFAULT_API_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return DEFAULT_API_URL;
    // Match on the parsed origin, never a string prefix. A startsWith check
    // accepts hostile values like "https://api.deeplake.ai@evil.com" or
    // "https://api.deeplake.ai.evil.com", which would redirect the bearer
    // token to an attacker-controlled host.
    if (ALLOWED_API_ORIGINS.includes(url.origin)) return url.origin;
  } catch {
    // malformed URL
  }
  return DEFAULT_API_URL;
}

export function loadCreds() {
  try {
    const raw = readFileSync(join(homedir(), ".deeplake", "credentials.json"), "utf-8");
    const creds = JSON.parse(raw);
    if (!creds || !creds.token || !creds.orgId) return null;
    return {
      token: creds.token,
      orgId: creds.orgId,
      orgName: creds.orgName ?? creds.orgId,
      userName: creds.userName ?? "",
      workspaceId: creds.workspaceId ?? "default",
      apiUrl: sanitizeApiUrl(creds.apiUrl),
    };
  } catch {
    return null;
  }
}

/** Table names, matching core `src/config.ts` defaults plus env overrides. */
export function tableNames() {
  return {
    memory: process.env.HIVEMIND_TABLE ?? "memory",
    sessions: process.env.HIVEMIND_SESSIONS_TABLE ?? "sessions",
    rules: process.env.HIVEMIND_RULES_TABLE ?? "hivemind_rules",
    goals: process.env.HIVEMIND_GOALS_TABLE ?? "hivemind_goals",
  };
}

/** Escape a string for a single-quoted SQL literal. Mirrors src/utils/sql.ts. */
export function sqlStr(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\0/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/** Validate a SQL identifier (table/column). Mirrors src/utils/sql.ts. */
export function sqlIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

/** True when the API error means the table has not been created yet. */
export function isMissingTableError(message) {
  return /does not exist|no such table|not found/i.test(String(message ?? ""));
}

/**
 * Run a SQL query against the Deeplake query endpoint and return rows as
 * plain objects. Mirrors the request shape in src/deeplake-api.ts.
 */
export async function query(creds, sql, timeoutMs = 8000) {
  const resp = await fetch(`${creds.apiUrl}/workspaces/${creds.workspaceId}/tables/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
      "X-Activeloop-Org-Id": creds.orgId,
      "X-Deeplake-Client": "hivemind",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ query: sql }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Query failed: ${resp.status}: ${text.slice(0, 200)}`);
  }
  const raw = await resp.json().catch(() => null);
  if (!raw || !Array.isArray(raw.rows) || !Array.isArray(raw.columns)) return [];
  return raw.rows.map((row) => Object.fromEntries(raw.columns.map((col, i) => [col, row[i]])));
}

/** Collapse the surface forms of a git remote URL. Mirrors src/utils/repo-identity.ts. */
export function normalizeGitRemoteUrl(url) {
  let s = String(url).trim();
  const schemeMatch = s.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : null;
  if (schemeMatch) s = s.slice(schemeMatch[0].length);
  if (!scheme) {
    const scp = s.match(/^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/);
    if (scp) s = `${scp[1]}/${scp[2]}`;
  }
  s = s.replace(/^[^@/]+@/, "");
  const defaultPorts = { http: "80", https: "443", ssh: "22", git: "9418" };
  if (scheme && defaultPorts[scheme]) {
    s = s.replace(new RegExp(`^([^/]+):${defaultPorts[scheme]}(/|$)`), "$1$2");
  }
  s = s.replace(/\.git\/?$/i, "");
  s = s.replace(/\/+$/, "");
  return s.toLowerCase();
}

/**
 * Stable per-repo key: sha1 of the normalized git remote (fallback to the
 * absolute cwd), first 16 hex chars. Mirrors core deriveProjectKey so the
 * extension resolves the SAME `~/.hivemind/graphs/<key>` dir the CLI writes.
 */
export function deriveProjectKey(cwd) {
  let signature = null;
  try {
    const raw = execSync("git config --get remote.origin.url", {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    signature = raw ? normalizeGitRemoteUrl(raw) : null;
  } catch {
    signature = null;
  }
  const input = signature ?? cwd;
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

export function graphsHome() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join(homedir(), ".hivemind", "graphs");
}
