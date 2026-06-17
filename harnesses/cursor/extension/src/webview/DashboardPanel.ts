import * as vscode from "vscode";
import { join } from "node:path";
import { backfillCursorLinks, listLocalSkillsForPromoter, skillDirLabel, syncSkillsToCursor } from "../bridge/skill-sync";
import { detectAuthState, formatIdentity } from "../auth";
import { runHealthCheck } from "../health/checker";
import { computeImpactOverlay } from "../graph/impact-overlay";
import { openNodeInEditor, startEditorToGraphSync, type EditorGraphSyncHandle } from "../graph/editor-sync";
import { loadGraphSnapshotFromEnvelope, parseGraphSnapshot } from "../graph/snapshot-loader";
import type { GraphSnapshot } from "../graph/types";
import type { SkillSyncState } from "../types/health";
import { logError } from "../utils/output";
import { getDashboardHtml } from "./html/dashboard-shell";
import { loadDashboardData, loadGoalsList, loadRecentSessions, loadRulesList, loadSessionSummary, runHivemindCli, runHivemindCliAsync, invalidateOrgStatsCache } from "./data-bridge";

type DashboardPane = "kpi" | "settings" | "sessions" | "graph" | "rules" | "skills" | "goals";

const NEXT_STEPS_SECTION_RE = /^##\s+Next Steps\s*$/im;

interface WebviewInboundMessage {
  type: string;
  pane?: DashboardPane;
  sessionId?: string;
  text?: string;
  ruleId?: string;
  nodeId?: string;
  dirName?: string;
  orgName?: string;
  workspaceName?: string;
  rulesStatus?: string;
  goalsFilter?: string;
}

interface ParsedRule {
  id: string;
  status: string;
  version: number;
  author: string;
  text: string;
}

async function triggerHealthPoll(): Promise<void> {
  try {
    await vscode.commands.executeCommand("hivemind.pollHealthNow");
  } catch {
    /* optional command */
  }
}

function workspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
}

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const PROMOTED_STEPS_KEY = "hivemind.promotedSteps";

