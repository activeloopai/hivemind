import { randomBytes } from "node:crypto";
import * as vscode from "vscode";

function getNonce(): string {
  return randomBytes(16).toString("hex");
}

function cspSource(webview: vscode.Webview): string {
  return webview.cspSource;
}

/** Self-contained dashboard HTML for panel or sidebar webview. */
export function getDashboardHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = getNonce();
  const csp = cspSource(webview);
  // d3 is vendored under media/ and served via the webview resource scheme.
  // Loading it from a remote CDN fails under the webview CSP/sandbox, which
  // left the graph blank. extensionUri points at dist/, so media/ is one up.
  const d3Uri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "..", "media", "d3.v7.min.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; script-src 'nonce-${nonce}' ${csp}; img-src ${csp} data:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hivemind Dashboard</title>
  <style>
    :root {
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; min-height: 100vh; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    header h1 { margin: 0; font-size: 1.1em; font-weight: 600; }
    .tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border); }
    .tab {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid transparent; border-radius: 4px; padding: 4px 10px; cursor: pointer;
    }
    .tab.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    main { padding: 12px; }
    .pane { display: none; }
    .pane.active { display: block; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .card {
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px; padding: 10px;
    }
    .card .label { font-size: 0.85em; opacity: 0.85; }
    .card .value { font-size: 1.35em; font-weight: 600; margin-top: 4px; }
    .meta { font-size: 0.85em; opacity: 0.8; margin-top: 8px; }
    button, .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; margin: 4px 4px 4px 0;
    }
    button:disabled { opacity: 0.5; cursor: default; }
    input[type="text"], textarea {
      width: 100%; background: var(--vscode-input-background);
      color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
      border-radius: 4px; padding: 6px 8px;
    }
    ul.list { list-style: none; padding: 0; margin: 0; }
    ul.list li {
      padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); cursor: pointer;
    }
    ul.list li:hover { background: var(--vscode-list-hoverBackground); }
    #graph-canvas { width: 100%; height: 420px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); }
    .empty { opacity: 0.75; font-style: italic; padding: 12px 0; }
    .error { color: var(--vscode-errorForeground); }
    .caveat { font-size: 0.85em; opacity: 0.85; margin: 8px 0; padding: 8px; border-left: 3px solid var(--vscode-textLink-foreground); }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    pre.summary { white-space: pre-wrap; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; max-height: 320px; overflow: auto; }
    .skill-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .tag { font-size: 0.75em; padding: 2px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .tag.team { background: var(--vscode-charts-green); }
    .tag.me { background: var(--vscode-charts-orange); }
    .summary-body h1, .summary-body h2, .summary-body h3 { margin: 0.6em 0 0.3em; }
    .summary-body ul { margin: 0.4em 0; padding-left: 1.2em; }
    .summary-body code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
    .inline-error { color: var(--vscode-errorForeground); font-size: 0.85em; margin-top: 4px; }
    #graph-filters { margin: 8px 0; gap: 6px; }
    #graph-search { min-width: 180px; flex: 1; }
    .graph-legend { font-size: 0.8em; opacity: 0.85; margin: 6px 0; }
  </style>
</head>
<body>
  <header>
    <h1>Hivemind</h1>
    <button id="btn-refresh" title="Refresh dashboard">Refresh</button>
  </header>
  <nav class="tabs" role="tablist">
    <button class="tab active" data-pane="kpi" role="tab">KPIs</button>
    <button class="tab" data-pane="settings" role="tab">Settings</button>
    <button class="tab" data-pane="sessions" role="tab">Sessions</button>
    <button class="tab" data-pane="graph" role="tab">Graph</button>
    <button class="tab" data-pane="rules" role="tab">Rules</button>
    <button class="tab" data-pane="goals" role="tab">Goals</button>
    <button class="tab" data-pane="skills" role="tab">Skills</button>
  </nav>
  <main>
    <section id="pane-kpi" class="pane active" role="tabpanel">
      <div class="cards" id="kpi-cards"></div>
      <p class="meta" id="kpi-meta"></p>
    </section>
    <section id="pane-settings" class="pane" role="tabpanel">
      <h2>Org &amp; health</h2>
      <p id="settings-auth"></p>
      <p id="settings-health"></p>
      <div class="row">
        <input type="text" id="org-switch-input" placeholder="Org name or ID to switch to" style="flex:1" />
        <button id="btn-org-switch">Switch org</button>
      </div>
      <p class="meta" id="org-switch-result"></p>
      <div class="row">
        <input type="text" id="workspace-switch-input" placeholder="Workspace name to switch to" style="flex:1" />
        <button id="btn-workspace-switch">Switch workspace</button>
      </div>
      <p class="meta" id="workspace-switch-result"></p>
      <h2>Embeddings</h2>
      <div class="row">
        <span id="embeddings-status">Loading…</span>
        <button id="btn-embeddings-toggle">Toggle</button>
      </div>
      <h2>Codebase graph</h2>
      <p class="meta" id="settings-graph-status">Checking graph…</p>
      <div class="row">
        <button id="btn-graph-build">Build graph (hivemind graph build)</button>
        <button id="btn-graph-refresh">Refresh dashboard</button>
      </div>
      <p class="meta" id="graph-build-result"></p>
      <h2>Open goals</h2>
      <pre class="summary" id="open-goals-preview" style="max-height:120px">Loading…</pre>
      <h2>Skill sync</h2>
      <button id="btn-sync-skills">Sync skills to Cursor</button>
      <p class="meta" id="skill-sync-result"></p>
    </section>
    <section id="pane-sessions" class="pane" role="tabpanel">
      <ul class="list" id="session-list"></ul>
      <div id="session-detail" hidden>
        <h3>Session summary</h3>
        <pre class="summary summary-body" id="session-summary-text"></pre>
        <p class="meta error" id="session-degraded-hint" hidden></p>
        <h4>Next Steps</h4>
        <div id="next-steps-list"></div>
        <p class="meta" id="next-steps-result"></p>
      </div>
    </section>
    <section id="pane-graph" class="pane" role="tabpanel">
      <div class="row" id="graph-filters">
        <input type="text" id="graph-search" placeholder="Search nodes…" />
        <label><input type="checkbox" class="layer-filter" value="source" checked /> source</label>
        <label><input type="checkbox" class="layer-filter" value="test" checked /> test</label>
        <label><input type="checkbox" class="layer-filter" value="config" checked /> config</label>
      </div>
      <p class="graph-legend">Nodes: radius=fan-in · border=exported · diamond=entrypoint · shape by kind</p>
      <div class="row">
        <button id="btn-impact">Show change impact</button>
        <button id="btn-impact-clear">Clear impact</button>
      </div>
      <p class="caveat" id="graph-stale-banner" hidden></p>
      <p class="caveat" id="graph-empty-banner" hidden></p>
      <div class="row" id="graph-empty-actions" hidden>
        <button id="btn-graph-build-inline">Build graph now</button>
      </div>
      <p class="caveat" id="impact-caveat" hidden></p>
      <p class="meta" id="graph-inspect" hidden></p>
      <svg id="graph-canvas"></svg>
      <p class="meta" id="graph-meta"></p>
    </section>
    <section id="pane-rules" class="pane" role="tabpanel">
      <div class="row">
        <select id="rules-status-filter">
          <option value="active">Active</option>
          <option value="done">Done</option>
          <option value="all">All</option>
        </select>
        <input type="text" id="rule-text" placeholder="New team rule text" />
        <button id="btn-rule-add">Add rule</button>
      </div>
      <p class="inline-error" id="rule-add-error" hidden></p>
      <ul class="list" id="rules-list"></ul>
    </section>
    <section id="pane-goals" class="pane" role="tabpanel">
      <div class="row">
        <select id="goals-filter">
          <option value="mine">Mine</option>
          <option value="all">All</option>
        </select>
        <input type="text" id="goal-text" placeholder="New goal text" />
        <button id="btn-goal-add">Add goal</button>
      </div>
      <p class="inline-error" id="goal-add-error" hidden></p>
      <ul class="list" id="goals-list"></ul>
      <p class="meta" id="goal-add-result"></p>
    </section>
    <section id="pane-skills" class="pane" role="tabpanel">
      <p class="meta">Local skills available under Claude/Cursor skill directories. Use "Promote to team" to share a skill so teammates pull it on their next session.</p>
      <div id="skills-list"></div>
      <p class="meta" id="skill-promote-result"></p>
    </section>
  </main>
  <script nonce="${nonce}" src="${d3Uri}"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const state = { pane: "kpi", graph: null, graphMeta: null, impact: null, highlight: [], graphSearch: "", graphLayers: new Set(["source","test","config"]), promotedSteps: new Set(), refreshTimer: null };
    let graphUi = { simulation: null, nodeSel: null, linkSel: null, shapeSel: null, nodes: [], links: [], snapshotKey: "" };

    function post(type, payload) {
      vscode.postMessage(Object.assign({ type }, payload || {}));
    }

    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#x27;");
    }

    function setPane(name) {
      state.pane = name;
      document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.pane === name));
      document.querySelectorAll(".pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + name));
      post("setPane", { pane: name });
      if (name === "graph" && state.graph) {
        // The canvas only has real dimensions once its pane is visible.
        // Rebuilding here re-centers the force layout in the viewport,
        // avoiding the collapsed top-left cluster from a hidden build.
        requestAnimationFrame(() => rebuildGraphFromSnapshot());
      }
    }

    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => setPane(btn.dataset.pane));
    });
    document.getElementById("btn-refresh").addEventListener("click", () => {
      const btn = document.getElementById("btn-refresh");
      if (btn) btn.disabled = true;
      post("refresh");
      setTimeout(() => { if (btn) btn.disabled = false; }, 1500);
    });
    document.getElementById("btn-graph-refresh").addEventListener("click", () => post("refresh"));
    document.getElementById("btn-graph-build-inline").addEventListener("click", () => post("buildGraph"));
    document.getElementById("btn-workspace-switch").addEventListener("click", () => {
      const workspaceName = document.getElementById("workspace-switch-input").value.trim();
      if (workspaceName) post("switchWorkspace", { workspaceName });
    });
    document.getElementById("btn-embeddings-toggle").addEventListener("click", () => post("toggleEmbeddings"));
    document.getElementById("btn-graph-build").addEventListener("click", () => post("buildGraph"));
    document.getElementById("btn-sync-skills").addEventListener("click", () => post("syncSkills"));
    document.getElementById("btn-rule-add").addEventListener("click", () => {
      const text = document.getElementById("rule-text").value.trim();
      const errEl = document.getElementById("rule-add-error");
      if (!text) return;
      if (text.includes("\\n") || text.includes("\\r")) {
        errEl.hidden = false;
        errEl.textContent = "Rule text must be a single line (no newlines).";
        return;
      }
      if (text.length > 2000) {
        errEl.hidden = false;
        errEl.textContent = "Rule text exceeds 2000 characters.";
        return;
      }
      errEl.hidden = true;
      post("rulesAdd", { text });
    });
    document.getElementById("rules-status-filter").addEventListener("change", (e) => {
      post("rulesList", { rulesStatus: e.target.value });
    });
    document.getElementById("goals-filter").addEventListener("change", (e) => {
      post("goalsList", { goalsFilter: e.target.value });
    });
    document.getElementById("btn-goal-add").addEventListener("click", () => {
      const text = document.getElementById("goal-text").value.trim();
      const errEl = document.getElementById("goal-add-error");
      if (!text) return;
      if (text.includes("\\n") || text.includes("\\r")) {
        errEl.hidden = false;
        errEl.textContent = "Goal text must be a single line (no newlines).";
        return;
      }
      if (text.length > 2000) {
        errEl.hidden = false;
        errEl.textContent = "Goal text exceeds 2000 characters.";
        return;
      }
      errEl.hidden = true;
      post("goalAdd", { text });
      document.getElementById("goal-text").value = "";
    });
    document.getElementById("btn-org-switch").addEventListener("click", () => {
      const orgName = document.getElementById("org-switch-input").value.trim();
      if (orgName) post("switchOrg", { orgName });
    });
    document.getElementById("btn-impact").addEventListener("click", () => post("computeImpact"));
    document.getElementById("btn-impact-clear").addEventListener("click", () => {
      state.impact = null;
      document.getElementById("impact-caveat").hidden = true;
      updateGraphStyles();
    });
    document.getElementById("graph-search").addEventListener("input", (e) => {
      state.graphSearch = e.target.value.trim().toLowerCase();
      updateGraphStyles();
    });
    document.querySelectorAll(".layer-filter").forEach(cb => {
      cb.addEventListener("change", () => {
        state.graphLayers = new Set(Array.from(document.querySelectorAll(".layer-filter:checked")).map(x => x.value));
        rebuildGraphFromSnapshot();
      });
    });

    function formatTokens(n) {
      if (n == null) return "—";
      if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
      return Math.round(n).toString();
    }

    function formatAge(isoTs) {
      if (!isoTs) return "";
      const diffMs = Date.now() - new Date(isoTs).getTime();
      const mins = Math.round(diffMs / 60000);
      if (mins < 1) return "just now";
      if (mins < 60) return mins + " min ago";
      return Math.round(mins / 60) + " h ago";
    }

    function renderKpis(data) {
      const k = data.kpis || {};
      const sourceLabel = { org: "org-wide", local: "this machine", none: "no data yet" }[k.tokensSource] || k.tokensSource;
      const freshnessTs = k.orgStatsFetchedAt || k.fetchedAt;
      let freshness = freshnessTs ? " · as of " + formatAge(freshnessTs) : "";
      if (k.orgStatsOffline) freshness += " · offline (last known)";
      else if (k.orgStatsStale) freshness += " · stale cache";
      const sourceNote = k.tokensSource === "none"
        ? "Token savings accumulate as memory is recalled during sessions."
        : k.tokensSource === "local"
        ? "Showing memory recall tracked on this machine."
        : "";
      document.getElementById("kpi-cards").innerHTML = [
        { label: "Tokens saved", value: formatTokens(k.tokensSaved) },
        { label: "Memory searches", value: k.memorySearches ?? 0 },
        { label: "Skills created", value: k.skillsCreated ?? 0 },
        { label: "Sessions", value: k.sessionsCount == null ? "—" : k.sessionsCount },
      ].map(c => '<div class="card"><div class="label">' + esc(c.label) + '</div><div class="value">' + esc(c.value) + '</div></div>').join("");
      let meta = "Token source: " + sourceLabel + freshness + (data.repoProject ? " · " + data.repoProject : "");
      if (sourceNote) meta += "\\n" + sourceNote;
      document.getElementById("kpi-meta").textContent = meta;
    }

    function renderSettings(payload) {
      document.getElementById("settings-auth").textContent = payload.authLabel || "";
      document.getElementById("settings-health").textContent = payload.healthSummary || "";
      document.getElementById("embeddings-status").textContent = payload.embeddingsStatus || "Unknown";
      document.getElementById("skill-sync-result").textContent = payload.skillSyncSummary || "";
      document.getElementById("graph-build-result").textContent = payload.graphBuildMessage || "";
      const gs = document.getElementById("settings-graph-status");
      if (gs) gs.textContent = payload.graphStatus || "Not built.";
      const og = document.getElementById("open-goals-preview");
      if (og) og.textContent = payload.openGoalsPreview || "(none)";
    }

    function renderSessions(sessions) {
      const ul = document.getElementById("session-list");
      if (!sessions || sessions.length === 0) {
        ul.innerHTML = '<li class="empty">No recent sessions recorded.</li>';
        return;
      }
      ul.innerHTML = sessions.map(s => {
        const recall = s.hadRecall ? "recalled" : "no recalls";
        const proj = s.project ? " · " + s.project : "";
        const events = s.eventCount != null ? s.eventCount : s.memorySearchCount;
        return '<li data-session="' + esc(s.sessionId) + '"><strong>' + esc(s.sessionId.slice(0, 8)) + '…</strong> · ' +
        esc(s.endedAt) + proj + ' · <span class="tag">' + esc(recall) + '</span> · events: ' + esc(events) + '</li>';
      }).join("");
      ul.querySelectorAll("li[data-session]").forEach(li => {
        li.addEventListener("click", () => post("openSession", { sessionId: li.dataset.session }));
      });
    }

    function renderRules(rules) {
      const ul = document.getElementById("rules-list");
      if (!rules || rules.length === 0) {
        ul.innerHTML = '<li class="empty">No active rules.</li>';
        return;
      }
      ul.innerHTML = rules.map(r =>
        '<li data-id="' + esc(r.id) + '">' +
        '<span class="tag">' + esc(r.status) + '</span> ' +
        '<span class="rule-text">' + esc(r.text) + '</span> ' +
        '<button class="btn edit-btn" data-id="' + esc(r.id) + '" data-text="' + esc(r.text) + '">Edit</button>' +
        '<button class="btn done-btn" data-id="' + esc(r.id) + '">Complete</button>' +
        '</li>'
      ).join("");
      ul.querySelectorAll(".done-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          post("rulesDone", { ruleId: btn.dataset.id });
        });
      });
      ul.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const li = btn.closest("li");
          if (li.querySelector(".edit-form")) return;
          const form = document.createElement("div");
          form.className = "edit-form row";
          form.innerHTML = '<input type="text" class="edit-input" value="' + esc(btn.dataset.text) + '" style="flex:1" />' +
            '<button class="btn save-btn">Save</button><button class="btn cancel-btn">Cancel</button>';
          li.appendChild(form);
          form.querySelector(".save-btn").addEventListener("click", () => {
            const newText = form.querySelector(".edit-input").value.trim();
            if (!newText) return;
            if (newText.includes("\\n") || newText.length > 2000) {
              alert("Rule must be single-line and at most 2000 characters.");
              return;
            }
            if (newText) post("rulesEdit", { ruleId: btn.dataset.id, text: newText });
            form.remove();
          });
          form.querySelector(".cancel-btn").addEventListener("click", () => form.remove());
        });
      });
    }

    function renderGoals(goals) {
      const ul = document.getElementById("goals-list");
      if (!goals || goals.length === 0) {
        ul.innerHTML = '<li class="empty">No goals yet.</li>';
        return;
      }
      ul.innerHTML = goals.map(g =>
        '<li>' +
        '<span class="tag">' + esc(g.status || "open") + '</span> ' +
        '<span class="goal-text">' + esc(g.text || g.goalId) + '</span>' +
        (g.owner ? ' <span class="meta">· ' + esc(g.owner) + '</span>' : '') +
        '</li>'
      ).join("");
    }

    function renderSkills(skills) {
      const root = document.getElementById("skills-list");
      if (!skills || skills.length === 0) {
        root.innerHTML = '<p class="empty">No locally mined skills found.</p>';
        return;
      }
      root.innerHTML = skills.map(s => {
        const share = s.shareScope === "team" ? "team" : (s.shareScope === "me" ? "me" : "local");
        const shareClass = s.shareScope === "team" ? "team" : "me";
        // Team-scope skills are already shared and live under the global
        // skills dir, so the project-path promote flow cannot re-publish
        // them. Show a status label instead of a button that always errors.
        const action = s.shareScope === "team"
          ? '<span class="meta">Shared with team</span>'
          : '<button class="btn promote-btn" data-dir="' + esc(s.dirName || s.label) + '">Promote to team</button>';
        return '<div class="skill-row" data-dir="' + esc(s.dirName || s.label) + '">' +
        '<span>' + esc(s.label) + ' <span class="tag ' + shareClass + '">' + esc(share) + '</span></span>' +
        action +
        '</div>';
      }).join("");
      root.querySelectorAll(".promote-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.disabled = true;
          btn.textContent = "Promoting…";
          post("promoteSkill", { dirName: btn.dataset.dir });
        });
      });
    }

  const GRAPH_NODE_CAP = 350;

  function layerOf(node) {
    const f = (node.source_file || "").toLowerCase();
    if (f.includes("test") || f.includes("__tests__")) return "test";
    if (f.includes("config") || f.endsWith(".json")) return "config";
    return "source";
  }

  function nodeRadius(d) {
    const fan = d.fan_in || 0;
    return Math.max(4, Math.min(14, 4 + Math.sqrt(fan)));
  }

  function nodeShapeKind(d) {
    if (d.is_entrypoint) return "diamond";
    if (d.kind === "class") return "rect";
    return "circle";
  }

  function nodeColor(d) {
    const impactOrigins = new Set((state.impact && state.impact.originNodeIds) || []);
    const impactDepth = new Map((state.impact && state.impact.dependents || []).map(x => [x.id, x.depth]));
    const highlight = new Set(state.highlight || []);
    const q = (state.graphSearch || "").toLowerCase();
    if (impactOrigins.has(d.id)) return "#f7768e";
    if (impactDepth.has(d.id)) return "#e0af68";
    if (highlight.has(d.id)) return "#9ece6a";
    if (q && ((d.label || "").toLowerCase().includes(q) || (d.id || "").toLowerCase().includes(q))) return "#bb9af7";
    return "#7aa2f7";
  }

  function filteredSnapshot(snap) {
    if (!snap || !Array.isArray(snap.nodes)) return { nodes: [], links: [], total: 0 };
    const total = snap.nodes.length;
    let nodes = snap.nodes.filter(n => state.graphLayers.has(layerOf(n)));
    if (total > GRAPH_NODE_CAP) {
      nodes = nodes.slice().sort((a, b) => (b.fan_in || 0) - (a.fan_in || 0)).slice(0, GRAPH_NODE_CAP);
    }
    const ids = new Set(nodes.map(n => n.id));
    const links = (snap.links || []).filter(l => ids.has(l.source) && ids.has(l.target));
    return { nodes, links, total };
  }

  function updateGraphStyles() {
    if (!graphUi.nodeSel && !graphUi.shapeSel) return;
    const paint = (sel) => sel
      .attr("fill", d => nodeColor(d))
      .attr("stroke", d => d.exported ? "#9ece6a" : "#414868")
      .attr("stroke-width", d => d.exported ? 2 : 1);
    if (graphUi.nodeSel) {
      graphUi.nodeSel.attr("r", d => nodeRadius(d));
      paint(graphUi.nodeSel);
    }
    if (graphUi.shapeSel) {
      graphUi.shapeSel.select("rect")
        .attr("width", d => nodeRadius(d) * 2)
        .attr("height", d => nodeRadius(d) * 2)
        .attr("x", d => -nodeRadius(d))
        .attr("y", d => -nodeRadius(d));
      graphUi.shapeSel.select("path")
        .attr("d", d => {
          const r = nodeRadius(d);
          return "M0," + (-r) + " L" + r + ",0 L0," + r + " L" + (-r) + ",0 Z";
        });
      paint(graphUi.shapeSel);
    }
    if (graphUi.linkSel) {
      graphUi.linkSel.attr("stroke", d => {
        const rel = (d.relation || "").toLowerCase();
        if (rel.includes("import")) return "#7dcfff";
        if (rel.includes("call")) return "#565f89";
        return "#565f89";
      }).attr("marker-end", "url(#arrow)");
    }
  }

  function rebuildGraphFromSnapshot() {
    if (typeof d3 === "undefined") {
      const meta = document.getElementById("graph-meta");
      if (meta) meta.textContent = "Graph library failed to load.";
      return;
    }
    if (graphUi.simulation) graphUi.simulation.stop();
    const svg = d3.select("#graph-canvas");
    svg.selectAll("*").remove();
    graphUi = { simulation: null, nodeSel: null, linkSel: null, shapeSel: null, nodes: [], links: [], snapshotKey: "" };

    const canvasEl = document.getElementById("graph-canvas");
    const rect = canvasEl.getBoundingClientRect();
    const width = Math.max(Math.round(rect.width) || canvasEl.clientWidth || 600, 240);
    const height = Math.max(Math.round(rect.height) || 420, 240);
    svg.attr("viewBox", [0, 0, width, height]);

    const emptyBanner = document.getElementById("graph-empty-banner");
    const emptyActions = document.getElementById("graph-empty-actions");
    const staleBanner = document.getElementById("graph-stale-banner");
    if (emptyBanner) emptyBanner.hidden = true;
    if (emptyActions) emptyActions.hidden = true;
    if (staleBanner) staleBanner.hidden = true;

    const snap = state.graph;
    if (!snap || !Array.isArray(snap.nodes) || snap.nodes.length === 0) {
      document.getElementById("graph-meta").textContent = "No graph snapshot yet.";
      if (emptyBanner) {
        emptyBanner.hidden = false;
        emptyBanner.textContent = "No codebase graph for this repo yet. Build one to explore dependencies.";
      }
      if (emptyActions) emptyActions.hidden = false;
      return;
    }

    const { nodes: rawNodes, links: rawLinks, total } = filteredSnapshot(snap);
    if (rawNodes.length === 0) {
      document.getElementById("graph-meta").textContent = "No nodes match the current filters.";
      return;
    }

    const nodes = rawNodes.map(n => Object.assign({}, n));
    // Seed positions around the viewport center so the graph reads as
    // centered immediately, even before the force simulation settles
    // (a hidden-tab build otherwise leaves nodes piled at the origin).
    const cx = width / 2;
    const cy = height / 2;
    nodes.forEach((n) => {
      n.x = cx + (Math.random() - 0.5) * Math.min(width, height) * 0.6;
      n.y = cy + (Math.random() - 0.5) * Math.min(width, height) * 0.6;
    });
    const links = rawLinks.map(l => ({ source: l.source, target: l.target, relation: l.relation }));
    graphUi.nodes = nodes;
    graphUi.links = links;
    graphUi.snapshotKey = snapshotCacheKey();

    svg.append("defs").append("marker")
      .attr("id", "arrow").attr("viewBox", "0 -5 10 10")
      .attr("refX", 12).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#565f89");

    graphUi.simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(40))
      .force("charge", d3.forceManyBody().strength(-80))
      .force("center", d3.forceCenter(width / 2, height / 2));

    graphUi.linkSel = svg.append("g").attr("stroke-opacity", 0.6)
      .selectAll("line").data(links).join("line").attr("stroke-width", 1);

    const circles = nodes.filter(n => nodeShapeKind(n) === "circle");
    const shapes = nodes.filter(n => nodeShapeKind(n) !== "circle");

    graphUi.nodeSel = svg.append("g").selectAll("circle").data(circles).join("circle")
      .attr("r", d => nodeRadius(d))
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded))
      .on("click", (_, d) => inspectNode(d));

    graphUi.shapeSel = svg.append("g").selectAll("g").data(shapes).join("g")
      .call(d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded))
      .on("click", (_, d) => inspectNode(d));
    graphUi.shapeSel.each(function(d) {
      const g = d3.select(this);
      if (nodeShapeKind(d) === "rect") g.append("rect");
      else g.append("path");
    });

    function dragStarted(event, d) { if (!event.active) graphUi.simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function dragEnded(event, d) { if (!event.active) graphUi.simulation.alphaTarget(0); d.fx = null; d.fy = null; }

    function inspectNode(d) {
      post("graphNodeClick", { nodeId: d.id });
      const el = document.getElementById("graph-inspect");
      if (el) {
        el.hidden = false;
        let via = "";
        if (state.impact && state.impact.dependents) {
          const dep = state.impact.dependents.find(x => x.id === d.id);
          if (dep && dep.via) via = " · via " + dep.via.rel + " from " + dep.via.from;
        }
        el.textContent = (d.label || d.id) + " · " + (d.kind || "") + " · " + (d.source_file || "") + ":" + (d.source_location || "") + via;
      }
    }

    const titleText = d => (d.label || d.id) + "\\n" + (d.source_file || "") + ":" + (d.source_location || "");
    graphUi.nodeSel.append("title").text(titleText);
    graphUi.shapeSel.append("title").text(titleText);

    function applyPositions() {
      graphUi.linkSel.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      graphUi.nodeSel.attr("cx", d => d.x).attr("cy", d => d.y);
      graphUi.shapeSel.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
    }
    graphUi.simulation.on("tick", applyPositions);

    // Settle the layout synchronously and paint final positions. Webview
    // animation timers are throttled when the panel is backgrounded, which
    // otherwise leaves every node stuck at the SVG origin (top-left pile).
    // tick() advances state but does not dispatch the "tick" event, so we
    // apply positions once by hand afterwards. Drag still restarts the timer.
    graphUi.simulation.stop();
    const settleTicks = Math.min(400, Math.max(120, Math.round(nodes.length * 1.5)));
    for (let i = 0; i < settleTicks; i++) graphUi.simulation.tick();
    applyPositions();

    // Fit the viewBox to the settled node bounds so the whole graph is
    // visible and centered, regardless of how far the force layout spread.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const r = nodeRadius(n);
      if (n.x - r < minX) minX = n.x - r;
      if (n.x + r > maxX) maxX = n.x + r;
      if (n.y - r < minY) minY = n.y - r;
      if (n.y + r > maxY) maxY = n.y + r;
    }
    if (Number.isFinite(minX) && Number.isFinite(maxX)) {
      const pad = 24;
      const boxW = Math.max(maxX - minX, 10) + pad * 2;
      const boxH = Math.max(maxY - minY, 10) + pad * 2;
      svg.attr("viewBox", [minX - pad, minY - pad, boxW, boxH]);
      svg.attr("preserveAspectRatio", "xMidYMid meet");
    }

    updateGraphStyles();
    const lodNote = total > GRAPH_NODE_CAP ? " · showing top " + nodes.length + " of " + total + " nodes" : "";
    document.getElementById("graph-meta").textContent =
      nodes.length + " rendered · " + links.length + " edges · " + total + " total in snapshot" + lodNote;
    if (state.graphMeta && state.graphMeta.commitSha) {
      const sb = document.getElementById("graph-stale-banner");
      if (sb) {
        sb.hidden = false;
        sb.textContent = "Snapshot commit: " + state.graphMeta.commitSha.slice(0, 8) + " (rebuild if HEAD moved).";
      }
    }
  }

  function snapshotCacheKey() {
    if (!state.graph || !Array.isArray(state.graph.nodes)) return "";
    const fs = filteredSnapshot(state.graph);
    const commit = (state.graphMeta && state.graphMeta.commitSha) || "";
    // Include edge count + commit sha (not just node count): an edge-only
    // change keeps the node count identical, and the old startsWith(nodeCount)
    // check would skip the rebuild and leave stale edges on screen.
    return commit + ":" + fs.total + ":" + fs.nodes.length + ":" + fs.links.length;
  }

  function renderGraph() {
    if (graphUi.snapshotKey && graphUi.snapshotKey === snapshotCacheKey()) {
      updateGraphStyles();
      return;
    }
    rebuildGraphFromSnapshot();
  }

  function renderMarkdownSummary(text) {
    const el = document.getElementById("session-summary-text");
    if (!el) return;
    const lines = String(text || "").split(/\\r?\\n/);
    let html = "";
    for (const line of lines) {
      if (/^###\\s+/.test(line)) html += "<h3>" + esc(line.replace(/^###\\s+/, "")) + "</h3>";
      else if (/^##\\s+/.test(line)) html += "<h2>" + esc(line.replace(/^##\\s+/, "")) + "</h2>";
      else if (/^#\\s+/.test(line)) html += "<h1>" + esc(line.replace(/^#\\s+/, "")) + "</h1>";
      else if (/^[-*]\\s+/.test(line)) html += "<li>" + esc(line.replace(/^[-*]\\s+/, "")) + "</li>";
      else if (line.trim().startsWith(String.fromCharCode(96, 96, 96))) html += "<code>" + esc(line.replace(new RegExp(String.fromCharCode(96, 96, 96), "g"), "")) + "</code><br/>";
      else if (line.trim()) html += "<p>" + esc(line) + "</p>";
    }
    el.innerHTML = html.replace(/(<li>.*<\\/li>)/gs, m => "<ul>" + m + "</ul>");
  }

    function renderNextSteps(steps, promotedSteps) {
      const container = document.getElementById("next-steps-list");
      if (!container) return;
      const promoted = promotedSteps || state.promotedSteps || new Set();
      if (!steps || steps.length === 0) {
        container.innerHTML = '<p class="empty">No Next Steps found in this summary.</p>';
        return;
      }
      container.innerHTML = steps.map((s) => {
        const key = String(s).trim().toLowerCase();
        const done = promoted.has(key);
        return '<div class="row" style="margin:4px 0">' +
        '<span style="flex:1">' + esc(s) + '</span>' +
        '<button class="btn step-goal-btn" data-step="' + esc(s) + '" ' + (done ? 'disabled' : '') + '>' +
        (done ? "Promoted" : "Create goal") + '</button>' +
        '</div>';
      }).join("");
      container.querySelectorAll(".step-goal-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          btn.disabled = true;
          post("nextStepsPromote", { text: btn.dataset.step });
        });
      });
    }

    window.addEventListener("message", (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      switch (msg.type) {
        case "dashboardData":
          renderKpis(msg.data);
          state.graph = msg.data.graph && msg.data.graph.snapshot;
          state.graphMeta = msg.data.graph || null;
          if (msg.graphCorrupt) {
            const eb = document.getElementById("graph-empty-banner");
            if (eb) {
              eb.hidden = false;
              eb.textContent = "Graph snapshot is corrupt or unreadable. Rebuild with hivemind graph build.";
            }
            state.graph = null;
          }
          renderGraph();
          break;
        case "settings":
          renderSettings(msg);
          break;
        case "sessions":
          renderSessions(msg.sessions);
          break;
        case "sessionSummary":
          document.getElementById("session-detail").hidden = false;
          renderMarkdownSummary(msg.text || "(no summary on disk)");
          const hint = document.getElementById("session-degraded-hint");
          if (hint) {
            hint.hidden = !msg.degradedHint;
            hint.textContent = msg.degradedHint || "";
          }
          if (msg.promotedSteps) state.promotedSteps = new Set(msg.promotedSteps);
          renderNextSteps(msg.nextSteps || [], state.promotedSteps);
          break;
        case "rules":
          if (msg.loggedOut) {
            document.getElementById("rules-list").innerHTML = '<li class="empty">' + esc(msg.message || "Log in required.") + '</li>';
          } else {
            renderRules(msg.rules);
          }
          break;
        case "skills":
          if (msg.loggedOut) {
            document.getElementById("skills-list").innerHTML = '<p class="empty">' + esc(msg.message || "Log in required.") + '</p>';
          } else {
            renderSkills(msg.skills);
          }
          break;
        case "goals":
          if (msg.loggedOut) {
            document.getElementById("goals-list").innerHTML = '<li class="empty">' + esc(msg.message || "Log in required.") + '</li>';
          } else {
            renderGoals(msg.goals);
          }
          break;
        case "impact":
          state.impact = msg.impact;
          const caveat = document.getElementById("impact-caveat");
          caveat.hidden = !msg.impact;
          if (msg.impact) {
            let text = msg.impact.caveat || "";
            if (msg.impact.totalDependents > 0) {
              text += " Showing " + (msg.impact.dependents || []).length + " of " + msg.impact.totalDependents + " dependents";
              if (msg.impact.capped) text += " (capped)";
            } else if ((msg.impact.originNodeIds || []).length === 0 && (msg.impact.changedFiles || []).length > 0) {
              text += " No graph nodes match changed files.";
            }
            caveat.textContent = text;
          }
          updateGraphStyles();
          break;
        case "graphHighlight":
          state.highlight = msg.nodeIds || [];
          updateGraphStyles();
          break;
        case "error":
          console.error(msg.message);
          break;
        case "actionResult":
          if (msg.target === "graphBuild") {
            const btn = document.getElementById("btn-graph-build");
            if (btn) btn.disabled = !!msg.inProgress;
            document.getElementById("graph-build-result").textContent = msg.message || "";
            const inlineBtn = document.getElementById("btn-graph-build-inline");
            if (inlineBtn) {
              inlineBtn.disabled = !!msg.inProgress;
              inlineBtn.textContent = msg.inProgress ? "Building graph…" : "Build graph now";
            }
            const emptyBanner = document.getElementById("graph-empty-banner");
            if (emptyBanner && (msg.inProgress || !msg.ok)) {
              emptyBanner.hidden = false;
              emptyBanner.textContent = msg.message || "";
            }
          }
          if (msg.target === "goals") {
            const el = document.getElementById("goal-add-result");
            if (el) el.textContent = msg.message || "";
          }
          if (msg.target === "skillSync") {
            document.getElementById("skill-sync-result").textContent = msg.message || "";
          }
          if (msg.target === "rules") post("rulesList");
          if (msg.target === "skillPromote") {
            const el = document.getElementById("skill-promote-result");
            if (el) el.textContent = msg.message || "";
            document.querySelectorAll(".promote-btn").forEach(b => { b.disabled = false; b.textContent = "Promote to team"; });
          }
          if (msg.target === "embeddings") {
            const el = document.getElementById("embeddings-status");
            if (el && msg.message) el.textContent = msg.message;
          }
          if (msg.target === "workspaceSwitch") {
            const el = document.getElementById("workspace-switch-result");
            if (el) el.textContent = msg.message || "";
          }
          if (msg.target === "nextStepsGoal") {
            const el = document.getElementById("next-steps-result");
            if (el) el.textContent = msg.message || "";
            if (msg.ok && msg.message && msg.message.indexOf("Goal created:") === 0) {
              const goalText = msg.message.slice("Goal created:".length).trim();
              if (goalText) state.promotedSteps.add(goalText.toLowerCase());
            }
          }
          if (msg.target === "orgSwitch") {
            const el = document.getElementById("org-switch-result");
            if (el) el.textContent = msg.message || "";
          }
          break;
      }
    });

    post("ready");
  </script>
</body>
</html>`;
}
