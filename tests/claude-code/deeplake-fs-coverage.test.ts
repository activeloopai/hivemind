import { describe, it, expect, vi, afterEach } from "vitest";

// The graph VFS bridge delegates to handleGraphVfs(), which in real life
// reads a per-cwd snapshot off disk. Mock it so the /graph/* branches in
// deeplake-fs (readFile / exists / stat / realpath / readdir*) are driven
// deterministically instead of depending on whether a snapshot happens to
// exist for the test runner's cwd.
let graphResult: { kind: string; body?: string; message?: string } = { kind: "ok", body: "GRAPH BODY" };
vi.mock("../../src/graph/vfs-handler.js", () => ({
  handleGraphVfs: () => graphResult,
}));

import { DeeplakeFs } from "../../src/shell/deeplake-fs.js";
import {
  _setEnabledReaderForTesting,
  _resetForTesting,
} from "../../src/embeddings/disable.js";

afterEach(() => {
  graphResult = { kind: "ok", body: "GRAPH BODY" };
  _resetForTesting();
});

// ── Mock clients ──────────────────────────────────────────────────────────────

interface GoalRow { id?: string; goal_id: string; owner: string; status: string; content: string; created_at?: string }

/** Stateful client backing the goals structured table plus a generic
 *  memory table. Maintains in-memory arrays so UPDATE-vs-INSERT, bootstrap,
 *  rm soft-close and mv status-transition all exercise real SQL shapes. */
function makeGoalClient(init: { goals?: GoalRow[]; memory?: string[] } = {}) {
  const goals: GoalRow[] = (init.goals ?? []).map(g => ({ id: g.id ?? `seed-${g.goal_id}`, ...g }));
  const memory = [...(init.memory ?? [])];

  const client = {
    applyStorageCreds: vi.fn().mockResolvedValue(undefined),
    ensureTable: vi.fn().mockResolvedValue(undefined),
    ensureGoalsTable: vi.fn().mockResolvedValue(undefined),
    listTables: vi.fn().mockResolvedValue(["memory", "goals"]),
    query: vi.fn(async (sql: string) => {
      // ── bootstrap ──
      if (sql.includes("SELECT path, size_bytes, mime_type")) {
        return memory.map(p => ({ path: p, size_bytes: 1, mime_type: "text/markdown" }));
      }
      if (sql.includes("SELECT goal_id, owner, status, content, created_at")) {
        return goals.map(g => ({ goal_id: g.goal_id, owner: g.owner, status: g.status, content: g.content, created_at: g.created_at ?? "2026-01-01" }));
      }
      // ── goal upsert ──
      if (sql.startsWith("SELECT id") && sql.includes('"goals"')) {
        const gid = sql.match(/goal_id = '([^']+)'/)?.[1];
        return goals.filter(g => g.goal_id === gid).map(g => ({ id: g.id }));
      }
      if (sql.startsWith("UPDATE") && sql.includes('"goals"')) {
        const gid = sql.match(/WHERE goal_id = '([^']+)'/)?.[1];
        const row = goals.find(g => g.goal_id === gid);
        if (row) {
          row.owner = sql.match(/owner = '([^']*)'/)?.[1] ?? row.owner;
          row.status = sql.match(/status = '([^']*)'/)?.[1] ?? row.status;
          row.content = (sql.match(/content = E'((?:[^']|'')*)'/)?.[1] ?? row.content).replace(/''/g, "'");
        }
        return [];
      }
      if (sql.startsWith("INSERT") && sql.includes('"goals"')) {
        const m = sql.match(/VALUES \(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*E'((?:[^']|'')*)'/);
        if (m) goals.push({ id: m[1], goal_id: m[2], owner: m[3], status: m[4], content: m[5].replace(/''/g, "'") });
        return [];
      }
      return [];
    }),
    _goals: goals,
  };
  return client;
}

async function makeGoalFs(init: { goals?: GoalRow[]; memory?: string[] } = {}) {
  const client = makeGoalClient(init);
  const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions", {
    goalsTable: "goals",
  });
  return { fs, client };
}