function extractNextSteps(summary: string): string[] {
  const match = NEXT_STEPS_SECTION_RE.exec(summary);
  if (!match) return [];
  const after = summary.slice(match.index + match[0].length);
  const nextSection = after.search(/^##\s/m);
  const block = nextSection >= 0 ? after.slice(0, nextSection) : after;
  return block
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

class DashboardController {
  private editorSync: EditorGraphSyncHandle | undefined;
  private snapshot: GraphSnapshot | null = null;
  private rulesStatusFilter = "active";
  private goalsFilter: "mine" | "all" = "mine";
  private promotedSteps: Set<string>;
  private refreshInFlight = false;
  private lastDashboardEnvelope: Awaited<ReturnType<typeof loadDashboardData>> | null = null;
  private impactWatcher: vscode.FileSystemWatcher | undefined;
  private impactDebounce: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly disposables: vscode.Disposable[],
    private readonly memento: vscode.Memento,
  ) {
    const stored = memento.get<string[]>(PROMOTED_STEPS_KEY, []);
    this.promotedSteps = new Set(stored);
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(join(__dirname, ".."))],
    };
    webview.html = getDashboardHtml(webview, vscode.Uri.file(__dirname));

    disposables.push(
      webview.onDidReceiveMessage((msg: WebviewInboundMessage) => {
        void this.handleMessage(msg);
      }),
    );
  }

  private persistPromotedSteps(): void {
    void this.memento.update(PROMOTED_STEPS_KEY, [...this.promotedSteps]);
  }

  dispose(): void {
    this.editorSync?.dispose();
    if (this.impactDebounce) clearTimeout(this.impactDebounce);
    this.impactWatcher?.dispose();
    // Tear down everything pushed into this.disposables — most importantly the
    // webview.onDidReceiveMessage handler registered in the constructor.
    // Without this, a sidebar re-resolve (Cursor restart) builds a new
    // controller while the old message handler stays live, double-handling
    // every inbound webview message. Emptying the array also makes the
    // DashboardPanel owner's own teardown loop a safe no-op.
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }

  async refreshAll(): Promise<void> {
    await this.pushDashboardData();
    await this.pushSettings();
    await this.pushSessions();
    await this.pushRules();
    await this.pushSkills();
    await this.pushGoals();
  }

  private post(message: Record<string, unknown>): void {
    void this.webview.postMessage(message);
  }

  private async handleMessage(msg: WebviewInboundMessage): Promise<void> {
    try {
      switch (msg.type) {
        case "ready":
        case "refresh":
          if (this.refreshInFlight) break;
          this.refreshInFlight = true;
          try {
            await this.refreshAll();
          } finally {
            this.refreshInFlight = false;
          }
          break;
        case "setPane":
          if (msg.pane === "graph" && this.snapshot) this.ensureEditorSync();
          break;
        case "openSession":
          if (msg.sessionId && SESSION_ID_RE.test(msg.sessionId)) {
            const summary = await loadSessionSummary(msg.sessionId, workspaceRoot());
            const nextSteps = summary.text ? extractNextSteps(summary.text) : [];
            this.post({
              type: "sessionSummary",
              text: summary.text ?? summary.message ?? `No summary found for session ${msg.sessionId}.`,
              degradedHint: summary.degradedHint,
              summarySource: summary.source,
              nextSteps,
              promotedSteps: [...this.promotedSteps],
            });
          }
          break;
        case "toggleEmbeddings": {
          const status = await runHivemindCli(["embeddings", "status"], workspaceRoot());
          const enabled = status.stdout.toLowerCase().includes("enabled: true");
          const cmd = enabled ? ["embeddings", "disable"] : ["embeddings", "enable"];
          const result = await runHivemindCli(cmd, workspaceRoot());
          await this.pushSettings();
          await triggerHealthPoll();
          this.post({
            type: "actionResult",
            target: "embeddings",
            ok: result.ok,
            message: result.ok ? (enabled ? "Embeddings disabled." : "Embeddings enabled.") : result.stderr,
          });
          break;
        }
        case "buildGraph": {
          this.post({
            type: "actionResult",
            target: "graphBuild",
            ok: true,
            message: "Graph build in progress…",
            inProgress: true,
          });
          const result = await runHivemindCliAsync(["graph", "build"], workspaceRoot());
          this.post({
            type: "actionResult",
            target: "graphBuild",
            ok: result.ok,
            message: result.ok ? "Graph build finished." : result.stderr || "Graph build failed.",
            inProgress: false,
          });
          if (result.ok) await this.pushDashboardData();
          await triggerHealthPoll();
          break;
        }
        case "syncSkills": {
          if (process.env.HIVEMIND_AUTOPULL_DISABLED === "1") {
            this.post({
              type: "actionResult",
              target: "skillSync",
              ok: true,
              message: "Skill sync skipped (HIVEMIND_AUTOPULL_DISABLED=1).",
            });
            break;
          }
          backfillCursorLinks(workspaceRoot());
          const state = syncSkillsToCursor(workspaceRoot());
          this.post({
            type: "actionResult",
            target: "skillSync",
            ok: state.erroredCount === 0,
            message: `${state.syncedCount} synced, ${state.skippedCount} partial, ${state.erroredCount} failed.`,
          });
          await this.pushSettings();
          await this.pushSkills();
          break;
        }
        case "rulesList":
          if (msg.rulesStatus) this.rulesStatusFilter = msg.rulesStatus;
          await this.pushRules();
          break;
        case "goalsList":
          if (msg.goalsFilter === "all" || msg.goalsFilter === "mine") this.goalsFilter = msg.goalsFilter;
          await this.pushGoals();
          break;
        case "goalAdd":
          if (msg.text) {
            const result = await runHivemindCli(["goal", "add", msg.text], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "goals",
              ok: result.ok,
              message: result.ok ? "Goal added." : result.stderr || "Failed to add goal.",
            });
            if (result.ok) await this.pushGoals();
          }
          break;
        case "rulesAdd":
          if (msg.text) {
            const result = await runHivemindCli(["rules", "add", msg.text, "--scope", "team"], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "rules",
              ok: result.ok,
              message: result.ok ? "Rule added." : result.stderr,
            });
          }
          break;
        case "rulesDone":
          if (msg.ruleId) {
            const result = await runHivemindCli(["rules", "done", msg.ruleId], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "rules",
              ok: result.ok,
              message: result.ok ? "Rule completed." : result.stderr,
            });
          }
          break;
        case "rulesEdit":
          if (msg.ruleId && msg.text) {
            const result = await runHivemindCli(["rules", "edit", msg.ruleId, msg.text], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "rules",
              ok: result.ok,
              message: result.ok ? "Rule updated." : result.stderr,
            });
          }
          break;
        case "promoteSkill":
          if (msg.dirName) {
            const skillName = msg.dirName;
            const publishResult = await runHivemindCli(
              ["skillify", "promote", skillName, "--scope", "team"],
              workspaceRoot(),
            );
            this.post({
              type: "actionResult",
              target: "skillPromote",
              ok: publishResult.ok,
              message: publishResult.ok
                ? publishResult.stdout.trim() || `Skill "${skillName}" promoted and published at team scope.`
                : publishResult.stderr || "Promotion failed.",
            });
            await this.pushSkills();
          }
          break;
        case "nextStepsPromote":
          if (msg.text) {
            const key = msg.text.trim().toLowerCase();
            if (this.promotedSteps.has(key)) {
              this.post({
                type: "actionResult",
                target: "nextStepsGoal",
                ok: true,
                message: `Already promoted: "${msg.text}"`,
              });
              break;
            }
            const result = await runHivemindCli(["goal", "add", msg.text], workspaceRoot());
            if (result.ok) {
              this.promotedSteps.add(key);
              this.persistPromotedSteps();
            }
            this.post({
              type: "actionResult",
              target: "nextStepsGoal",
              ok: result.ok,
              message: result.ok ? `Goal created: "${msg.text}"` : result.stderr || "Failed to create goal.",
            });
            if (result.ok) await this.pushGoals();
          }
          break;
        case "switchWorkspace":
          if (msg.workspaceName) {
            const result = await runHivemindCli(["workspace", "switch", msg.workspaceName], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "workspaceSwitch",
              ok: result.ok,
              message: result.ok ? `Switched to workspace "${msg.workspaceName}".` : result.stderr || "Workspace switch failed.",
            });
            if (result.ok) {
              invalidateOrgStatsCache();
              await this.pushSettings();
              await this.pushDashboardData();
              await triggerHealthPoll();
            }
          }
          break;
        case "switchOrg":
          if (msg.orgName) {
            const result = await runHivemindCli(["org", "switch", msg.orgName], workspaceRoot());
            this.post({
              type: "actionResult",
              target: "orgSwitch",
              ok: result.ok,
              message: result.ok ? `Switched to org "${msg.orgName}".` : result.stderr || "Org switch failed.",
            });
            if (result.ok) {
              invalidateOrgStatsCache();
              await this.pushSettings();
              await this.pushDashboardData();
              await triggerHealthPoll();
            }
          }
          break;
        case "computeImpact":
          if (this.snapshot) {
            const impact = computeImpactOverlay(this.snapshot, workspaceRoot());
            this.post({ type: "impact", impact });
          }
          break;
        case "graphNodeClick":
          if (msg.nodeId && this.snapshot) {
            const node = this.snapshot.nodes.find((n) => n.id === msg.nodeId);
            if (node) {
              const opened = await openNodeInEditor(node, workspaceRoot());
              if (opened.message) {
                void vscode.window.showInformationMessage(opened.message);
              }
            }
          }
          break;
        default:
          break;
      }
    } catch (err: unknown) {
      logError("Dashboard message handler failed", err);
      this.post({ type: "error", message: "Action failed." });
    }
  }

  private ensureEditorSync(): void {
    if (!this.snapshot || this.editorSync) return;
    this.editorSync = startEditorToGraphSync(this.snapshot, workspaceRoot(), (nodeIds) => {
      this.post({ type: "graphHighlight", nodeIds });
    });
    this.disposables.push({ dispose: () => this.editorSync?.dispose() });
    this.ensureImpactWatcher();
  }

  private ensureImpactWatcher(): void {
    if (this.impactWatcher || !this.snapshot) return;
    const root = workspaceRoot();
    const pattern = new vscode.RelativePattern(root, "**/*.{ts,tsx,js,jsx,mjs,cjs,py,pyi}");
    this.impactWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    const scheduleImpact = (): void => {
      if (this.impactDebounce) clearTimeout(this.impactDebounce);
      this.impactDebounce = setTimeout(() => {
        if (!this.snapshot) return;
        const impact = computeImpactOverlay(this.snapshot, root);
        this.post({ type: "impact", impact });
      }, 600);
    };
    this.impactWatcher.onDidChange(scheduleImpact);
    this.impactWatcher.onDidCreate(scheduleImpact);
    this.impactWatcher.onDidDelete(scheduleImpact);
    this.disposables.push(this.impactWatcher);
  }

  private async pushDashboardData(): Promise<void> {
    const data = await loadDashboardData(workspaceRoot());
    this.lastDashboardEnvelope = data;
    const parsed = data.graph?.snapshot ? parseGraphSnapshot(data.graph.snapshot) : null;
    this.snapshot = parsed ?? loadGraphSnapshotFromEnvelope(data);
    this.post({
      type: "dashboardData",
      data,
      graphCorrupt: Boolean(data.graph?.snapshot && !parsed),
    });
    if (this.snapshot) this.ensureEditorSync();
  }

  private async pushSettings(): Promise<void> {
    const auth = await detectAuthState();
    const health = await runHealthCheck();
    const emb = await runHivemindCli(["embeddings", "status"], workspaceRoot());
    // Honor HIVEMIND_AUTOPULL_DISABLED here too. syncSkillsToCursor() mutates
    // the filesystem (creates symlinks + rewrites the pull manifest), so when
    // the user has opted out of auto-sync, rendering the settings pane must
    // not silently re-sync. Matches the guards in the poller and the
    // "syncSkills" message handler.
    const sync: SkillSyncState =
      process.env.HIVEMIND_AUTOPULL_DISABLED === "1"
        ? { lastSyncAt: undefined, results: [], syncedCount: 0, skippedCount: 0, erroredCount: 0 }
        : syncSkillsToCursor(workspaceRoot());
    const healthSummary = health.dimensions.map((d) => `${d.label}: ${d.status}`).join(" · ");
    const graph = this.lastDashboardEnvelope?.graph;
    let graphStatus = "Not built for this repo.";
    if (graph && graph.nodeCount > 0) {
      const age = graph.commitSha ? `commit ${graph.commitSha.slice(0, 8)}` : "snapshot on disk";
      graphStatus = `Built · ${graph.nodeCount} nodes · ${graph.edgeCount} edges · ${age}`;
    }
    const goals = await runHivemindCli(["goal", "list"], workspaceRoot());
    const openGoalsPreview = goals.ok
      ? goals.stdout.split("\n").filter((l) => l.trim()).slice(0, 5).join("\n") || "(none)"
      : "Unavailable (log in required).";
    this.post({
      type: "settings",
      authLabel: formatIdentity(auth),
      healthSummary,
      embeddingsStatus: emb.ok ? emb.stdout.split("\n")[0] ?? "unknown" : "unavailable",
      skillSyncSummary: `Last sync: ${sync.syncedCount} ok, ${sync.erroredCount} failed`,
      graphBuildMessage: "",
      graphStatus,
      openGoalsPreview,
    });
  }

  private async pushSessions(): Promise<void> {
    const sessions = await loadRecentSessions(workspaceRoot());
    this.post({ type: "sessions", sessions });
  }

  private async pushRules(): Promise<void> {
    const result = await loadRulesList(this.rulesStatusFilter || "active", 10);
    if (result.loggedOut) {
      this.post({
        type: "rules",
        rules: [],
        loggedOut: true,
        message: result.message ?? "Log in with `hivemind login` to manage team rules.",
      });
      return;
    }
    this.post({ type: "rules", rules: result.rules, loggedOut: false });
  }

  private async pushGoals(): Promise<void> {
    const result = await loadGoalsList(this.goalsFilter);
    if (result.loggedOut) {
      this.post({
        type: "goals",
        goals: [],
        loggedOut: true,
        message: result.message ?? "Log in with `hivemind login` to track goals.",
      });
      return;
    }
    this.post({ type: "goals", goals: result.goals, loggedOut: false });
  }

  private async pushSkills(): Promise<void> {
    const auth = await detectAuthState();
    if (auth.state !== "logged_in") {
      this.post({
        type: "skills",
        skills: [],
        loggedOut: true,
        message: "Log in with `hivemind login` to promote skills to your team.",
      });
      return;
    }
    const skills = listLocalSkillsForPromoter().map((s) => ({
      dirName: s.dirName,
      label: skillDirLabel(s.dirName),
      scope: s.scope,
      shareScope: s.shareScope,
      path: s.path,
    }));
    this.post({ type: "skills", skills, loggedOut: false });
  }
}

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  public static readonly viewType = "hivemind.dashboardPanel";

  private readonly panel: vscode.WebviewPanel;
  private readonly controller: DashboardController;
  private readonly disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(column);
      void DashboardPanel.currentPanel.controller.refreshAll();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      "Hivemind Dashboard",
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, extensionUri, context);
  }

  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.controller = new DashboardController(panel.webview, this.disposables, context.globalState);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible) void this.controller.refreshAll();
      },
      null,
      this.disposables,
    );

    void this.controller.refreshAll();
  }

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this.controller.dispose();
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}

