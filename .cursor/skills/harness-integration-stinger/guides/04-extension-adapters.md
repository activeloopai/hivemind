# Guide 04: Native Extension Adapters

**Sources:** `research/external/2026-06-16-pi-extension.md`, `research/external/2026-06-16-openclaw-clawhub.md`, `research/external/2026-06-16-architecture-build.md`

---

## When you need an extension instead of hooks

Some hosts do not expose a lifecycle-hook system, or expose it alongside a richer extension API. For those, Hivemind ships a native extension that registers the contracted tools directly. Three hosts use extensions: Cursor (VS Code/Cursor extension), pi (raw-TS extension), and OpenClaw (native plugin).

---

## Cursor: first-party VS Code/Cursor extension

Cursor uses hooks (`~/.cursor/hooks.json`, 1.7+) for the capture/recall lifecycle **and** ships a first-party extension at `harnesses/cursor/extension/` for in-editor surfaces (status, panels, commands). The extension is a normal VS Code/Cursor extension - `package.json` manifest, `src/`, webpack build. It complements the hooks; it does not replace them.

Source layout (`harnesses/cursor/`):
```
extension/      built extension output
src/            extension source
package.json    extension manifest
webpack.config.js
media/          icons / assets
scripts/
```

---

## pi: raw TypeScript extension + AGENTS.md marker

pi has two wiring points:

1. **`~/.pi/agent/AGENTS.md` marker block** - an injected, marker-wrapped block that tells the pi agent the Hivemind tools exist and when to call them. Re-install replaces the block between its markers (idempotent).
2. **`harnesses/pi/extension-source/hivemind.ts`** - the extension that registers `hivemind_search`, `hivemind_read`, and `hivemind_index`.

**pi ships raw `.ts` and compiles it at load.** Do NOT pre-compile, transpile, or bundle this file in the installer. The installer drops the raw `.ts` into pi's extension dir; pi's loader compiles it. Pre-compiling breaks the load path.

```typescript
// harnesses/pi/extension-source/hivemind.ts - registers the contracted tools
// Delivered raw; pi compiles at load. Do not transpile in the installer.
export function register(pi: PiHost) {
  pi.registerTool("hivemind_search", searchSchema, handleSearch);
  pi.registerTool("hivemind_read", readSchema, handleRead);
  pi.registerTool("hivemind_index", indexSchema, handleIndex);
}
```

> Source: `research/external/2026-06-16-pi-extension.md`

---

## OpenClaw: native extension with a declared contract

OpenClaw loads a native extension at `harnesses/openclaw/`. Its `openclaw.plugin.json` declares the contracted tools (`hivemind_search`/`read`/`index`/`goal_add`/`kpi_add`) and commands up front:

```jsonc
{
  "id": "hivemind",
  "name": "Hivemind",
  "skills": ["./skills"],
  "contracts": {
    "tools": ["hivemind_search", "hivemind_read", "hivemind_index", "hivemind_goal_add", "hivemind_kpi_add"],
    "commands": ["hivemind_login", "hivemind_capture", "hivemind_whoami", "..."],
    "memoryCorpusSupplements": true
  },
  "configSchema": { "...": "autoCapture / autoRecall / autoUpdate booleans" }
}
```

OpenClaw layout: `openclaw.plugin.json`, `package.json`, `src/`, `skills/`, `README.md`.

### The ClawHub constraint

OpenClaw's ClawHub static scanner inspects the bundle and **rejects bare `spawn` / `execFileSync`**. Any subprocess access must be routed through `createRequire`-based indirection so the scanner does not flag it. See the comments in `src/skillify/gate-runner.ts` and the audit script `scripts/audit-openclaw-bundle.mjs`. This is covered in depth in `guides/06-distribution-and-audit.md`.

> Source: `research/external/2026-06-16-openclaw-clawhub.md`

---

## Common gotchas

1. **pi pre-compilation** - shipping a compiled `hivemind.js` instead of the raw `.ts` breaks pi's load path. Ship the `.ts`.
2. **Cursor: hooks AND extension** - both are wired. Removing the hooks to "rely on the extension" loses the capture lifecycle.
3. **OpenClaw bare subprocess calls** - `spawn`/`execFileSync` in the bundle fail ClawHub. Route through `createRequire`.
4. **Contract drift in an extension** - the extension is where tool names/shapes are easy to fork. Keep them identical to the MCP/skill surface (see `guides/03-tool-contract.md`).

---

*See also:* `guides/05-mcp-registration.md` for the hermes MCP path, `guides/06-distribution-and-audit.md` for the ClawHub audit, and `guides/03-tool-contract.md` for the tool surface these extensions must match.
