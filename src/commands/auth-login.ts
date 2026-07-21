#!/usr/bin/env node

/**
 * CLI entry point for auth and org management.
 *
 * Usage:
 *   node auth-login.js login              — device flow login
 *   node auth-login.js logout             — remove credentials
 *   node auth-login.js org list           — list orgs
 *   node auth-login.js org switch <id>    — switch org
 *   node auth-login.js workspaces             — list workspaces
 *   node auth-login.js workspace list         — list workspaces (alias)
 *   node auth-login.js workspace switch <id>  — switch workspace
 *   node auth-login.js invite <email> <mode> — invite member
 *   node auth-login.js members            — list members
 *   node auth-login.js whoami             — show current user/org
 *   node auth-login.js sessions prune     — list/delete own sessions
 *   node auth-login.js update            — update plugin to latest version
 *   node auth-login.js autoupdate [on|off] — toggle automatic updates (default: on)
 */

import {
  login, loadCredentials, saveCredentials, deleteCredentials, listOrgs, switchOrg,
  listWorkspaces, switchWorkspace,
  inviteMember, listMembers, removeMember,
} from "./auth.js";
import { sessionPrune } from "./session-prune.js";
import { loadConfig } from "../config.js";
import { renderWhoami } from "./whoami.js";

/**
 * Dispatch one auth subcommand.
 *
 * Used both by this module's standalone main() (when run as a Node script)
 * and by the unified `hivemind` CLI which re-exports these subcommands at
 * its top level (`hivemind whoami`, `hivemind org list`, etc.) so users
 * don't have to know about per-plugin bundle paths.
 */
