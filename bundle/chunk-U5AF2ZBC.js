import {
  deriveProjectKey
} from "./chunk-YUE5VGV2.js";

// dist/src/graph/load-current.js
import { createHash as createHash2 } from "node:crypto";
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
import { join as join4 } from "node:path";

// dist/src/graph/last-build.js
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
function lastBuildPath(baseDir, worktreeId) {
  if (worktreeId !== void 0) {
    return join(baseDir, "worktrees", worktreeId, ".last-build.json");
  }
  return join(baseDir, ".last-build.json");
}
function writeLastBuild(baseDir, state, worktreeId) {
  const path = lastBuildPath(baseDir, worktreeId);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, path);
  } catch {
  }
}
function readLastBuild(baseDir, worktreeId) {
  let path = lastBuildPath(baseDir, worktreeId);
  if (!existsSync(path)) {
    if (worktreeId === void 0)
      return null;
    const legacy = lastBuildPath(baseDir, void 0);
    if (!existsSync(legacy))
      return null;
    path = legacy;
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object")
    return null;
  const o = parsed;
  if (typeof o.ts !== "number" || !Number.isFinite(o.ts))
    return null;
  if (o.commit_sha !== null && typeof o.commit_sha !== "string")
    return null;
  if (typeof o.snapshot_sha256 !== "string")
    return null;
  const out = { ts: o.ts, commit_sha: o.commit_sha, snapshot_sha256: o.snapshot_sha256 };
  if (typeof o.node_count === "number" && Number.isFinite(o.node_count) && o.node_count >= 0) {
    out.node_count = o.node_count;
  }
  if (typeof o.edge_count === "number" && Number.isFinite(o.edge_count) && o.edge_count >= 0) {
    out.edge_count = o.edge_count;
  }
  return out;
}

// dist/src/graph/snapshot.js
import { createHash } from "node:crypto";
import { mkdirSync as mkdirSync3, renameSync as renameSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { dirname as dirname3, join as join3 } from "node:path";

// dist/src/graph/history.js
import { appendFileSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { dirname as dirname2, join as join2 } from "node:path";
function historyPath(baseDir) {
  return join2(baseDir, "history.jsonl");
}
function appendHistoryEntry(baseDir, entry) {
  const path = historyPath(baseDir);
  try {
    mkdirSync2(dirname2(path), { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + "\n");
  } catch {
  }
}
function entryFromSnapshot(snapshot, snapshot_sha256, trigger) {
  return {
    ts: snapshot.observation.ts,
    commit_sha: snapshot.graph.commit_sha,
    snapshot_sha256,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.links.length,
    trigger
  };
}
function readHistoryTail(baseDir, n) {
  const path = historyPath(baseDir);
  if (!existsSync2(path))
    return [];
  let raw;
  try {
    raw = readFileSync2(path, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter((l) => l.length > 0);
  const entries = [];
  for (let i = lines.length - 1; i >= 0 && entries.length < n; i--) {
    const parsed = parseLine(lines[i]);
    if (parsed !== null)
      entries.unshift(parsed);
  }
  return entries;
}
function countHistoryEntries(baseDir) {
  const path = historyPath(baseDir);
  if (!existsSync2(path))
    return 0;
  try {
    const raw = readFileSync2(path, "utf8");
    return raw.split("\n").filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}
function parseLine(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object")
    return null;
  const o = obj;
  if (typeof o.ts !== "string")
    return null;
  if (o.commit_sha !== null && typeof o.commit_sha !== "string")
    return null;
  if (typeof o.snapshot_sha256 !== "string")
    return null;
  if (typeof o.node_count !== "number")
    return null;
  if (typeof o.edge_count !== "number")
    return null;
  if (typeof o.trigger !== "string")
    return null;
  return {
    ts: o.ts,
    commit_sha: o.commit_sha,
    snapshot_sha256: o.snapshot_sha256,
    node_count: o.node_count,
    edge_count: o.edge_count,
    trigger: o.trigger
  };
}

// dist/src/graph/resolve/cross-file.js
import { posix } from "node:path";
var EXPORTABLE_KINDS = /* @__PURE__ */ new Set([
  "function",
  "class",
  "const",
  "interface",
  "type_alias",
  "enum"
]);
var HERITAGE_KINDS = /* @__PURE__ */ new Set([
  "class",
  "interface",
  "type_alias",
  "enum"
]);
function buildExportIndex(nodes) {
  const idx = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (!n.exported || !EXPORTABLE_KINDS.has(n.kind))
      continue;
    let m = idx.get(n.source_file);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      idx.set(n.source_file, m);
    }
    if (!m.has(n.label))
      m.set(n.label, n.id);
  }
  return idx;
}
function resolveCrossFileCalls(extractions, nodes) {
  const knownFiles = /* @__PURE__ */ new Set();
  for (const ex of extractions)
    knownFiles.add(ex.source_file);
  const exportIndex = buildExportIndex(nodes);
  const edges = [];
  const seen = /* @__PURE__ */ new Set();
  for (const ex of extractions) {
    const rawCalls = ex.raw_calls ?? [];
    const bindings = ex.import_bindings ?? [];
    if (rawCalls.length === 0 || bindings.length === 0)
      continue;
    const byLocal = /* @__PURE__ */ new Map();
    for (const b of bindings) {
      if (!byLocal.has(b.local_name))
        byLocal.set(b.local_name, b);
    }
    for (const rc of rawCalls) {
      const target = resolveOne(rc, byLocal, ex.source_file, knownFiles, exportIndex);
      if (target === null)
        continue;
      const key = `${rc.caller_id}\0${target}`;
      if (seen.has(key))
        continue;
      seen.add(key);
      edges.push({
        source: rc.caller_id,
        target,
        relation: "calls",
        confidence: "EXTRACTED"
      });
    }
  }
  return edges;
}
function resolveOne(rc, byLocal, fromFile, knownFiles, exportIndex) {
  let binding;
  let exportName;
  if (rc.receiver !== void 0) {
    binding = byLocal.get(rc.receiver);
    if (binding === void 0 || binding.kind !== "namespace")
      return null;
    if (binding.type_only)
      return null;
    exportName = rc.callee_name;
  } else {
    binding = byLocal.get(rc.callee_name);
    if (binding === void 0)
      return null;
    if (binding.type_only)
      return null;
    if (binding.kind !== "named")
      return null;
    exportName = binding.imported_name;
  }
  const targetFile = resolveModule(fromFile, binding.specifier, knownFiles);
  if (targetFile === null)
    return null;
  return exportIndex.get(targetFile)?.get(exportName) ?? null;
}
var MODULE_SUFFIX = "::module";
var EXTERNAL_PREFIX = "external:";
function repointImportEdges(links, knownFiles) {
  return links.map((e) => {
    if (e.relation !== "imports" || !e.target.startsWith(EXTERNAL_PREFIX))
      return e;
    if (!e.source.endsWith(MODULE_SUFFIX))
      return e;
    const fromFile = e.source.slice(0, -MODULE_SUFFIX.length);
    const specifier = e.target.slice(EXTERNAL_PREFIX.length);
    const resolved = resolveModule(fromFile, specifier, knownFiles);
    if (resolved === null)
      return e;
    return { ...e, target: `${resolved}${MODULE_SUFFIX}` };
  });
}
var UNRESOLVED_PREFIX = "unresolved:";
function resolveHeritageEdges(links, extractions, nodes) {
  const knownFiles = /* @__PURE__ */ new Set();
  for (const ex of extractions)
    knownFiles.add(ex.source_file);
  const exportIndex = buildExportIndex(nodes);
  const localIndex = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    if (!HERITAGE_KINDS.has(n.kind))
      continue;
    let m = localIndex.get(n.source_file);
    if (!m) {
      m = /* @__PURE__ */ new Map();
      localIndex.set(n.source_file, m);
    }
    if (!m.has(n.label))
      m.set(n.label, n.id);
  }
  const bindingsByFile = /* @__PURE__ */ new Map();
  for (const ex of extractions) {
    const m = /* @__PURE__ */ new Map();
    for (const b of ex.import_bindings ?? [])
      if (!m.has(b.local_name))
        m.set(b.local_name, b);
    bindingsByFile.set(ex.source_file, m);
  }
  return links.map((e) => {
    if (e.relation !== "extends" && e.relation !== "implements")
      return e;
    if (!e.target.startsWith(UNRESOLVED_PREFIX))
      return e;
    const parsed = parseUnresolved(e.target);
    if (parsed === null)
      return e;
    const { file, name } = parsed;
    const local = localIndex.get(file)?.get(name);
    if (local !== void 0)
      return { ...e, target: local };
    const binding = bindingsByFile.get(file)?.get(name);
    if (binding !== void 0 && binding.kind === "named") {
      const targetFile = resolveModule(file, binding.specifier, knownFiles);
      if (targetFile !== null) {
        const id = exportIndex.get(targetFile)?.get(binding.imported_name);
        if (id !== void 0)
          return { ...e, target: id };
      }
    }
    return e;
  });
}
function parseUnresolved(target) {
  const body = target.slice(UNRESOLVED_PREFIX.length);
  const lastColon = body.lastIndexOf(":");
  if (lastColon <= 0)
    return null;
  const rest = body.slice(0, lastColon);
  const nameColon = rest.lastIndexOf(":");
  if (nameColon <= 0)
    return null;
  const file = rest.slice(0, nameColon);
  const name = rest.slice(nameColon + 1);
  if (file.length === 0 || name.length === 0)
    return null;
  return { file, name };
}
function resolveModule(fromFile, specifier, knownFiles) {
  if (isPythonFile(fromFile))
    return resolvePythonModule(fromFile, specifier, knownFiles);
  if (!specifier.startsWith("./") && !specifier.startsWith("../"))
    return null;
  const baseDir = posix.dirname(fromFile);
  const explicit = specifier.match(/\.(tsx?|jsx?|mjs|cjs)$/)?.[0] ?? null;
  const stem = explicit ? specifier.slice(0, -explicit.length) : specifier;
  const joined = posix.normalize(posix.join(baseDir, stem));
  const TS_EXTS = [".ts", ".tsx"];
  const JS_EXTS = [".js", ".jsx", ".mjs", ".cjs"];
  const importerIsJs = /\.(jsx?|mjs|cjs)$/.test(fromFile);
  const primary = importerIsJs ? JS_EXTS : TS_EXTS;
  const secondary = importerIsJs ? TS_EXTS : JS_EXTS;
  const exts = [
    ...explicit ? [explicit] : [],
    ...primary,
    ...secondary
  ].filter((e, i, a) => a.indexOf(e) === i);
  for (const e of exts) {
    const c = `${joined}${e}`;
    if (knownFiles.has(c))
      return c;
  }
  for (const e of exts) {
    const c = `${joined}/index${e}`;
    if (knownFiles.has(c))
      return c;
  }
  return null;
}
var PY_EXTS = [".py", ".pyi"];
function isPythonFile(p) {
  return p.endsWith(".py") || p.endsWith(".pyi");
}
function resolvePythonModule(fromFile, specifier, knownFiles) {
  let dots = 0;
  while (dots < specifier.length && specifier[dots] === ".")
    dots++;
  const tail = specifier.slice(dots);
  const segs = tail.length > 0 ? tail.split(".") : [];
  if (dots === 0) {
    if (segs.length === 0)
      return null;
    return matchPythonSuffix(segs.join("/"), knownFiles);
  }
  let dir = posix.dirname(fromFile);
  let climbed = 1;
  for (; climbed < dots && dir !== "" && dir !== "."; climbed++)
    dir = posix.dirname(dir);
  if (climbed < dots)
    return null;
  const base = segs.length > 0 ? posix.normalize(posix.join(dir, ...segs)) : dir;
  for (const e of PY_EXTS)
    if (knownFiles.has(`${base}${e}`))
      return `${base}${e}`;
  for (const e of PY_EXTS)
    if (knownFiles.has(`${base}/__init__${e}`))
      return `${base}/__init__${e}`;
  return null;
}
function matchPythonSuffix(suffix, knownFiles) {
  const targets = [
    ...PY_EXTS.map((e) => `${suffix}${e}`),
    ...PY_EXTS.map((e) => `${suffix}/__init__${e}`)
  ];
  for (const t of targets) {
    if (knownFiles.has(t))
      return t;
    let hit = null;
    let count = 0;
    for (const f of knownFiles) {
      if (f.endsWith(`/${t}`)) {
        hit = f;
        count++;
      }
    }
    if (count === 1)
      return hit;
    if (count > 1)
      return null;
  }
  return null;
}

// dist/src/graph/node-metadata.js
function annotateNodeDegrees(nodes, links) {
  const inDeg = /* @__PURE__ */ new Map();
  const outDeg = /* @__PURE__ */ new Map();
  for (const e of links) {
    outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  for (const n of nodes) {
    const fi = inDeg.get(n.id) ?? 0;
    const fo = outDeg.get(n.id) ?? 0;
    n.fan_in = fi;
    n.fan_out = fo;
    n.is_entrypoint = n.exported && fi === 0;
  }
}

// dist/src/graph/snapshot.js
function graphsRoot() {
  return process.env.HIVEMIND_GRAPHS_HOME ?? join3(homedir(), ".hivemind", "graphs");
}
function repoDir(repoKey) {
  return join3(graphsRoot(), repoKey);
}
function buildSnapshot(extractions, metadata, observation) {
  const nodes = [];
  const links = [];
  for (const ex of extractions) {
    for (const n of ex.nodes)
      nodes.push(n);
    for (const e of ex.edges)
      links.push(e);
  }
  for (const e of resolveCrossFileCalls(extractions, nodes))
    links.push(e);
  const knownFiles = /* @__PURE__ */ new Set();
  for (const ex of extractions)
    knownFiles.add(ex.source_file);
  let resolvedLinks = repointImportEdges(links, knownFiles);
  resolvedLinks = resolveHeritageEdges(resolvedLinks, extractions, nodes);
  annotateNodeDegrees(nodes, resolvedLinks);
  nodes.sort(compareNodes);
  resolvedLinks.sort(compareEdges);
  return {
    directed: true,
    multigraph: true,
    graph: metadata,
    observation,
    nodes,
    links: resolvedLinks
  };
}
function compareNodes(a, b) {
  return cmp(a.id, b.id);
}
function compareEdges(a, b) {
  let c = cmp(a.source, b.source);
  if (c !== 0)
    return c;
  c = cmp(a.target, b.target);
  if (c !== 0)
    return c;
  c = cmp(a.relation, b.relation);
  if (c !== 0)
    return c;
  return (a.ord ?? 0) - (b.ord ?? 0);
}
function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function canonicalSnapshot(snapshot) {
  return canonicalJSON(snapshot);
}
function computeSnapshotSha256(snapshot) {
  const stable = {
    directed: snapshot.directed,
    multigraph: snapshot.multigraph,
    graph: snapshot.graph,
    nodes: snapshot.nodes,
    links: snapshot.links
  };
  return createHash("sha256").update(canonicalJSON(stable)).digest("hex");
}
function canonicalJSON(value) {
  return JSON.stringify(value, (_key, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const sorted = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = v[k];
      }
      return sorted;
    }
    return v;
  });
}
function writeSnapshot(snapshot, baseDir, trigger = "unknown", worktreeId) {
  const sha256 = computeSnapshotSha256(snapshot);
  const commitSha = snapshot.graph.commit_sha;
  const fileBase = commitSha ?? sha256;
  const snapshotsDir = join3(baseDir, "snapshots");
  const snapshotPath = join3(snapshotsDir, `${fileBase}.json`);
  const canonical = canonicalSnapshot(snapshot);
  writeFileAtomic(snapshotPath, canonical);
  const worktreeRoot = worktreeId !== void 0 ? join3(baseDir, "worktrees", worktreeId) : baseDir;
  let latestCommitPath = null;
  if (commitSha !== null) {
    latestCommitPath = join3(worktreeRoot, "latest-commit.txt");
    writeFileAtomic(latestCommitPath, `${commitSha}
`);
  }
  writeLastBuild(baseDir, {
    ts: Date.now(),
    commit_sha: commitSha,
    snapshot_sha256: sha256,
    node_count: snapshot.nodes.length,
    edge_count: snapshot.links.length
  }, worktreeId);
  appendHistoryEntry(baseDir, entryFromSnapshot(snapshot, sha256, trigger));
  return { snapshotPath, latestCommitPath, snapshotSha256: sha256 };
}
function writeFileAtomic(filePath, contents) {
  mkdirSync3(dirname3(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync2(tmp, contents);
  renameSync2(tmp, filePath);
}

// dist/src/graph/load-current.js
function workTreeIdFor(cwd) {
  return createHash2("sha256").update(cwd).digest("hex").slice(0, 16);
}
function loadCurrentSnapshot(cwd) {
  let baseDir;
  try {
    baseDir = repoDir(deriveProjectKey(cwd).key);
  } catch {
    return null;
  }
  const last = readLastBuild(baseDir, workTreeIdFor(cwd));
  if (last === null)
    return null;
  const fileBase = last.commit_sha ?? last.snapshot_sha256;
  const snapPath = join4(baseDir, "snapshots", `${fileBase}.json`);
  if (!existsSync3(snapPath))
    return null;
  try {
    const snap = JSON.parse(readFileSync3(snapPath, "utf8"));
    if (!Array.isArray(snap.nodes) || !Array.isArray(snap.links))
      return null;
    return snap;
  } catch {
    return null;
  }
}

export {
  appendHistoryEntry,
  readHistoryTail,
  countHistoryEntries,
  writeLastBuild,
  readLastBuild,
  repoDir,
  buildSnapshot,
  computeSnapshotSha256,
  writeSnapshot,
  workTreeIdFor,
  loadCurrentSnapshot
};
