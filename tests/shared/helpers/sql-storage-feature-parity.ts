import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import type { Config } from "../../../src/config.js";
import { computeSnapshotSha256 } from "../../../src/graph/snapshot.js";
import { pullSnapshot } from "../../../src/graph/deeplake-pull.js";
import { pushSnapshot } from "../../../src/graph/deeplake-push.js";
import type { GraphSnapshot } from "../../../src/graph/types.js";
import { listOpenGoals } from "../../../src/hooks/shared/context-renderer.js";
import { DeeplakeFs } from "../../../src/shell/deeplake-fs.js";
import { searchDeeplakeTables, searchDocs } from "../../../src/shell/grep-core.js";
import { runPull } from "../../../src/skillify/pull.js";
import { runPush } from "../../../src/skillify/push.js";
import type { StorageBackend } from "../../../src/storage/backend.js";
import { deriveProjectKey } from "../../../src/utils/repo-identity.js";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../../..");
const tsxLoader = join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");

export interface SqlStorageHarness {
  backend: StorageBackend;
  config: Config;
  root: string;
  childEnv: NodeJS.ProcessEnv;
  malformedVector: string | number[];
  cleanup(): Promise<void>;
}

export type SqlStorageHarnessFactory = () => Promise<SqlStorageHarness>;

async function withHarness(
  createHarness: SqlStorageHarnessFactory,
  scenario: (harness: SqlStorageHarness) => Promise<void>,
): Promise<void> {
  const harness = await createHarness();
  try {
    await harness.backend.initializeSchema();
    await scenario(harness);
  } finally {
    await harness.cleanup();
  }
}

function queryFor(backend: StorageBackend): (sql: string) => Promise<Array<Record<string, unknown>>> {
  return sql => backend.query(sql);
}

function writeSkill(root: string, body: string): void {
  const dir = join(root, ".claude", "skills", "sql-parity");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), [
    "---",
    "name: sql-parity",
    'description: "Verify SQL storage"',
    'trigger: "when checking SQL storage"',
    "author: alice",
    "contributors:",
    "  - alice",
    "source_sessions:",
    "  - session-1",
    "version: 1",
    "created_by_agent: codex",
    "created_at: 2026-01-01T00:00:00.000Z",
    "---",
    "",
    body,
    "",
  ].join("\n"));
}

function snapshotFor(root: string): GraphSnapshot {
  return {
    directed: true,
    multigraph: true,
    graph: {
      schema_version: 1,
      generator: "hivemind-graph",
      commit_sha: "abc123",
      repo_key: deriveProjectKey(root).key,
    },
    observation: {
      ts: "2026-01-02T03:04:05.000Z",
      branch: "main",
      worktree_path: root,
      repo_project: "sql-parity",
      generator_version: "test",
      source_files_extracted: 1,
      source_files_skipped: 0,
    },
    nodes: [{
      id: "src/index.ts:main:function",
      label: "main",
      kind: "function",
      source_file: "src/index.ts",
      source_location: "L1",
      language: "typescript",
      exported: true,
    }],
    links: [],
  };
}

async function runCli(harness: SqlStorageHarness, args: string[]): Promise<string> {
  const result = await execFileAsync(
    process.execPath,
    ["--import", tsxLoader, join(repoRoot, "src", "cli", "index.ts"), ...args],
    {
      cwd: harness.root,
      env: harness.childEnv,
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    },
  );
  return result.stdout;
}

