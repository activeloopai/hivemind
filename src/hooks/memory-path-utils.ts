import { homedir } from "node:os";
import { join } from "node:path";

export const MEMORY_PATH = join(homedir(), ".deeplake", "memory");
export const TILDE_PATH = "~/.deeplake/memory";
export const HOME_VAR_PATH = "$HOME/.deeplake/memory";

export const SAFE_BUILTINS = new Set([
  "cat", "ls", "cp", "mv", "rm", "rmdir", "mkdir", "touch", "ln", "chmod",
  "stat", "readlink", "du", "tree", "file",
  // sed and awk removed: sed supports `-e '1e <cmd>'` (execute shell command)
  // and awk supports `system()` / `|` pipelines — both enable arbitrary code
  // execution through the just-bash fallback.
  "grep", "egrep", "fgrep", "rg", "cut", "tr", "sort", "uniq",
  "wc", "head", "tail", "tac", "rev", "nl", "fold", "expand", "unexpand",
  "paste", "join", "comm", "column", "diff", "strings", "split",
  // xargs removed: it executes its input as a child command (`… | xargs curl`).
  // `find` stays because the VFS serves `find -name`, but isSafe() rejects the
  // command-dispatching `-exec/-execdir/-ok/-okdir` primaries below.
  "find", "which",
  "jq", "yq", "xan", "base64", "od",
  // tar removed: --to-command=<cmd> executes an arbitrary program per entry.
  // env removed: `env <cmd>` runs an arbitrary program.
  "gzip", "gunzip", "zcat",
  "md5sum", "sha1sum", "sha256sum",
  "echo", "printf", "tee",
  "pwd", "cd", "basename", "dirname", "printenv", "hostname", "whoami",
  // timeout and time removed: both are wrappers that run an arbitrary child
  // command (`timeout 1 curl …`, `time curl …`).
  "date", "seq", "expr", "sleep", "true", "false", "test",
  "alias", "unalias", "history", "help", "clear",
  // Shell control keywords removed: as a stage's first token they let a child
  // command ride in as a later token (`if true; then curl …; fi` splits into a
  // `then curl …` stage whose leading `then` would otherwise pass). No VFS
  // handler emulates control flow, so dropping them only sends such commands to
  // the guidance/deny path — they never reach a real shell.
]);

