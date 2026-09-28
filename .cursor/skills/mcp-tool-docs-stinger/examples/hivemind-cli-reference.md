# Example: CLI Reference for `install` / `status` / `login`

A worked CLI reference built from `src/cli/index.ts`. This is the shape the full `hivemind` command reference should take.

**Demonstrates:** `guides/03-cli-docs.md`, `templates/cli-command-reference.md`

---

## `hivemind install`

**Usage:** `hivemind install [--only <platforms>] [--skip-auth] [--token <value>]`

**Purpose:** Auto-detect the coding assistants on this machine and wire Hivemind into each one.

**Flags:**

| Flag | Takes value | Default | Notes |
|---|---|---|---|
| `--only <platforms>` | yes | all detected | Comma-separated platform ids from `allPlatformIds()` (e.g. `claude,cursor`). Scopes the install. |
| `--skip-auth` | no | off | Skip the login step (used for headless installs). |
| `--token <value>` | yes | env `HIVEMIND_TOKEN` | Sign in non-interactively. Useful for CI / scripted installs. |

**Side effects:** Copies Hivemind bundles into each detected assistant's extension/plugin directory and patches that assistant's config (for example, `~/.openclaw/openclaw.json` is patched so the gateway loads Hivemind; a backup is written first). In a TTY without `--token`, shows a consent prompt; headless without a token, skips auth and prints a `hivemind login` hint.

**Example:**

```bash
hivemind install --only claude,cursor --token "$HIVEMIND_TOKEN"
```

---

## `hivemind status`

**Usage:** `hivemind status`

**Purpose:** Show which assistants on this machine are wired up to Hivemind.

**Flags:** none.

**Side effects:** None. Read-only inspection of installed assistant config.

**Example:**

```bash
hivemind status
```

---

## `hivemind login`

**Usage:** `hivemind login`

**Purpose:** Run the device-flow login, opening a browser to authenticate against Deeplake.

**Flags:** none.

**Side effects:** Writes credentials to `~/.deeplake/credentials.json`. The MCP server and CLI commands load this file; without it, MCP tools return "Not authenticated."

**Example:**

```bash
hivemind login
```

---

*References: `guides/03-cli-docs.md`, `src/cli/index.ts`, `src/cli/install-openclaw.ts`*