async function callMcpTools(harness: SqlStorageHarness): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", tsxLoader, join(repoRoot, "src", "mcp", "server.ts")],
    cwd: harness.root,
    env: harness.childEnv as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "sql-storage-parity", version: "1.0.0" });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.map(tool => tool.name).sort()).toEqual([
      "hivemind_docs_search",
      "hivemind_index",
      "hivemind_read",
      "hivemind_search",
    ]);

    const index = await client.callTool({ name: "hivemind_index", arguments: {} });
    expect(JSON.stringify(index)).toContain("/summaries/alice/mcp.md");

    const read = await client.callTool({
      name: "hivemind_read",
      arguments: { path: "/summaries/alice/mcp.md" },
    });
    expect(JSON.stringify(read)).toContain("MCP lexical needle");

    const search = await client.callTool({
      name: "hivemind_search",
      arguments: { query: "lexical needle", limit: 10 },
    });
    expect(JSON.stringify(search)).toContain("/summaries/alice/mcp.md");
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function registerSqlStorageFeatureParity(
  label: string,
  enabled: boolean,
  createHarness: SqlStorageHarnessFactory,
): void {
  const suite = enabled ? describe.sequential : describe.skip;

  suite(`${label} real-backend feature parity`, () => {
    it("round-trips goals and KPIs, transitions status, and isolates latest-version reads", async () => {
      await withHarness(createHarness, async ({ backend }) => {
        const fs = await DeeplakeFs.create(backend, "memory", "/", "sessions", {
          goalsTable: "hivemind_goals",
          kpisTable: "hivemind_kpis",
        });
        await fs.writeFile("/goal/alice/opened/goal-1.md", "Ship SQL storage");
        await fs.writeFile(
          "/kpi/goal-1/k-tests.md",
          "Passing scenarios\n\n- target: 8\n- current: 1\n- unit: tests",
        );
        await fs.flush();
        await fs.mv(
          "/goal/alice/opened/goal-1.md",
          "/goal/alice/in_progress/goal-1.md",
        );
        await fs.writeFile(
          "/kpi/goal-1/k-tests.md",
          "Passing scenarios\n\n- target: 8\n- current: 2\n- unit: tests",
        );
        await fs.flush();

        expect(await fs.readFile("/goal/alice/in_progress/goal-1.md")).toBe("Ship SQL storage");
        expect(await fs.readFile("/kpi/goal-1/k-tests.md")).toContain("current: 2");
        expect(await backend.query(
          `SELECT status, content, version FROM "hivemind_goals" WHERE goal_id = $1`,
          ["goal-1"],
        )).toEqual([{ status: "in_progress", content: "Ship SQL storage", version: 1 }]);

        await backend.execute(
          `INSERT INTO "hivemind_goals" (id, goal_id, owner, status, content, version, created_at) VALUES ` +
          `($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14), ` +
          `($15, $16, $17, $18, $19, $20, $21)`,
          [
            randomUUID(), "versioned", "alice", "closed", "old version", 1, "2026-01-01T00:00:00Z",
            randomUUID(), "versioned", "alice", "opened", "latest version", 2, "2026-01-02T00:00:00Z",
            randomUUID(), "private", "bob", "opened", "must not leak", 1, "2026-01-03T00:00:00Z",
          ],
        );
        const goals = await listOpenGoals(queryFor(backend), "hivemind_goals", "alice");
        expect(goals).toEqual(expect.arrayContaining([
          { goal_id: "goal-1", status: "in_progress", content: "Ship SQL storage" },
          { goal_id: "versioned", status: "opened", content: "latest version" },
        ]));
        expect(goals.some(goal => goal.content === "old version" || goal.content === "must not leak")).toBe(false);
      });
    });

    it("pushes, discovers, and idempotently updates versioned skills", async () => {
      await withHarness(createHarness, async ({ backend, config, root }) => {
        const previousState = process.env.HIVEMIND_STATE_DIR;
        process.env.HIVEMIND_STATE_DIR = join(root, "state");
        try {
          writeSkill(root, "## Workflow\n\nVersion one.");
          const base = {
            query: queryFor(backend),
            tableName: config.skillsTableName,
            workspaceId: config.workspaceId,
            from: "project" as const,
            cwd: root,
            skillName: "sql-parity",
            pusher: "alice",
            scope: "team" as const,
            agent: "codex",
          };
          const first = await runPush({ ...base, now: "2026-01-02T00:00:00.000Z" });
          expect(first.version).toBe(1);
          writeSkill(root, "## Workflow\n\nVersion two.");
          const second = await runPush({ ...base, now: "2026-01-03T00:00:00.000Z" });
          expect(second).toMatchObject({ previousVersion: 1, version: 2 });

          const pullRoot = join(root, "consumer");
          const pulled = await runPull({
            query: queryFor(backend),
            tableName: config.skillsTableName,
            install: "project",
            cwd: pullRoot,
            users: ["alice"],
            skillName: "sql-parity",
          });
          expect(pulled).toMatchObject({ scanned: 1, wrote: 1, skipped: 0 });
          const skillPath = join(pullRoot, ".claude", "skills", "sql-parity--alice", "SKILL.md");
          expect(readFileSync(skillPath, "utf-8")).toContain("Version two.");
          expect(readFileSync(skillPath, "utf-8")).toContain("version: 2");

          const repeated = await runPull({
            query: queryFor(backend),
            tableName: config.skillsTableName,
            install: "project",
            cwd: pullRoot,
            users: ["alice"],
            skillName: "sql-parity",
          });
          expect(repeated).toMatchObject({ scanned: 1, wrote: 0, skipped: 1 });
          expect(await backend.query(
            `SELECT version FROM "skills" WHERE name = $1 AND author = $2 ORDER BY version`,
            ["sql-parity", "alice"],
          )).toEqual([{ version: 1 }, { version: 2 }]);
        } finally {
          if (previousState === undefined) delete process.env.HIVEMIND_STATE_DIR;
          else process.env.HIVEMIND_STATE_DIR = previousState;
        }
      });
    });

    it("pushes and pulls graph snapshots through the codebase table", async () => {
      await withHarness(createHarness, async ({ backend, config, root }) => {
        const previousGraphsHome = process.env.HIVEMIND_GRAPHS_HOME;
        process.env.HIVEMIND_GRAPHS_HOME = join(root, "graphs");
        try {
          const snapshot = snapshotFor(root);
          const pushed = await pushSnapshot(snapshot, "worktree-a", {
            loadConfig: () => config,
            makeApi: () => backend,
            cwd: root,
          });
          expect(pushed).toEqual({ kind: "inserted", commitSha: "abc123" });
          expect(await pushSnapshot(snapshot, "worktree-a", {
            loadConfig: () => config,
            makeApi: () => backend,
            cwd: root,
          })).toEqual({ kind: "already-current", commitSha: "abc123" });

          const rows = await backend.query(
            `SELECT snapshot_sha256, node_count, edge_count FROM "codebase" WHERE commit_sha = $1`,
            ["abc123"],
          );
          expect(rows).toEqual([{
            snapshot_sha256: computeSnapshotSha256(snapshot),
            node_count: 1,
            edge_count: 0,
          }]);

          const pulled = await pullSnapshot(root, {
            loadConfig: () => config,
            makeApi: () => backend,
            readHead: () => "abc123",
          });
          expect(pulled.kind).toBe("pulled");
          expect(existsSync(join(
            process.env.HIVEMIND_GRAPHS_HOME,
            snapshot.graph.repo_key,
            "snapshots",
            "abc123.json",
          ))).toBe(true);
        } finally {
          if (previousGraphsHome === undefined) delete process.env.HIVEMIND_GRAPHS_HOME;
          else process.env.HIVEMIND_GRAPHS_HOME = previousGraphsHome;
        }
      });
    });

    it("serves MCP list, read, and lexical search operations", async () => {
      await withHarness(createHarness, async (harness) => {
        harness.backend.appendRows([{
          path: "/summaries/alice/mcp.md",
          filename: "mcp.md",
          contentText: "MCP lexical needle",
          mimeType: "text/markdown",
          sizeBytes: 18,
          project: deriveProjectKey(harness.root).key,
          description: "MCP parity",
        }]);
        await harness.backend.commit();
        await harness.backend.execute(
          `INSERT INTO "sessions" (id, path, filename, message, author, creation_date, project) ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), "/sessions/alice/mcp.jsonl", "mcp.jsonl", { type: "user_message", content: "secondary needle" }, "alice", "2026-01-01T00:00:00Z", "parity"],
        );
        await callMcpTools(harness);
      });
    }, 30_000);

    it("prunes only matching sessions and their summaries", async () => {
      await withHarness(createHarness, async (harness) => {
        const rows = [
          ["old-a", "/sessions/alice/alice_local_default_old.jsonl", "alice", "2024-01-01T00:00:00Z"],
          ["new-a", "/sessions/alice/alice_local_default_new.jsonl", "alice", "2026-01-01T00:00:00Z"],
          ["old-b", "/sessions/bob/bob_local_default_bobold.jsonl", "bob", "2024-01-01T00:00:00Z"],
        ];
        for (const [id, path, author, created] of rows) {
          await harness.backend.execute(
            `INSERT INTO "sessions" (id, path, filename, message, author, creation_date, project) ` +
            `VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, path, `${id}.jsonl`, { type: "user_message", content: id }, author, created, "parity"],
          );
        }
        harness.backend.appendRows([
          { path: "/summaries/alice/old.md", filename: "old.md", contentText: "old", mimeType: "text/markdown", sizeBytes: 3 },
          { path: "/summaries/alice/new.md", filename: "new.md", contentText: "new", mimeType: "text/markdown", sizeBytes: 3 },
          { path: "/summaries/alice/bobold.md", filename: "bobold.md", contentText: "bob", mimeType: "text/markdown", sizeBytes: 3 },
        ]);
        await harness.backend.commit();

        const output = await runCli(harness, ["sessions", "prune", "--before", "2025-01-01", "--yes"]);
        expect(output).toContain("Deleted 1 session(s) and 1 summary file(s).");
        expect(await harness.backend.query(`SELECT id FROM "sessions" ORDER BY id`)).toEqual([
          { id: "new-a" },
          { id: "old-b" },
        ]);
        expect(await harness.backend.query(`SELECT path FROM "memory" ORDER BY path`)).toEqual([
          { path: "/summaries/alice/bobold.md" },
          { path: "/summaries/alice/new.md" },
        ]);
      });
    }, 30_000);

    it("keeps lexical results when embeddings are disabled or stored vectors are malformed", async () => {
      await withHarness(createHarness, async ({ backend, malformedVector }) => {
        backend.appendRows([{
          path: "/summaries/alice/fallback.md",
          filename: "fallback.md",
          contentText: "lexical fallback survives",
          mimeType: "text/markdown",
          sizeBytes: 25,
        }]);
        await backend.commit();
        await backend.execute(
          `UPDATE "memory" SET summary_embedding = $1 WHERE path = $2`,
          [malformedVector, "/summaries/alice/fallback.md"],
        );

        const base = {
          pathFilter: "",
          contentScanOnly: false,
          likeOp: "ILIKE" as const,
          escapedPattern: "%FALLBACK%",
          limit: 10,
        };
        const disabled = await searchDeeplakeTables(backend, "memory", "sessions", {
          ...base,
          queryEmbedding: null,
        });
        expect(disabled.map(row => row.path)).toContain("/summaries/alice/fallback.md");
        const malformed = await searchDeeplakeTables(backend, "memory", "sessions", {
          ...base,
          queryEmbedding: [1, 0],
        });
        expect(malformed.map(row => row.path)).toContain("/summaries/alice/fallback.md");

        await backend.execute(
          `INSERT INTO "hivemind_docs" (id, doc_id, path, content, content_embedding, project, status) ` +
          `VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), "src/fallback.ts", "/docs/src/fallback.ts.md", "docs lexical fallback", malformedVector, "parity", "active"],
        );
        const docs = await searchDocs(queryFor(backend), "hivemind_docs", {
          ...base,
          escapedPattern: "%LEXICAL%",
          queryEmbedding: [1, 0],
          project: "parity",
        }, backend.dialect);
        expect(docs.map(row => row.path)).toContain("src/fallback.ts");
      });
    });
  });
}