/** Client backing the sessions table (multi-row-per-path) plus a memory table. */
function makeSessionClient(sessions: Record<string, { message: string; creation_date: string }[]>, summaries: string[] = []) {
  return {
    applyStorageCreds: vi.fn().mockResolvedValue(undefined),
    ensureTable: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT path, size_bytes, mime_type")) {
        return summaries.map(p => ({ path: p, size_bytes: 10, mime_type: "text/markdown" }));
      }
      if (sql.includes("SELECT path, MAX(size_bytes) as total_size")) {
        return Object.entries(sessions).map(([path, rows]) => ({ path, total_size: Math.max(...rows.map(r => r.message.length)) }));
      }
      // virtual-index summaries section
      if (sql.includes("SELECT path, project, description")) {
        return summaries.filter(p => p.startsWith("/summaries/")).map(p => ({ path: p, project: "p", description: "d", creation_date: "2026-01-01", last_update_date: "2026-01-02" }));
      }
      // virtual-index sessions section
      if (sql.includes("MAX(description) AS description")) {
        return Object.keys(sessions).filter(p => p.startsWith("/sessions/")).map(p => ({ path: p, description: "sess", creation_date: "2026-01-01", last_update_date: "2026-01-02" }));
      }
      // session read (single-path concat)
      if (sql.includes("SELECT message FROM") && sql.includes("WHERE path = '")) {
        const p = sql.match(/WHERE path = '([^']+)'/)?.[1] ?? "";
        return (sessions[p] ?? []).map(r => ({ message: r.message }));
      }
      return [];
    }),
  };
}

// ── fileCount ───────────────────────────────────────────────────────────────
describe("fileCount", () => {
  it("reports the number of bootstrapped files", async () => {
    const { fs } = await makeGoalFs({ memory: ["/notes/a.md", "/notes/b.md"] });
    expect(fs.fileCount).toBe(2);
  });
});

