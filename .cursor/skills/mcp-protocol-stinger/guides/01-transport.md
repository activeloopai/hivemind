# 01 - Transport: stdio vs HTTP

When to use stdio versus HTTP/SSE for an MCP server, and why Hivemind chose stdio.

---

## The two transports

MCP is transport-agnostic JSON-RPC 2.0. Two transports are standardized:

| Transport | Shape | Lifecycle | Use when |
|---|---|---|---|
| **stdio** | Server is a child process; JSON-RPC messages flow over stdin/stdout, one JSON object per line. stderr is for logs only. | The client spawns and owns the process; closing stdin ends the session. | Local, single-client, per-user tools. The server runs on the same machine as the agent. |
| **Streamable HTTP** (with SSE for server-to-client streaming) | Server is a long-lived HTTP endpoint; client POSTs JSON-RPC, server replies and can stream notifications over SSE. | Server runs independently; multiple clients connect over the network. | Remote / multi-tenant / shared servers, or when the server must outlive any single client. |

---

## Hivemind's choice: stdio

`src/mcp/server.ts` uses `StdioServerTransport`:

```typescript
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

Why stdio is correct here:
- **Per-user, local credentials.** The server loads `~/.deeplake/credentials.json` from the local home dir. Each user's agent spawns its own server with its own identity; there is no shared multi-tenant endpoint to authenticate.
- **The client owns the lifecycle.** Hermes (and any MCP-aware harness) spawns the bundle as a subprocess via `command: node .../mcp/bundle/...`. No port, no network listener, no separate deployment.
- **stderr-only logging.** The fatal handler writes to `process.stderr`, never stdout - stdout is reserved for the JSON-RPC frame stream. Writing a stray `console.log` to stdout corrupts the protocol. This is the single most common stdio defect to audit for.

```typescript
main().catch((err) => {
  process.stderr.write(`hivemind-mcp fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
```

---

## When Hivemind would need HTTP instead

Flag a transport-change requirement (escalate, do not silently switch) if any of these become true:
- The server must be shared by multiple users behind one network endpoint (then credentials move from a local file to a per-request auth header, which is a `security-worker-bee` concern).
- The server must stream long-running progress notifications to a remote client.
- A harness cannot spawn subprocesses and can only reach tools over HTTP.

Until then, stdio is the right and simplest transport; do not add an HTTP listener.

---

## Audit checklist (transport)

- [ ] Transport matches deployment: local + per-user => stdio; remote + shared => HTTP.
- [ ] Nothing writes to stdout except the transport. All logs go to stderr.
- [ ] The fatal/uncaught path exits non-zero and logs to stderr (so the client sees the process die rather than a hung pipe).
- [ ] The server connects exactly once (`await server.connect(transport)`); no double-connect.
- [ ] For stdio, no port is opened and no network dependency is introduced.

---

*Sources: `research/2026-06-16-mcp-spec-lifecycle.md`, `research/2026-06-16-mcp-sdk-typescript.md`*