class DashboardViewProvider implements vscode.WebviewViewProvider {
  private controller: DashboardController | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    // Dispose the previous controller if the view is re-resolved (e.g. on
    // Cursor restart) to prevent FileSystemWatcher and editor-listener leaks.
    this.controller?.dispose();

    // The controller OWNS this array and disposes it in controller.dispose().
    // Do NOT also push it into context.subscriptions: that kept the previous
    // controller's onDidReceiveMessage handler alive across a re-resolve
    // (cleaned only at deactivate), double-handling webview messages. The
    // re-resolve dispose() above and the onDidDispose below both release it.
    const disposables: vscode.Disposable[] = [];
    this.controller = new DashboardController(webviewView.webview, disposables, this.context.globalState);

    // Visibility listener is controller-scoped too, so it tears down with the
    // controller on the next re-resolve instead of accumulating.
    disposables.push(
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) void this.controller?.refreshAll();
      }),
    );

    // Dispose the controller when the webview panel is closed so watchers
    // and listeners are released immediately rather than waiting for deactivate.
    webviewView.onDidDispose(() => {
      this.controller?.dispose();
      this.controller = undefined;
    });

    void this.controller.refreshAll();
  }
}

export function registerDashboardWebview(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("hivemind.dashboard", new DashboardViewProvider(context), {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
}
