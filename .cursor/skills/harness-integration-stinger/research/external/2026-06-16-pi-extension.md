# Source: pi Adapter - Raw-TS Extension + AGENTS.md Marker

- **Retrieved:** 2026-06-16
- **Source type:** Hivemind repo (authoritative) + pi extension docs
- **In-repo anchors:** `harnesses/pi/extension-source/hivemind.ts`, `harnesses/pi/`, `src/cli/install-pi.ts`

---

## Two wiring points

pi has no lifecycle-hook system like Claude Code, so its adapter wires two ways:

1. **`~/.pi/agent/AGENTS.md` marker block** - an injected, marker-wrapped block telling the pi agent the Hivemind tools exist and when to call them. Re-install replaces the block between its begin/end markers (idempotent).
2. **`harnesses/pi/extension-source/hivemind.ts`** - a TS extension that registers `hivemind_search`, `hivemind_read`, `hivemind_index`.

## pi ships RAW TypeScript

The critical constraint: pi delivers the extension as raw `.ts` and compiles it at load. The installer drops `hivemind.ts` into pi's extension dir; pi's loader compiles it.

**Do NOT pre-compile, transpile, or bundle this file in the installer.** A shipped `hivemind.js` breaks pi's load path. This is the opposite of the esbuild-bundled hooks the other hosts use.

```typescript
// harnesses/pi/extension-source/hivemind.ts (raw; pi compiles at load)
export function register(pi: PiHost) {
  pi.registerTool("hivemind_search", searchSchema, handleSearch);
  pi.registerTool("hivemind_read", readSchema, handleRead);
  pi.registerTool("hivemind_index", indexSchema, handleIndex);
}
```

## Contract parity

The tools the pi extension registers must match the MCP server and OpenClaw plugin exactly (same names, args, return shapes). The pi extension is a common place for contract drift because it is hand-registered TS - keep it in lockstep.
