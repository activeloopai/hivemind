import * as vscode from "vscode";
import type { StatusSnapshot } from "../types/health";
import { runHealthCheck } from "../health";
import { detectAuthState } from "../auth";
import { syncSkillsToCursor } from "../bridge/skill-sync";
import { buildSnapshot } from "./indicator";

const DEFAULT_INTERVAL_MS = 60_000;

export class HealthPoller {
  private timer: NodeJS.Timeout | undefined;
  private listeners = new Set<(snap: StatusSnapshot) => void>();
  private lastSnapshot: StatusSnapshot | undefined;
  private pollInFlight = false;

  onUpdate(listener: (snap: StatusSnapshot) => void): vscode.Disposable {
    this.listeners.add(listener);
    if (this.lastSnapshot) listener(this.lastSnapshot);
    return new vscode.Disposable(() => this.listeners.delete(listener));
  }

  start(intervalMs = DEFAULT_INTERVAL_MS): void {
    this.stop();
    void this.pollOnce();
    this.timer = setInterval(() => {
      // Skip this tick if the previous poll is still running. pollOnce does
      // network health checks + a skill sync, which can outlast the interval
      // under a slow network; without this guard those polls would stack.
      if (this.pollInFlight) return;
      if (vscode.window.state.focused !== false) {
        void this.pollOnce();
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async pollOnce(projectRoot?: string): Promise<StatusSnapshot> {
    // Coalesce overlapping polls: if one is already running, return the last
    // snapshot rather than launching a second concurrent health-check +
    // skill-sync. Only the first poll (no snapshot yet) runs unguarded.
    if (this.pollInFlight && this.lastSnapshot) return this.lastSnapshot;
    this.pollInFlight = true;
    try {
      const health = await runHealthCheck();
      const auth = await detectAuthState();
      let skillSync;
      if (process.env.HIVEMIND_AUTOPULL_DISABLED !== "1") {
        try {
          skillSync = syncSkillsToCursor(projectRoot);
        } catch {
          /* best-effort; never block the poll */
        }
      }
      const snap = buildSnapshot(health, auth, skillSync);
      this.lastSnapshot = snap;
      for (const listener of this.listeners) listener(snap);
      return snap;
    } finally {
      this.pollInFlight = false;
    }
  }
}
