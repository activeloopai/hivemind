import type { AuthState, HealthResult, SkillSyncState, StatusBarState, StatusSnapshot } from "../types/health";
import { formatIdentity } from "../auth/detector";

export function composeStatusBarState(health: HealthResult, auth: AuthState, skillSync?: SkillSyncState): StatusBarState {
  if (auth.state === "unknown_offline") return "unknown";
  if (auth.state === "logged_out") return "logged_out";

  const d1 = health.dimensions.find((d) => d.id === "d1");
  const d2 = health.dimensions.find((d) => d.id === "d2");
  const d3 = health.dimensions.find((d) => d.id === "d3");
  const d4 = health.dimensions.find((d) => d.id === "d4");

  const hooksMissing = d4?.status === "not_wired" || d4?.status === "stale" || d4?.status === "error";
  const cliMissing = d1?.status === "missing" || d2?.status === "missing";

  if (cliMissing || hooksMissing) return "not_configured";

  const summaryImpaired = d2?.status !== "ok" || d3?.status === "logged_out";
  if (summaryImpaired) return "degraded";

  // Skill-sync health is surfaced in the dashboard, not the status bar (PRD-002c / PRD-005a).

  if (health.allHealthy && auth.state === "logged_in") return "healthy";
  if (auth.state === "logged_in" && !health.allHealthy) return "degraded";
  return "not_configured";
}

const STATE_LABELS: Record<StatusBarState, string> = {
  healthy: "$(check) Hivemind",
  degraded: "$(warning) Hivemind degraded",
  not_configured: "$(gear) Hivemind setup",
  logged_out: "$(sign-in) Hivemind logged out",
  unknown: "$(question) Hivemind unknown",
};

const STATE_COLORS: Record<StatusBarState, string> = {
  healthy: "statusBarItem.prominentBackground",
  degraded: "statusBarItem.warningBackground",
  not_configured: "statusBarItem.errorBackground",
  logged_out: "statusBarItem.errorBackground",
  unknown: "statusBarItem.warningBackground",
};

export function buildTooltip(health: HealthResult, auth: AuthState, skillSync?: SkillSyncState): string {
  const lines = health.dimensions.map((d) => `${d.label}: ${d.message}`);
  lines.push(`Hivemind login: ${formatIdentity(auth)}`);
  if (auth.cursorAgentLoggedIn === false && auth.cursorAgentMessage) {
    lines.push(`cursor-agent: ${auth.cursorAgentMessage}`);
  }
  if (skillSync && skillSync.erroredCount > 0) {
    lines.push(`Skill sync: ${skillSync.erroredCount} skill(s) not reaching Cursor agent`);
  }
  return lines.join("\n");
}

export function buildSnapshot(health: HealthResult, auth: AuthState, skillSync?: SkillSyncState): StatusSnapshot {
  const barState = composeStatusBarState(health, auth, skillSync);
  return {
    barState,
    health,
    auth,
    tooltip: buildTooltip(health, auth, skillSync),
    skillSync,
  };
}

export function getStatusBarPresentation(state: StatusBarState): { text: string; backgroundColor: string } {
  return {
    text: STATE_LABELS[state],
    backgroundColor: STATE_COLORS[state],
  };
}
