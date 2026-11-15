# Example: Wire a New Harness Adapter

**Demonstrates:** `guides/00-architecture-and-wiring.md`, `guides/01-capability-detection-install.md`, `guides/03-tool-contract.md`

This example walks the full path of adding a seventh harness ("acme") so Hivemind captures and recalls through it like the existing six.

---

## Flow

```
Pick wiring mechanism → add install-acme.ts (detect + wire) → add harnesses/acme/ bundle output
  → expose the contracted tools → register in hivemind install auto-detect → verify contract parity
```

---

## Step 1: Pick the wiring mechanism

Use the decision matrix in `guides/00-architecture-and-wiring.md`. Say Acme has a lifecycle-hook system but no MCP transport. → **Hooks.** It also loads a VS Code-style extension → ship one too, like Cursor.

## Step 2: Add the installer (`src/cli/install-acme.ts`)

Detect cheaply, wire idempotently. Start from `templates/install-path.ts`.

```typescript
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACME_HOME = join(homedir(), ".acme");
const HOOKS_PATH = join(ACME_HOME, "hooks.json");
const BUNDLE_DIR = join(ACME_HOME, "hivemind", "bundle");

export function isAcmeInstalled(): boolean {
  return existsSync(ACME_HOME);            // cheap, side-effect free
}

export async function installAcme(): Promise<void> {
  if (!isAcmeInstalled()) return;          // host absent - skip
  await layDownBundle(BUNDLE_DIR);         // copy esbuild output
  await wireHooks(HOOKS_PATH, BUNDLE_DIR); // upsert hivemind hook entries (idempotent)
}
```

## Step 3: Add the build output (`harnesses/acme/`)

esbuild emits the Acme bundle here: the forked hook entries (`session-start.js`, `capture.js`, ...) plus the extension if Acme takes one. Mirror the existing `harnesses/<agent>/` shape.

## Step 4: Wire the hook lifecycle

Add the events Acme supports, forking from the bundle. Resolve paths from Acme's root, never an absolute path. See `guides/02-hook-lifecycle.md`.

```jsonc
{
  "SessionStart":  [{ "hooks": [{ "type": "command", "command": "node \"<bundle>/session-start.js\"", "timeout": 10 }] }],
  "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"<bundle>/capture.js\"", "timeout": 10, "async": true }] }],
  "Stop": [{ "hooks": [{ "type": "command", "command": "node \"<bundle>/capture.js\"", "timeout": 30, "async": true }] }]
}
```

## Step 5: Expose the contracted tools

Acme's extension (or skill/marker) must register `hivemind_search`/`hivemind_read`/`hivemind_index` with the exact same args and return shapes as every other host. Do not invent an Acme-only tool. See `guides/03-tool-contract.md`.

## Step 6: Register in auto-detect

Add Acme to the `hivemind install` detection loop so it is wired automatically when present.

```typescript
const HOSTS = [
  { detect: isClaudeInstalled, install: installClaude },
  // ...
  { detect: isAcmeInstalled,   install: installAcme },   // <-- new
];
for (const h of HOSTS) if (h.detect()) await h.install();
```

---

## Key patterns demonstrated

1. **Detection is cheap** - `existsSync(ACME_HOME)`, no writes, no spawn.
2. **Bundle path resolves from the host root** - never absolute.
3. **Capture hooks are async; recall is on the critical path** - honor timeouts.
4. **Contract parity** - the new host exposes the identical tool surface.
5. **Idempotent wiring** - re-running install converges, never duplicates.