// A quoted heredoc (`<<'EOF'` / `<<"EOF"`) disables shell expansion, so its
// body is inert literal data — a goal/KPI description, not commands. Drop the
// body and its closing delimiter so they are never validated as command stages
// or tripped over by the substitution guard. Unquoted heredocs keep their body
// (bash would expand it), so they still fall through to full validation.
function stripHeredocBodies(cmd: string): string {
  if (!cmd.includes("<<")) return cmd;
  const lines = cmd.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    kept.push(line);
    const heredoc = line.match(/<<-?\s*(['"])([A-Za-z_]\w*)\1/);
    if (!heredoc) continue;
    const delimiter = heredoc[2];
    const stripTabs = line.includes("<<-");
    while (i + 1 < lines.length) {
      const body = lines[++i];
      const probe = stripTabs ? body.replace(/^\t+/, "") : body;
      if (probe === delimiter) break;
    }
  }
  return kept.join("\n");
}

export function isSafe(cmd: string): boolean {
  const validated = stripHeredocBodies(cmd);
  // $'...' is ANSI-C quoting: bash expands escape sequences inside it before
  // the child process sees them, bypassing the single-quote stripping below.
  if (/\$\(|`|<\(|\$'/.test(validated)) return false;
  const stripped = validated.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  // `find … -exec/-execdir/-ok/-okdir <cmd>` runs an arbitrary program per
  // match. `find` itself must stay allowlisted for the `-name` read shape, so
  // reject the command-dispatching primaries explicitly. Checked post-strip so
  // a quoted grep pattern containing "-exec" can't trip a false positive.
  if (/(?:^|\s)-(?:exec|execdir|ok|okdir)\b/.test(stripped)) return false;
  // Note: we deliberately do NOT split on a bare `&` — it collides with fd
  // redirections like `2>&1`. A backgrounded second command (`cat x & curl …`)
  // still can't reach the host: it matches no handler, so it falls through to
  // the retry-guidance path which rewrites it to a harmless echo.
  const stages = stripped.split(/\||;|&&|\|\||\n/);
  for (const stage of stages) {
    const firstToken = stage.trim().split(/\s+/)[0] ?? "";
    if (firstToken && !SAFE_BUILTINS.has(firstToken)) return false;
  }
  return true;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A mount prefix only counts when it is the mount root or a descendant — i.e.
// followed by `/`, end-of-string, or a non-path character. Matching it as a
// bare substring false-positives on siblings like `~/.deeplake/memory-backup/x`
// and on literals like `grep "~/.deeplake/memory" README.md`.
const MEMORY_BOUNDARY = "(?![A-Za-z0-9._-])";
const MEMORY_PREFIX_RE = new RegExp(
  "(?:" + [MEMORY_PATH, TILDE_PATH, HOME_VAR_PATH].map(escapeRe).join("|") + ")" + MEMORY_BOUNDARY,
);

export function touchesMemory(p: string): boolean {
  return MEMORY_PREFIX_RE.test(p);
}

export function rewritePaths(cmd: string): string {
  // Consume a trailing slash if present, otherwise require a boundary so a
  // sibling like `memory-backup` is left untouched.
  const tail = "(?:\\/|" + MEMORY_BOUNDARY + ")";
  return cmd
    .replace(new RegExp(escapeRe(MEMORY_PATH) + tail, "g"), "/")
    .replace(new RegExp(escapeRe(TILDE_PATH) + tail, "g"), "/")
    .replace(new RegExp('"' + escapeRe(HOME_VAR_PATH) + tail + '"', "g"), '"/"')
    .replace(new RegExp(escapeRe(HOME_VAR_PATH) + tail, "g"), "/");
}

// Split a bash command into pipe/chain stages, each an argv array, respecting
// quotes and escapes. `>`/`>>` are emitted as their own tokens.
export function parseBashTokens(cmd: string): string[][] {
  const stages: string[][] = [];
  let currentStage: string[] = [];
  let currentToken = "";
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  const pushToken = () => {
    if (currentToken.length > 0) { currentStage.push(currentToken); currentToken = ""; }
  };
  const pushStage = () => {
    pushToken();
    if (currentStage.length > 0) { stages.push(currentStage); currentStage = []; }
  };

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];

    if (escape) { currentToken += char; escape = false; continue; } // prev char was `\`
    // Backslash is literal inside single quotes (bash semantics) — treating it
    // as an escape there would swallow the closing quote and hide a following
    // `; cmd …` stage inside the quoted token.
    if (char === "\\" && !inSingle) { escape = true; currentToken += char; continue; }
    if (char === "'" && !inDouble) { inSingle = !inSingle; currentToken += char; continue; } // keep quotes
    if (char === '"' && !inSingle) { inDouble = !inDouble; currentToken += char; continue; }

    if (!inSingle && !inDouble) { // separators only act outside quotes
      if (char === "\n" || char === ";") { pushStage(); continue; }
      if (char === "|") { if (cmd[i + 1] === "|") i++; pushStage(); continue; } // `|` / `||`
      if (char === "&" && cmd[i + 1] === "&") { i++; pushStage(); continue; }   // `&&`
      if (char === ">") { // own token, so `>file` (no space) is detectable
        pushToken();
        if (cmd[i + 1] === ">") { currentStage.push(">>"); i++; } else currentStage.push(">");
        continue;
      }
      if (char === "<") { // own token, so `<file` (no space) is detectable;
        pushToken();      // `<<`/`<<<` (heredoc/herestring) lump into one token
        let run = "<";    // so only a lone `<` reads a file path
        while (cmd[i + 1] === "<" && run.length < 3) { run += "<"; i++; }
        currentStage.push(run);
        continue;
      }
      if (/\s/.test(char)) { pushToken(); continue; }
    }

    currentToken += char;
  }

  pushStage();
  return stages;
}

// echo/printf print their args; `claude -p` takes a natural-language prompt —
// a memory path in their arguments is inert text (the #87 false positive).
// Interpreters (python/node/ruby/…) and fetchers (curl) are deliberately NOT
// here: they execute/read their args, so a memory path is a real interaction.
const PASSTHROUGH_COMMANDS = new Set(["echo", "printf", "claude"]);

export function bashTouchesMemory(cmd: string): boolean {
  // Substitutions — $(), backticks, <(…) — run on the host no matter whose
  // argv they sit in, and isSafe() (which rejects them) only runs AFTER this
  // function returns true. So they get no carve-out: any memory mention next
  // to one is intercepted and lands on the guidance/deny path downstream.
  if (/\$\(|`|<\(/.test(cmd) && touchesMemory(cmd)) return true;

  const stages = parseBashTokens(stripHeredocBodies(cmd));

  for (const stage of stages) {
    if (stage.length === 0) continue;
    const program = stage[0].replace(/^["']|["']$/g, "");

    // A redirection on a memory path is a real interaction regardless of the
    // command: `>`/`>>` writes (the documented `echo '<content>' > '<path>'`
    // path), `<` reads (`claude -p 'summarize' < '<path>'`) — always intercept.
    for (let i = 0; i < stage.length; i++) {
      if ((stage[i] === ">" || stage[i] === ">>" || stage[i] === "<")
          && i + 1 < stage.length && touchesMemory(stage[i + 1])) {
        return true;
      }
    }

    // echo/printf/claude with the path as inert text → skip this stage
    // (substitution smuggling is already handled above).
    if (PASSTHROUGH_COMMANDS.has(program)) {
      continue;
    }

    // Default (builtins, interpreters, fetchers, anything else): a memory path
    // in ANY token is a real interaction → intercept. getShellCommand()/isSafe()
    // decide route-to-VFS vs retry-guidance downstream.
    for (const token of stage) {
      if (touchesMemory(token)) return true;
    }
  }
  return false;
}
