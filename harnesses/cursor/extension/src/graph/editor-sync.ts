import * as vscode from "vscode";
import type { GraphNode, GraphSnapshot } from "./types";

export interface ParsedLocation {
  startLine: number;
  endLine: number;
}

/** Parse `L<line>` or `L<line>-<endLine>` (1-indexed). */
export function parseSourceLocation(loc: string): ParsedLocation {
  const m = loc.match(/^L(\d+)(?:-(\d+))?/);
  if (!m) return { startLine: 1, endLine: 1 };
  const startLine = parseInt(m[1]!, 10);
  const endLine = m[2] ? parseInt(m[2], 10) : startLine;
  return { startLine, endLine };
}

function locationSpan(loc: string): { start: number; end: number } {
  const { startLine, endLine } = parseSourceLocation(loc);
  return { start: startLine, end: Math.max(startLine, endLine) };
}

function rangeSize(loc: string): number {
  const { start, end } = locationSpan(loc);
  return end - start + 1;
}

/** Find the best-matching node for a file path and 1-indexed cursor line. */
export function findNodesAtPosition(
  snapshot: GraphSnapshot,
  relativeFile: string,
  line: number,
): GraphNode[] {
  const normalized = relativeFile.replace(/\\/g, "/").replace(/^\//, "");
  const candidates = snapshot.nodes.filter((n) => n.source_file === normalized);
  const enclosing = candidates.filter((n) => {
    const { start, end } = locationSpan(n.source_location);
    return line >= start && line <= end;
  });
  const pool = enclosing.length > 0 ? enclosing : candidates.filter((n) => parseSourceLocation(n.source_location).startLine === line);
  return pool.sort((a, b) => {
    const sizeDiff = rangeSize(a.source_location) - rangeSize(b.source_location);
    if (sizeDiff !== 0) return sizeDiff;
    return a.id.localeCompare(b.id);
  });
}

function toWorkspaceUri(repoRoot: string, sourceFile: string): vscode.Uri {
  return vscode.Uri.file(`${repoRoot.replace(/\/$/, "")}/${sourceFile}`);
}

/** Open a graph node in the editor and reveal its declaration range. */
export async function openNodeInEditor(
  node: GraphNode,
  repoRoot: string,
): Promise<{ ok: boolean; stale?: boolean; message?: string }> {
  const uri = toWorkspaceUri(repoRoot, node.source_file);
  const { startLine, endLine } = parseSourceLocation(node.source_location);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const lineCount = doc.lineCount;
    const line = Math.min(Math.max(1, startLine), lineCount) - 1;
    const end = Math.min(Math.max(line, endLine - 1), lineCount - 1);
    const range = new vscode.Range(line, 0, end, doc.lineAt(end).text.length);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    const stale = startLine > lineCount;
    return {
      ok: true,
      stale,
      message: stale ? "Graph location may be stale relative to the open file." : undefined,
    };
  } catch {
    return { ok: false, message: `Could not open ${node.source_file}` };
  }
}

export interface EditorGraphSyncHandle {
  dispose(): void;
}

/**
 * Highlight graph nodes that match the active editor cursor.
 * `onHighlight` receives node ids (empty when none match).
 */
export function startEditorToGraphSync(
  snapshot: GraphSnapshot,
  repoRoot: string,
  onHighlight: (nodeIds: string[]) => void,
  debounceMs = 200,
): EditorGraphSyncHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const syncActive = (): void => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      onHighlight([]);
      return;
    }
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    const root = folder?.uri.fsPath ?? repoRoot;
    const rel = vscode.workspace.asRelativePath(editor.document.uri, false).replace(/\\/g, "/");
    if (rel.startsWith("..")) {
      onHighlight([]);
      return;
    }
    const line = editor.selection.active.line + 1;
    const matches = findNodesAtPosition(snapshot, rel, line);
    onHighlight(matches.map((n) => n.id));
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(syncActive, debounceMs);
  };

  const subs = [
    vscode.window.onDidChangeActiveTextEditor(schedule),
    vscode.window.onDidChangeTextEditorSelection(schedule),
  ];
  schedule();

  return {
    dispose(): void {
      if (timer) clearTimeout(timer);
      for (const s of subs) s.dispose();
    },
  };
}
