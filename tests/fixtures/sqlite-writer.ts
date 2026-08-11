import { SqliteBackend } from "../../src/storage/sqlite.js";

const [databasePath, writerId, countRaw] = process.argv.slice(2);
const count = Number.parseInt(countRaw, 10);
const names = {
  memory: "memory",
  sessions: "sessions",
  skills: "skills",
  rules: "hivemind_rules",
  goals: "hivemind_goals",
  kpis: "hivemind_kpis",
  docs: "hivemind_docs",
  codebase: "codebase",
};

const backend = new SqliteBackend(databasePath, "sessions", names);
try {
  await backend.ensureSessionsTable("sessions");
  for (let index = 0; index < count; index++) {
    await backend.execute(
      `INSERT INTO "sessions" (id, path, filename, message, author) VALUES ($1, $2, $3, $4, $5)`,
      [`${writerId}-${index}`, `/sessions/${writerId}-${index}.jsonl`, `${writerId}-${index}.jsonl`, { writerId, index }, writerId],
    );
  }
} finally {
  await backend.close();
}