export async function runAuthCommand(args: string[]): Promise<void> {
  const cmd = args[0] ?? "whoami";

  const creds = loadCredentials();
  const apiUrl = creds?.apiUrl ?? "https://api.deeplake.ai";

  switch (cmd) {
    case "login": {
      await login(apiUrl);
      break;
    }

    case "whoami": {
      if (!creds) { console.log("Not logged in. Run: hivemind login"); break; }
      // Report the EFFECTIVE identity for the cwd, not the raw stored creds:
      // env vars and a per-directory `.hivemind` both override them, and this
      // is the surface users (and agents) ask "what am I connected to?".
      // Reading creds directly here made `whoami` misreport under either.
      console.log(renderWhoami(loadConfig(), creds, process.cwd()));
      break;
    }

    case "org": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const sub = args[1];
      if (sub === "list") {
        const orgs = await listOrgs(creds.token, apiUrl);
        orgs.forEach(o => console.log(`${o.id}  ${o.name}`));
      } else if (sub === "switch") {
        const target = args[2];
        if (!target) { console.log("Usage: org switch <org-name-or-id>"); process.exit(1); }
        const orgs = await listOrgs(creds.token, apiUrl);
        const match = orgs.find(o => o.id === target || o.name.toLowerCase() === target.toLowerCase());
        if (!match) { console.log(`Org not found: ${target}`); process.exit(1); }

        // Resolve the carry-over BEFORE mutating credentials. If listWorkspaces
        // fails (network blip, 5xx) the exception bubbles up unchanged and the
        // org switch never happens — re-running the command then succeeds
        // cleanly instead of leaving credentials half-committed.
        const prevWs = creds.workspaceId ?? "default";
        const lcPrev = prevWs.toLowerCase();
        const wsList = await listWorkspaces(creds.token, apiUrl, match.id);
        // Resolve to the matched workspace OBJECT, not a boolean: `workspaceId`
        // is supposed to be a canonical id but legacy creds (and the post-login
        // `"default"` sentinel) can hold a name. We need the matched object so
        // we can normalize a name-only match to the canonical id.
        const matchedWs = wsList.find(w => w.id === prevWs || (w.name && w.name.toLowerCase() === lcPrev));

        await switchOrg(match.id, match.name);
        console.log(`Switched to org: ${match.name}`);

        if (!matchedWs) {
          // Suppress the reset-and-warn when prevWs is already the "default"
          // sentinel and the new org has no workspace named/idd "default" —
          // there's nothing to reset and the warning would be misleading.
          if (prevWs !== "default") {
            await switchWorkspace("default");
            console.log(`Workspace '${prevWs}' is not in org '${match.name}'. Reset workspace to 'default'.`);
            if (wsList.length > 0) {
              console.log(`Available workspaces: ${wsList.map(w => w.name || w.id).join(", ")}`);
            }
          }
        } else if (matchedWs.id !== prevWs) {
          // The carried-over value matched only by display name. Persist the
          // canonical id so subsequent commands target the workspace
          // deterministically (an id is stable across renames; a name is not).
          await switchWorkspace(matchedWs.id);
          console.log(`Workspace name '${prevWs}' resolved to id '${matchedWs.id}' in org '${match.name}'.`);
        }
      } else {
        console.log("Usage: org list | org switch <name-or-id>");
      }
      break;
    }

    case "workspaces": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const ws = await listWorkspaces(creds.token, apiUrl, creds.orgId);
      ws.forEach(w => console.log(w.name || w.id));
      break;
    }

    case "workspace": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const sub = args[1];

      if (sub === "list") {
        const wsList = await listWorkspaces(creds.token, apiUrl, creds.orgId);
        wsList.forEach(w => console.log(w.name || w.id));
        break;
      }

      if (sub === "switch") {
        const target = args[2];
        if (!target) { console.log("Usage: workspace switch <name-or-id>"); process.exit(1); }
        const wsList = await listWorkspaces(creds.token, apiUrl, creds.orgId);
        const lcTarget = target.toLowerCase();
        const match = wsList.find(w => w.id === target || (w.name && w.name.toLowerCase() === lcTarget));
        if (!match) {
          console.log(`Workspace not found: ${target}`);
          if (wsList.length > 0) {
            console.log(`Available workspaces: ${wsList.map(w => w.name || w.id).join(", ")}`);
          }
          process.exit(1);
        }
        await switchWorkspace(match.id);
        console.log(`Switched to workspace: ${match.name || match.id}`);
        break;
      }

      console.log("Usage: workspace list | workspace switch <name-or-id>");
      process.exit(1);
    }

    case "invite": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const email = args[1];
      const mode = (args[2]?.toUpperCase() ?? "WRITE") as "ADMIN" | "WRITE" | "READ";
      if (!email) { console.log("Usage: invite <email> [ADMIN|WRITE|READ]"); process.exit(1); }
      await inviteMember(email, mode, creds.token, creds.orgId, apiUrl);
      console.log(`Invited ${email} with ${mode} access`);
      break;
    }

    case "members": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const members = await listMembers(creds.token, creds.orgId, apiUrl);
      members.forEach(m => console.log(`${m.role.padEnd(8)} ${m.email ?? m.name}`));
      break;
    }

    case "remove": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const userId = args[1];
      if (!userId) { console.log("Usage: remove <user-id>"); process.exit(1); }
      await removeMember(userId, creds.token, creds.orgId, apiUrl);
      console.log(`Removed user ${userId}`);
      break;
    }

    case "sessions": {
      const sub = args[1];
      if (sub === "prune") {
        await sessionPrune(args.slice(2));
      } else {
        console.log("Usage: sessions prune [--all | --before <date> | --session-id <id>] [--yes]");
      }
      break;
    }

    case "autoupdate": {
      if (!creds) { console.log("Not logged in."); process.exit(1); }
      const val = args[1]?.toLowerCase();
      if (val === "on" || val === "true") {
        saveCredentials({ ...creds, autoupdate: true });
        console.log("Autoupdate enabled. Plugin will update automatically on session start.");
      } else if (val === "off" || val === "false") {
        saveCredentials({ ...creds, autoupdate: false });
        console.log("Autoupdate disabled. You'll see a notice when updates are available.");
      } else {
        const current = creds.autoupdate !== false ? "on" : "off";
        console.log(`Autoupdate is currently: ${current}`);
        console.log("Usage: autoupdate [on|off]");
      }
      break;
    }

    case "logout": {
      if (deleteCredentials()) {
        console.log("Logged out. Credentials removed.");
      } else {
        console.log("Not logged in.");
      }
      break;
    }

    default:
      console.log("Commands: login, logout, whoami, org list, org switch, workspaces, workspace, sessions prune, invite, members, remove, autoupdate");
  }
}

// Run as a standalone script only when invoked directly via Node — not when
// imported (the unified CLI imports this file to dispatch its own subcommands).
// Identify standalone mode by the bundled script's filename: per-agent bundles
// land at `<plugin>/bundle/commands/auth-login.js`, while the unified CLI is
// bundled into `bundle/cli.js`, which doesn't end with auth-login.js.
if (process.argv[1] && process.argv[1].endsWith("auth-login.js")) {
  runAuthCommand(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
}