// ── Graph VFS bridge ──────────────────────────────────────────────────────────
describe("graph VFS bridge", () => {
  async function graphFs() {
    const { fs } = await makeGoalFs({});
    return fs;
  }

  it("reads a synthesized graph file (ok)", async () => {
    graphResult = { kind: "ok", body: "GRAPH BODY" };
    const fs = await graphFs();
    expect(await fs.readFile("/graph/index.md")).toBe("GRAPH BODY");
  });

  it("renders no-graph as file body, not ENOENT", async () => {
    graphResult = { kind: "no-graph", message: "no snapshot" };
    const fs = await graphFs();
    expect(await fs.readFile("/graph/find/foo")).toBe("(no-graph) no snapshot");
  });

  it("throws ENOENT when the dispatcher reports not-found", async () => {
    graphResult = { kind: "not-found", message: "nope" };
    const fs = await graphFs();
    await expect(fs.readFile("/graph/show/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("throws EISDIR when reading a graph directory", async () => {
    const fs = await graphFs();
    await expect(fs.readFile("/graph")).rejects.toMatchObject({ code: "EISDIR" });
    await expect(fs.readFile("/graph/find")).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("exists(): dirs always true, leaf depends on dispatcher", async () => {
    const fs = await graphFs();
    expect(await fs.exists("/graph")).toBe(true);
    expect(await fs.exists("/graph/find")).toBe(true);
    graphResult = { kind: "ok", body: "x" };
    expect(await fs.exists("/graph/find/foo")).toBe(true);
    graphResult = { kind: "no-graph", message: "m" };
    expect(await fs.exists("/graph/find/foo")).toBe(true);
    graphResult = { kind: "not-found", message: "m" };
    expect(await fs.exists("/graph/find/foo")).toBe(false);
  });

  it("stat(): dir → directory, leaf ok → file, not-found → ENOENT", async () => {
    const fs = await graphFs();
    const dir = await fs.stat("/graph");
    expect(dir.isDirectory).toBe(true);
    expect(dir.isFile).toBe(false);
    graphResult = { kind: "ok", body: "x" };
    const leaf = await fs.stat("/graph/show/key");
    expect(leaf.isFile).toBe(true);
    expect(leaf.isDirectory).toBe(false);
    graphResult = { kind: "not-found", message: "m" };
    await expect(fs.stat("/graph/show/key")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("realpath(): dir/ok → path, not-found → ENOENT", async () => {
    const fs = await graphFs();
    expect(await fs.realpath("/graph")).toBe("/graph");
    graphResult = { kind: "ok", body: "x" };
    expect(await fs.realpath("/graph/find/foo")).toBe("/graph/find/foo");
    graphResult = { kind: "no-graph", message: "m" };
    expect(await fs.realpath("/graph/find/foo")).toBe("/graph/find/foo");
    graphResult = { kind: "not-found", message: "m" };
    await expect(fs.realpath("/graph/find/foo")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("readdir(): graph root + placeholder dirs", async () => {
    const fs = await graphFs();
    expect(await fs.readdir("/graph")).toEqual(["index.md", "find", "show"]);
    expect(await fs.readdir("/graph/find")).toEqual([]);
    expect(await fs.readdir("/graph/show")).toEqual([]);
  });

  it("readdirWithFileTypes classifies graph children by taxonomy", async () => {
    const fs = await graphFs();
    const entries = await fs.readdirWithFileTypes("/graph");
    const find = entries.find(e => e.name === "find")!;
    const index = entries.find(e => e.name === "index.md")!;
    expect(find.isDirectory).toBe(true);
    expect(index.isFile).toBe(true);
  });
});

// ── Goals bootstrap ─────────────────────────────────────────────────────────
describe("goals bootstrap", () => {
  it("synthesizes VFS paths and skips malformed/invalid-status rows", async () => {
    const { fs } = await makeGoalFs({
      goals: [
        { goal_id: "g1", owner: "alice", status: "opened", content: "real" },
        { goal_id: "", owner: "alice", status: "opened", content: "no-id" },     // skip (299)
        { goal_id: "g3", owner: "alice", status: "bogus", content: "bad-status" }, // skip (300)
      ],
    });
    const opened = await fs.readdir("/goal/alice/opened");
    expect(opened).toEqual(["g1.md"]);
    expect(await fs.readFile("/goal/alice/opened/g1.md")).toBe("real");
  });
});

// ── Bootstrap null-coalescing (defensive ?? "" paths) ────────────────────────
describe("goals bootstrap with null columns", () => {
  function rawClient(goalRows: Record<string, unknown>[]) {
    return {
      applyStorageCreds: vi.fn().mockResolvedValue(undefined),
      ensureTable: vi.fn().mockResolvedValue(undefined),
      ensureGoalsTable: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT goal_id, owner, status, content, created_at")) return goalRows;
        return [];
      }),
    };
  }

  it("coalesces null goal columns and keeps only well-formed rows", async () => {
    const client = rawClient([
      { goal_id: null, owner: null, status: null, content: null },             // every field null → skipped
      { goal_id: "g1", owner: "alice", status: "opened", content: null },      // valid path, null content → ""
    ]);
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions", {
      goalsTable: "goals",
    });
    expect(await fs.readdir("/goal/alice/opened")).toEqual(["g1.md"]);
    expect(await fs.readFile("/goal/alice/opened/g1.md")).toBe("");
  });
});

// ── Goal write routing (upsertRow → upsertGoalRow) ───────────────────────────
describe("goal write routing", () => {
  it("INSERTs a new goal into the goals table on flush", async () => {
    const { fs, client } = await makeGoalFs({});
    await fs.writeFile("/goal/alice/opened/new.md", "fresh goal");
    await fs.flush();
    expect(client._goals).toContainEqual(expect.objectContaining({
      goal_id: "new", owner: "alice", status: "opened", content: "fresh goal",
    }));
    const inserts = (client.query.mock.calls as [string][]).filter(c => c[0].startsWith("INSERT") && c[0].includes('"goals"'));
    expect(inserts.length).toBe(1);
  });

  it("UPDATEs an existing goal row in place", async () => {
    const { fs, client } = await makeGoalFs({
      goals: [{ goal_id: "g1", owner: "alice", status: "opened", content: "v0" }],
    });
    await fs.writeFile("/goal/alice/opened/g1.md", "v1");
    await fs.flush();
    expect(client._goals.find(g => g.goal_id === "g1")!.content).toBe("v1");
    const updates = (client.query.mock.calls as [string][]).filter(c => c[0].startsWith("UPDATE") && c[0].includes('"goals"'));
    expect(updates.length).toBe(1);
  });
});

// ── rm goal soft-close ────────────────────────────────────────────────────────
describe("rm goal soft-close", () => {
  it("moves an opened goal to closed/ instead of deleting", async () => {
    const { fs, client } = await makeGoalFs({
      goals: [{ goal_id: "g1", owner: "alice", status: "opened", content: "body" }],
    });
    await fs.rm("/goal/alice/opened/g1.md");
    expect(await fs.readdir("/goal/alice/opened")).not.toContain("g1.md");
    expect(await fs.readdir("/goal/alice/closed")).toContain("g1.md");
    expect(client._goals.find(g => g.goal_id === "g1")!.status).toBe("closed");
  });

  it("rm on an already-closed goal is a no-op (preserves audit trail)", async () => {
    const { fs, client } = await makeGoalFs({
      goals: [{ goal_id: "g2", owner: "bob", status: "closed", content: "done" }],
    });
    await fs.rm("/goal/bob/closed/g2.md");
    // Cache entry removed, but no DELETE issued against the goals table.
    expect(await fs.exists("/goal/bob/closed/g2.md")).toBe(false);
    const deletes = (client.query.mock.calls as [string][]).filter(c => c[0].startsWith("DELETE"));
    expect(deletes.length).toBe(0);
  });
});

// ── mv goal status transition ────────────────────────────────────────────────
describe("mv goal status transition", () => {
  it("moves a goal between status folders via a single upsert", async () => {
    const { fs, client } = await makeGoalFs({
      goals: [{ goal_id: "g1", owner: "alice", status: "opened", content: "body" }],
    });
    await fs.mv("/goal/alice/opened/g1.md", "/goal/alice/in_progress/g1.md");
    expect(await fs.readdir("/goal/alice/opened")).not.toContain("g1.md");
    expect(await fs.readdir("/goal/alice/in_progress")).toContain("g1.md");
    expect(client._goals.find(g => g.goal_id === "g1")!.status).toBe("in_progress");
  });

  it("rejects renaming the goal_id or owner via mv", async () => {
    const { fs } = await makeGoalFs({
      goals: [{ goal_id: "g1", owner: "alice", status: "opened", content: "body" }],
    });
    await expect(fs.mv("/goal/alice/opened/g1.md", "/goal/alice/opened/g2.md"))
      .rejects.toMatchObject({ code: "EPERM" });
    await expect(fs.mv("/goal/alice/opened/g1.md", "/goal/bob/opened/g1.md"))
      .rejects.toMatchObject({ code: "EPERM" });
  });

  it("throws ENOENT when the source goal is missing", async () => {
    const { fs } = await makeGoalFs({});
    await expect(fs.mv("/goal/alice/opened/ghost.md", "/goal/alice/closed/ghost.md"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });
});

// ── flush failure re-queue ────────────────────────────────────────────────────
describe("flush re-queue on failure", () => {
  it("re-queues a rejected row and throws", async () => {
    const { fs, client } = await makeGoalFs({});
    // Fail the INSERT for the memory row.
    client.query.mockImplementationOnce(async () => { throw new Error("backend down"); });
    await fs.writeFile("/notes/x.md", "data");
    // The rejected row is re-queued for a later flush; the flush itself reports
    // the failure so the caller knows the write did not land.
    await expect(fs.flush()).rejects.toThrow(/writes failed and were re-queued/);
  });
});

// ── embeddings-disabled flush path ────────────────────────────────────────────
describe("flush with embeddings disabled", () => {
  it("writes NULL embeddings without hitting the daemon", async () => {
    _setEnabledReaderForTesting(() => false);
    const { fs, client } = await makeGoalFs({});
    await fs.writeFile("/notes/n.md", "no-embed");
    await fs.flush();
    const inserts = (client.query.mock.calls as [string][]).filter(c => c[0].startsWith("INSERT"));
    expect(inserts.length).toBe(1);
    expect(inserts[0][0]).toContain("NULL");
  });
});

// ── virtual index with sessions section ────────────────────────────────────────
describe("virtual index — sessions section", () => {
  it("includes both memory summaries and sessions rows", async () => {
    const client = makeSessionClient(
      { "/sessions/alice/s1.json": [{ message: "{}", creation_date: "2026-01-01" }] },
      ["/summaries/alice/sum1.md"],
    );
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    const idx = await fs.readFile("/index.md");
    expect(idx).toContain("## memory");
    expect(idx).toContain("## sessions");
    expect(idx).toContain("sum1");
    expect(idx).toContain("s1");
  });

  it("degrades to memory-only when the sessions query throws", async () => {
    const client = makeSessionClient({}, ["/summaries/alice/sum1.md"]);
    // Make the sessions-section query throw, leaving memory intact.
    const real = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("MAX(description) AS description")) throw new Error("no sessions table");
      return real(sql);
    });
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    const idx = await fs.readFile("/index.md");
    expect(idx).toContain("## memory");
    expect(idx).toContain("sum1");
  });
});

// ── session reads (concatenation) ──────────────────────────────────────────────
describe("session-backed reads", () => {
  it("readFile concatenates session rows ordered by creation_date", async () => {
    const client = makeSessionClient({
      "/sessions/alice/a.json": [
        { message: '{"type":"user_message","content":"hello"}', creation_date: "2026-01-01T00:00:00Z" },
        { message: '{"type":"assistant_message","content":"hi"}', creation_date: "2026-01-01T00:00:01Z" },
      ],
    });
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    expect(await fs.readFile("/sessions/alice/a.json")).toBe("[user] hello\n[assistant] hi");
  });

  it("readFileBuffer concatenates session rows", async () => {
    const client = makeSessionClient({
      "/sessions/alice/b.json": [{ message: '{"type":"user_message","content":"bye"}', creation_date: "2026-01-01T00:00:00Z" }],
    });
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    const buf = await fs.readFileBuffer("/sessions/alice/b.json");
    expect(Buffer.from(buf).toString("utf-8")).toBe("[user] bye");
  });

  it("readFile throws ENOENT when a session path has no rows", async () => {
    const client = makeSessionClient({ "/sessions/alice/c.json": [] });
    // The bootstrap surfaces the path (MAX size query), but the concat read returns nothing.
    (client.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT path, MAX(size_bytes) as total_size")) {
        return [{ path: "/sessions/alice/c.json", total_size: 5 }];
      }
      return [];
    });
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    await expect(fs.readFile("/sessions/alice/c.json")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("write/mv/rm to a session path is rejected (read-only)", async () => {
    const client = makeSessionClient({ "/sessions/alice/a.json": [{ message: "{}", creation_date: "2026-01-01" }] });
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    await expect(fs.writeFile("/sessions/alice/a.json", "x")).rejects.toMatchObject({ code: "EPERM" });
    await expect(fs.appendFile("/sessions/alice/a.json", "x")).rejects.toMatchObject({ code: "EPERM" });
    await expect(fs.writeFileWithMeta("/sessions/alice/a.json", "x", {})).rejects.toMatchObject({ code: "EPERM" });
  });
});

// ── readFile / readFileBuffer remaining branches ──────────────────────────────
describe("read branches", () => {
  it("readFileBuffer throws EISDIR on a directory", async () => {
    const { fs } = await makeGoalFs({ memory: ["/notes/sub/x.md"] });
    await expect(fs.readFileBuffer("/notes/sub")).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("readFileBuffer returns cached buffer after a write", async () => {
    const { fs } = await makeGoalFs({});
    await fs.writeFile("/notes/c.md", "cached");
    const buf = await fs.readFileBuffer("/notes/c.md");
    expect(Buffer.from(buf).toString("utf-8")).toBe("cached");
  });

  it("readFileBuffer throws ENOENT when the SQL row is absent", async () => {
    const { fs, client } = await makeGoalFs({ memory: ["/notes/gone.md"] });
    // The bootstrap registered the path (files map → null) but the summary read returns nothing.
    client.query.mockImplementation(async () => []);
    await expect(fs.readFileBuffer("/notes/gone.md")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("readFile serves a real /index.md row when present", async () => {
    const client = makeSessionClient({}, ["/index.md"]);
    (client.query as ReturnType<typeof vi.fn>).mockImplementation(async (sql: string): Promise<Record<string, unknown>[]> => {
      if (sql.includes("SELECT path, size_bytes, mime_type")) return [{ path: "/index.md", size_bytes: 5, mime_type: "text/markdown" }];
      if (sql.includes('SELECT summary FROM') && sql.includes("/index.md")) return [{ summary: "REAL INDEX" }];
      return [];
    });
    const fs = await DeeplakeFs.create(client as never, "memory", "/", "sessions");
    // Drop the cached entry so the virtual-index path runs and finds the real row.
    expect(await fs.readFile("/index.md")).toBe("REAL INDEX");
  });
});

// ── metadata / unsupported ops ─────────────────────────────────────────────────
describe("metadata ops", () => {
  it("lstat delegates to stat", async () => {
    const { fs } = await makeGoalFs({ memory: ["/notes/a.md"] });
    const s = await fs.lstat("/notes/a.md");
    expect(s.isFile).toBe(true);
  });

  it("link throws EPERM", async () => {
    const { fs } = await makeGoalFs({});
    await expect(fs.link("/notes/a.md", "/notes/b.md")).rejects.toMatchObject({ code: "EPERM" });
  });

  it("realpath resolves /index.md and a real path, ENOENT otherwise", async () => {
    const { fs } = await makeGoalFs({ memory: ["/notes/a.md"] });
    expect(await fs.realpath("/index.md")).toBe("/index.md");
    expect(await fs.realpath("/notes/a.md")).toBe("/notes/a.md");
    await expect(fs.realpath("/notes/ghost.md")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("utimes resolves without error", async () => {
    const { fs } = await makeGoalFs({});
    await expect(fs.utimes("/notes", new Date(), new Date())).resolves.toBeUndefined();
  });
});

// ── write guards / mkdir ───────────────────────────────────────────────────────
describe("write guards", () => {
  it("writeFile throws EISDIR when target is an existing directory", async () => {
    const { fs } = await makeGoalFs({ memory: ["/notes/sub/x.md"] });
    await expect(fs.writeFile("/notes/sub", "x")).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("writeFileWithMeta throws EISDIR on a directory", async () => {
    const { fs } = await makeGoalFs({ memory: ["/notes/sub/x.md"] });
    await expect(fs.writeFileWithMeta("/notes/sub", "x", {})).rejects.toMatchObject({ code: "EISDIR" });
  });

  it("mkdir throws EEXIST when a file already occupies the path", async () => {
    const { fs } = await makeGoalFs({});
    await fs.writeFile("/notes/f.md", "x");
    await expect(fs.mkdir("/notes/f.md")).rejects.toMatchObject({ code: "EEXIST" });
  });
});

// ── rm error paths ─────────────────────────────────────────────────────────────
describe("rm error paths", () => {
  it("throws ENOENT on a missing path without force", async () => {
    const { fs } = await makeGoalFs({});
    await expect(fs.rm("/notes/missing.md")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
