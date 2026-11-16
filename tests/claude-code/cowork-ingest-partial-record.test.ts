import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const uploads: string[] = [];
let networkAvailable = true;

vi.mock("../../src/deeplake-api.js", () => ({
  DeeplakeApi: class {
    async query(sql: string): Promise<never[]> {
      if (!networkAvailable) throw new Error("offline");
      uploads.push(sql);
      return [];
    }
    async ensureSessionsTable(): Promise<void> {}
  },
}));

vi.mock("../../src/hooks/spawn-wiki-worker.js", () => ({
  bundleDirFromImportMeta: () => "test-bundle",
  spawnWikiWorker: vi.fn(),
}));

vi.mock("../../src/skillify/triggers.js", () => ({
  forceSessionEndTrigger: vi.fn(),
}));

const SESSION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let home: string;
let previousHome: string | undefined;

function transcriptPath(sessionId: string): string {
  const desktopDir = process.platform === "darwin"
    ? join(home, "Library", "Application Support", "Claude")
    : join(home, ".config", "Claude");
  const dir = join(desktopDir, "local-agent-mode-sessions", "run", ".claude", "projects", "proj");
  mkdirSync(dir, { recursive: true });
  return join(dir, `${sessionId}.jsonl`);
}

function record(sessionId: string, content: string): string {
  return JSON.stringify({
    type: "user",
    sessionId,
    timestamp: "2026-09-22T00:00:00.000Z",
    cwd: "/cowork",
    message: { role: "user", content },
  });
}

function queuePath(sessionId: string): string {
  return join(home, ".deeplake", "queue-cowork", `${sessionId}.jsonl`);
}

function queuedMessages(sessionId: string): string[] {
  return readFileSync(queuePath(sessionId), "utf8")
    .trim()
    .split("\n")
    .map(line => (JSON.parse(line) as { message: string }).message)
    .map(message => JSON.parse(message) as { content: string })
    .map(message => message.content);
}

async function loadIngest() {
  vi.resetModules();
  return import("../../src/mcp/cowork-ingest.js");
}

beforeEach(() => {
  previousHome = process.env.HOME;
  home = mkdtempSync(join(tmpdir(), "hivemind-cowork-partial-"));
  process.env.HOME = home;
  mkdirSync(join(home, ".deeplake"), { recursive: true });
  writeFileSync(
    join(home, ".deeplake", "credentials.json"),
    JSON.stringify({
      token: "test-token",
      orgId: "test-org",
      orgName: "test-org",
      userName: "test-user",
      workspaceId: "test-workspace",
      apiUrl: "http://127.0.0.1:1",
    }),
  );
  uploads.length = 0;
  networkAvailable = true;
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
});

describe("Cowork ingest partial transcript records", () => {
  it("holds an unparseable final record, then ingests it after split writes", async () => {
    const path = transcriptPath(SESSION_A);
    const first = record(SESSION_A, "first");
    const malformed = "{not-json}";
    const partial = record(SESSION_A, "split record");
    const splitAt = Buffer.from(partial, "utf8").indexOf(Buffer.from("split", "utf8"));
    writeFileSync(path, `${first}\n\n${malformed}\n` + Buffer.from(partial, "utf8").subarray(0, splitAt));

    const { ingestCoworkSessions } = await loadIngest();
    await ingestCoworkSessions();

    // The earlier good line was committed; the malformed newline-terminated
    // line was skipped; the unterminated tail remains in the real queue state.
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain('"content":"first"');
    const state = JSON.parse(readFileSync(join(home, ".deeplake", "cowork-ingest-state.json"), "utf8"));
    expect(state.processedLines[path]).toBe(2);
    expect(readFileSync(path, "utf8")).not.toContain("split record");

    appendFileSync(path, Buffer.from(partial, "utf8").subarray(splitAt));
    appendFileSync(path, "\r\n");
    await ingestCoworkSessions();
    await ingestCoworkSessions();

    expect(uploads).toHaveLength(2);
    expect(uploads.filter(sql => sql.includes('"content":"split record"'))).toHaveLength(1);
    expect(uploads.filter(sql => sql.includes('"content":"first"'))).toHaveLength(1);
  });

  it("waits for split UTF-8 bytes and accepts the completed CRLF record", async () => {
    const path = transcriptPath(SESSION_A);
    const full = Buffer.from(record(SESSION_A, "emoji 💾 survives") + "\r\n", "utf8");
    const emojiBytes = Buffer.from("💾", "utf8");
    const splitAt = full.indexOf(emojiBytes) + 1;
    writeFileSync(path, full.subarray(0, splitAt));

    const { ingestCoworkSessions } = await loadIngest();
    await ingestCoworkSessions();
    expect(uploads).toHaveLength(0);

    appendFileSync(path, full.subarray(splitAt));
    await ingestCoworkSessions();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain('"content":"emoji 💾 survives"');
  });

  it("keeps transcript watermarks independent and does not duplicate repeated polls", async () => {
    const pathA = transcriptPath(SESSION_A);
    const pathB = transcriptPath(SESSION_B);
    const partial = record(SESSION_A, "A partial");
    const splitAt = Buffer.byteLength(partial, "utf8") - 3;
    writeFileSync(pathA, Buffer.from(partial, "utf8").subarray(0, splitAt));
    writeFileSync(pathB, `${record(SESSION_B, "B complete")}\n`);

    const { ingestCoworkSessions } = await loadIngest();
    await ingestCoworkSessions();
    await ingestCoworkSessions();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain('"content":"B complete"');
    expect(uploads[0]).not.toContain("A partial");

    appendFileSync(pathA, Buffer.from(partial, "utf8").subarray(splitAt));
    await ingestCoworkSessions();
    await ingestCoworkSessions();

    expect(uploads).toHaveLength(2);
    expect(uploads.filter(sql => sql.includes('"content":"A partial"'))).toHaveLength(1);
    expect(uploads.filter(sql => sql.includes('"content":"B complete"'))).toHaveLength(1);
  });
});
