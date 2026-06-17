/**
 * Load a session summary: remote Deeplake memory table first, local disk
 * fallback second.
 *
 * Self-contained: reads credentials and queries the Deeplake HTTP endpoint
 * directly (see lib/deeplake.mjs). Mirrors the resolution order in the core
 * memory summary path. Prints a SessionSummaryResult JSON to stdout.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadCreds, query, sqlIdent, sqlStr, tableNames } from "./lib/deeplake.mjs";

const sessionId = process.argv[2];
const userArg = process.argv[3] ?? "";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}

if (!sessionId || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
  emit({ text: null, source: "invalid", message: "Invalid session id." });
  process.exit(0);
}

function localSummaryPath(userName) {
  if (!userName || userName.includes("/") || userName.includes("\\") || userName.includes("..")) {
    return null;
  }
  return join(homedir(), ".deeplake", "memory", "summaries", userName, `${sessionId}.md`);
}

function readLocal(userName) {
  const path = localSummaryPath(userName);
  if (!path || !existsSync(path)) return null;
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

async function readRemote(creds) {
  if (!creds || !creds.userName) return { text: null, unreachable: false };
  let table;
  try {
    table = sqlIdent(tableNames().memory);
  } catch {
    return { text: null, unreachable: false };
  }
  const vpath = `/summaries/${creds.userName}/${sessionId}.md`;
  try {
    const rows = await query(
      creds,
      `SELECT summary FROM "${table}" WHERE path = '${sqlStr(vpath)}' AND author = '${sqlStr(creds.userName)}' ` +
        `AND summary <> '' ORDER BY last_update_date DESC LIMIT 1`,
      4000,
    );
    if (!rows || rows.length === 0) return { text: null, unreachable: false };
    const summary = rows[0]?.summary;
    return { text: typeof summary === "string" && summary.trim() ? summary : null, unreachable: false };
  } catch {
    return { text: null, unreachable: true };
  }
}

const creds = loadCreds();
const userName = userArg || creds?.userName || "unknown";

const remote = await readRemote(creds);
if (remote.text) {
  emit({ text: remote.text, source: "remote", message: null });
  process.exit(0);
}

const local = readLocal(userName);
if (local) {
  emit({ text: local, source: "local", message: null });
  process.exit(0);
}

if (remote.unreachable) {
  emit({
    text: null,
    source: "unreachable",
    message: "Memory table unreachable. Showing no summary until connectivity returns.",
  });
  process.exit(0);
}

emit({ text: null, source: "missing", message: `No summary found for session ${sessionId}.` });
