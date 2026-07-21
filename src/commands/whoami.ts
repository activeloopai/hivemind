/**
 * `hivemind whoami` rendering.
 *
 * Reports the EFFECTIVE identity for a given cwd — the one capture and memory
 * search actually use — rather than the raw contents of
 * `~/.deeplake/credentials.json`. Two things override the stored creds:
 *
 *   - `HIVEMIND_ORG_ID` / `HIVEMIND_WORKSPACE_ID` in the environment
 *   - the nearest `.hivemind` for this directory (see src/dir-config.ts)
 *
 * Whenever the effective identity differs from what's stored, the reason and
 * the stored values are both disclosed — a user asking "what am I connected
 * to?" must never be told a value that isn't the one in use.
 */

import type { Config } from "../config.js";
import type { Credentials } from "./auth.js";
import { resolveDirConfig } from "../dir-config.js";

const DEFAULT_API = "https://api.deeplake.ai";

export function renderWhoami(config: Config | null, creds: Credentials, cwd: string): string {
  const storedOrg = creds.orgName ?? creds.orgId;
  const storedWs = creds.workspaceId ?? "default";

  // No usable Config (no token/orgId resolvable) — report what's stored.
  if (!config) {
    return [
      `User org: ${storedOrg}`,
      `Workspace: ${storedWs}`,
      `API: ${creds.apiUrl ?? DEFAULT_API}`,
    ].join("\n");
  }

  const res = resolveDirConfig(config, cwd);
  const eff = res.config;

  // Attribute each override precisely: `config` has already folded the env in,
  // so a diff against `creds` is the env's doing, and a diff between `eff` and
  // `config` is the .hivemind's.
  const envMoved = config.orgId !== creds.orgId || config.workspaceId !== storedWs;
  const dirMoved = !!res.found &&
    (eff.orgId !== config.orgId || eff.workspaceId !== config.workspaceId);

  const lines = [
    `User org: ${eff.orgName ?? eff.orgId}`,
    `Workspace: ${eff.workspaceId}`,
    `API: ${eff.apiUrl}`,
  ];

  const notes: string[] = [];
  if (dirMoved) notes.push(`Routed by ${res.found?.path}`);
  if (envMoved) notes.push("Overridden by HIVEMIND_* environment variables");
  if (notes.length) {
    notes.push(`Stored identity: ${storedOrg} / ${storedWs}`);
  }
  if (res.found && !res.collect) {
    notes.push(`Capture: disabled for this directory by ${res.found.path}`);
  }
  if (notes.length) lines.push("", ...notes);

  return lines.join("\n");
}
