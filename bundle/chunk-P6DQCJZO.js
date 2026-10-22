// dist/src/docs/auto-registry.js
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function registryPath() {
  return process.env.HIVEMIND_DOCS_AUTO_FILE ?? join(homedir(), ".deeplake", "docs-auto.json");
}
function readAutoRegistry(file = registryPath()) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf-8"));
    if (!Array.isArray(raw.entries))
      return { entries: [] };
    const entries = raw.entries.filter((e) => !!e && typeof e === "object" && typeof e.orgId === "string" && typeof e.project === "string" && typeof e.path === "string" && typeof e.auto === "boolean");
    return { entries };
  } catch {
    return { entries: [] };
  }
}
function writeAutoRegistry(reg, file = registryPath()) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(reg, null, 1) + "\n");
  renameSync(tmp, file);
}
function isAutoEnabled(orgId, project, file = registryPath()) {
  return readAutoRegistry(file).entries.some((e) => e.orgId === orgId && e.project === project && e.auto);
}
function findEntry(orgId, project, file = registryPath()) {
  return readAutoRegistry(file).entries.find((e) => e.orgId === orgId && e.project === project);
}
function setAuto(entry, file = registryPath(), now = () => /* @__PURE__ */ new Date()) {
  const reg = readAutoRegistry(file);
  const existing = reg.entries.find((e) => e.orgId === entry.orgId && e.project === entry.project);
  const next = {
    orgId: entry.orgId,
    orgName: entry.orgName ?? existing?.orgName,
    project: entry.project,
    path: entry.path,
    auto: entry.auto,
    enabledAt: entry.auto && !existing?.auto ? now().toISOString() : existing?.enabledAt ?? now().toISOString()
  };
  reg.entries = [...reg.entries.filter((e) => !(e.orgId === entry.orgId && e.project === entry.project)), next];
  writeAutoRegistry(reg, file);
  return next;
}
function listEntries(file = registryPath()) {
  return [...readAutoRegistry(file).entries].sort((a, b) => a.path.localeCompare(b.path));
}

export {
  registryPath,
  readAutoRegistry,
  isAutoEnabled,
  findEntry,
  setAuto,
  listEntries
};
