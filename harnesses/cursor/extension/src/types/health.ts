export type HealthDimensionStatus = "ok" | "missing" | "logged_out" | "stale" | "not_wired" | "error";

export interface HealthDimension {
  id: "d1" | "d2" | "d3" | "d4";
  label: string;
  status: HealthDimensionStatus;
  message: string;
  remediation?: string;
  installCommand?: string;
  docsUrl?: string;
}

export interface HealthResult {
  checkedAt: string;
  dimensions: HealthDimension[];
  bundlePresent: boolean;
  bundleVersion?: string;
  wiredVersion?: string;
  allHealthy: boolean;
  summariesDisabled: boolean;
}

export type AuthLoginState = "logged_in" | "logged_out" | "unknown_offline";

export interface AuthState {
  state: AuthLoginState;
  identity?: string;
  orgName?: string;
  workspaceId?: string;
  cursorAgentLoggedIn?: boolean;
  cursorAgentMessage?: string;
}

export interface SkillSyncResult {
  skillName: string;
  status: "synced" | "skipped" | "errored";
  path?: string;
  reason?: string;
}

export interface SkillSyncState {
  lastSyncAt?: string;
  results: SkillSyncResult[];
  syncedCount: number;
  skippedCount: number;
  erroredCount: number;
}

export type StatusBarState =
  | "healthy"
  | "degraded"
  | "not_configured"
  | "logged_out"
  | "unknown";

export interface StatusSnapshot {
  barState: StatusBarState;
  health: HealthResult;
  auth: AuthState;
  tooltip: string;
  skillSync?: SkillSyncState;
}
