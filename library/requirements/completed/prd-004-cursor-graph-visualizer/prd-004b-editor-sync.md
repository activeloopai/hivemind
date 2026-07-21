# PRD-004b: Editor Sync & Navigation

> **Status:** Backlog
> **Priority:** P2
> **Effort:** L (1-3d)
> **Schema changes:** None
> **Parent:** [`prd-004-cursor-graph-visualizer-index`](./prd-004-cursor-graph-visualizer-index.md)

---

## Overview

This sub-feature fuses the graph and the editor into one surface. The graph rendered by PRD-004a is informative, but a static picture of a codebase is only half the value. The other half is navigation: a developer should be able to click any node and land on the exact line of code it represents, and, going the other way, see where they currently are in the code reflected as a highlighted node in the graph. This pane makes the map and the territory move together.

The value is the elimination of the context switch. Today, understanding "where is this function and what is around it" means reading a text node-detail dump (`src/graph/vfs-handler.ts:549-607`) that prints `source_file:source_location`, then manually opening that file and scrolling to that line. Every node the snapshot stores already carries its precise location, encoded as `L<line>` or `L<line>-<endLine>` and guaranteed 1-indexed (`src/graph/types.ts:99-102`). This pane turns that stored coordinate into a single click that opens the file and positions the cursor, and it closes the loop by mapping the editor's live cursor back onto the graph. The graph stops being a thing you look at and becomes a thing you navigate with.

---

## Why this matters

The snapshot was built to be navigable, but nothing has ever let a human navigate it. Three facts make this sub-feature both valuable and tractable:

1. **Every node knows exactly where it lives.** `GraphNode.source_file` is a repo-root-relative path with forward slashes and no leading slash (`src/graph/types.ts:99-100`), and `GraphNode.source_location` is a 1-indexed `L<line>` or `L<line>-<endLine>` range (`src/graph/types.ts:101-102`). That is precisely the information an editor needs to open a file and place a cursor; the text renderers already parse it (`parseLocation`, `src/graph/render/neighborhood.ts:162-165`).
2. **The node id is a stable, reversible key.** Node ids follow the format `<source_file>:<symbol_name>:<kind>` (`src/graph/types.ts:92-93`), so a node carries its file and kind in its identity. That makes both directions feasible: graph-to-editor (read the location off the node) and editor-to-graph (find nodes whose `source_file` matches the active file, then narrow by line).
3. **The cross-reference is one-to-many and sometimes stale.** Multiple symbols can occupy or overlap a line, and the snapshot can lag live edits (the VFS index warns when a file's mtime is newer than the build, `src/graph/vfs-handler.ts:304`). So editor-to-graph mapping must resolve ambiguity gracefully and degrade honestly when the snapshot no longer matches the file, rather than jumping to the wrong node or silently failing.

Getting this right is what makes the visualizer feel like part of Cursor instead of a picture pinned next to it.

---

## Goals

- Clicking a node in the graph opens its `source_file` in Cursor and moves the cursor to the start line parsed from `source_location`, selecting or revealing the declaration (`src/graph/types.ts:99-102`).
- Moving the cursor in an open editor highlights the corresponding node in the graph, resolved by matching the active file to node `source_file` and the cursor line to the node's `source_location` range.
- Resolve the inherent ambiguity (several symbols on or near one line) deterministically and visibly, preferring the most specific enclosing symbol and disclosing when multiple candidates match.
- Degrade honestly when the snapshot is stale relative to the file: a node whose location no longer matches the live file opens the file at the best-known line and signals that the graph may be behind, consistent with the VFS staleness caveat (`src/graph/vfs-handler.ts:304`).
- Keep the sync responsive and non-intrusive: editor-to-graph highlighting tracks cursor movement within one sync interval without stealing focus or fighting the developer's scrolling.

## Non-Goals

- **Rendering the graph.** Drawing nodes/edges and exposing node identity is PRD-004a. This pane consumes the selected-node id and `source_location` PRD-004a exposes and drives its highlight API.
- **Impact / blast-radius highlighting.** Coloring dependents of unstaged changes is PRD-004c. This pane owns single-symbol navigation and active-node highlighting, not multi-node impact sets.
- **Re-extracting or rebuilding to fix staleness.** When the snapshot lags the file, this pane discloses the gap and routes a rebuild to PRD-003b; it does not re-run extraction itself.
- **Editing code from the graph.** Navigation positions the cursor; it does not modify the symbol it lands on.
- **Cross-file "go to definition" semantics.** This pane navigates to the node's own declaration line. Following an edge to a callee's definition is a graph navigation (selecting the target node), not a language-server jump.
- **Multi-editor / split-view orchestration.** Beyond opening the file and placing the cursor in the active editor group, advanced split or peek layouts are out of scope.

---

## Graph to editor: click a node, land on the line

The forward direction is the simpler one because the node already carries everything needed.

1. **Read the coordinates off the node.** `source_file` gives the repo-root-relative path; `source_location` gives the 1-indexed start line (and optional end line). The same parse the text renderer uses applies (`parseLocation` extracts the leading `L<n>`, `src/graph/render/neighborhood.ts:162-165`).
2. **Resolve to a workspace path.** Join `source_file` to the repo root to get the on-disk file. Because `source_file` is normalized (forward slashes, no leading slash, `src/graph/types.ts:99-100`), this is a direct join.
3. **Open and position.** Open the document in Cursor and move the cursor to the start line, revealing the range when an end line is present, so the whole declaration is visible.
4. **Handle a missing or moved target.** If the file no longer exists, or the line is beyond the file's current length (an edit shrank it), open the file at the nearest valid position and signal that the graph may be stale, rather than throwing.

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant Graph as Graph canvas (PRD-004a)
  participant Sync as Editor-sync controller
  participant Cursor as Cursor editor

  Dev->>Graph: Click node
  Graph->>Sync: node id + source_file + source_location
  Sync->>Sync: parse start line (L<n>); join source_file to repo root
  Sync->>Cursor: open document + reveal range
  alt File + line valid
    Cursor-->>Dev: cursor on the declaration line
  else File missing or line out of range
    Cursor-->>Dev: best-effort open + "graph may be stale" hint
  end
```

---

## Editor to graph: move the cursor, highlight the node

The reverse direction is the harder one because the mapping is one-to-many and time-sensitive.

- **Match the file first.** From the active editor, compute the repo-root-relative path and collect candidate nodes whose `source_file` equals it. This is a cheap filter over the snapshot's nodes (the same `source_file` field the layer and neighborhood views group on, `src/graph/render/neighborhood.ts:49-56`).
- **Narrow by line.** Among the file's nodes, choose the one whose `source_location` range contains (or most tightly encloses) the cursor line. When `source_location` is a single line (`L<line>`), match by proximity; when it is a range (`L<line>-<endLine>`), prefer the smallest enclosing range so a method inside a class wins over the class.
- **Resolve ties deterministically.** If multiple nodes still match (overlapping ranges, same line), pick by a stable rule (smallest range, then node `id` order, mirroring the deterministic ordering the snapshot is built with, `src/graph/snapshot.ts:98-110`) and, when genuinely ambiguous, allow the graph to indicate more than one candidate rather than guessing silently.
- **Highlight, do not hijack.** Highlighting the active node updates the graph's selection/emphasis (driving PRD-004a's highlight API). It must not steal editor focus, recenter the canvas abruptly on every keystroke, or fight the developer's manual panning; debouncing on cursor movement keeps it calm.
- **Handle "no matching node."** A cursor on a line with no symbol (a comment, a blank line, brand-new code not yet in the snapshot) clears the highlight or leaves the last selection, with no error.

---

## The staleness reality

Editor sync is the place where snapshot staleness becomes most visible, because the developer is comparing a stored coordinate against a live buffer.

- **The snapshot can lag the file.** Builds are point-in-time; the VFS itself warns that a file whose mtime is newer than the build may have moved on (`src/graph/vfs-handler.ts:304`). A function the snapshot says is at `L42` may now be at `L58`.
- **Forward navigation stays useful anyway.** Opening the file at the stored line still lands the developer in the right neighborhood; combined with a "graph may be N behind" cue (shared with PRD-004a's stale banner), it is honest and still helpful.
- **Reverse navigation tolerates drift.** Line-range matching with smallest-enclosing preference is resilient to small line shifts; when drift is large enough that no node matches, the pane clears the highlight rather than snapping to a wrong node.
- **Rebuild is one route away.** Where staleness is material, the pane surfaces the same Build/Refresh affordance owned by PRD-003b (`prd-003b-settings-manager.md`) so the developer can resync the graph to HEAD.

---

## Presentation requirements

- **Single-click forward navigation.** One click on a node opens the file and positions the cursor; no intermediate dialog for the unambiguous case.
- **Calm reverse highlighting.** Active-node highlighting tracks the cursor within one sync interval, debounced, and never steals editor focus or yanks the canvas on every keystroke.
- **Visible ambiguity, never silent guessing.** When several nodes match a cursor line, the pane indicates the candidate set or its deterministic pick rather than jumping arbitrarily.
- **Honest staleness.** When a node's stored location no longer matches the live file, navigation still works best-effort and the "graph may be stale" cue is shown.
- **Accessible.** Selection and highlight states are conveyed by more than color (outline, label, or focus ring), consistent with PRD-004a's accessibility rule.
- **No secret leakage.** The messages passed between the Webview and the extension carry only node ids, file paths, and line numbers, never tokens or API keys.

---

## Acceptance criteria

| ID | Criterion |
|---|---|
| AC-1 | Given a rendered graph, when the developer clicks a node, then Cursor opens the node's `source_file` and moves the cursor to the start line parsed from `source_location`. |
| AC-2 | Given a node whose `source_location` is a range (`L<line>-<endLine>`), when it is clicked, then the editor reveals the full range so the declaration is visible, not just the first line. |
| AC-3 | Given an open editor on a file represented in the graph, when the developer moves the cursor onto a symbol, then the corresponding node is highlighted in the graph within one sync interval. |
| AC-4 | Given a cursor line that several nodes could match, when reverse sync runs, then the pane selects the smallest enclosing symbol deterministically and indicates when multiple candidates exist rather than guessing silently. |
| AC-5 | Given a cursor on a line with no represented symbol, when reverse sync runs, then the highlight is cleared or left unchanged with no error. |
| AC-6 | Given a snapshot that is stale relative to the live file, when the developer clicks a node whose line has shifted, then the file opens at the best-known position and a "graph may be stale" cue is shown. |
| AC-7 | Given a node whose file no longer exists, when it is clicked, then the pane reports the missing file gracefully instead of throwing. |
| AC-8 | Given reverse highlighting is active, when the developer types or scrolls, then highlighting is debounced and never steals editor focus or recenters the canvas on every keystroke. |
| AC-9 | Given the messages exchanged between the Webview and extension are inspected, when their contents are examined, then only node ids, file paths, and line numbers appear, with no token or API key. |

---

## Open questions

- [ ] What is the cheapest reliable way to compute the active file's repo-root-relative path so it matches the snapshot's `source_file` normalization across worktrees and symlinks?
- [ ] When `source_location` is a single line (`L<line>`) and several symbols share it, what is the best tie-break: declaration order, node `id` order, or `kind` priority (method over class)?
- [ ] Should reverse sync match against the live buffer's current line directly, or attempt a small fuzzy line-offset search to absorb minor staleness before clearing the highlight?
- [ ] Should clicking a node reveal the range via selection, a non-destructive highlight decoration, or a peek, to avoid surprising the developer with a selection they did not make?
- [ ] How is the repo root resolved for the path join, and does it reuse the same repo-identity derivation the snapshot loader uses (`deriveProjectKey`, `src/graph/vfs-handler.ts:171`)?
- [ ] Should editor-to-graph sync be on by default or opt-in, given some developers may find live highlighting distracting during deep editing?

---

## Related

- [`prd-004-cursor-graph-visualizer-index`](./prd-004-cursor-graph-visualizer-index.md): parent module.
- [`prd-004a-graph-webview`](./prd-004a-graph-webview.md): renders the graph and exposes the node identity and highlight API this pane drives.
- [`prd-004c-impact-visualizer`](./prd-004c-impact-visualizer.md): shares the same node-to-file mapping, applied to a set of changed symbols rather than a single click.
- [`../prd-003-cursor-extension-dashboard/prd-003b-settings-manager.md`](../prd-003-cursor-extension-dashboard/prd-003b-settings-manager.md): owns the rebuild the stale-graph cue routes to.
- Source grounding: `src/graph/types.ts:92-125` (node `id` format, `source_file`, `source_location`), `src/graph/render/neighborhood.ts:49-56,162-165` (file-to-node matching and `parseLocation`), `src/graph/vfs-handler.ts:304,549-607` (the staleness caveat and the text node-detail this pane supersedes with navigation), `src/graph/snapshot.ts:98-110` (deterministic node ordering for tie-breaks), `src/graph/vfs-handler.ts:171` (`deriveProjectKey` repo-identity derivation).
