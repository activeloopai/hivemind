// dist/src/docs/install-hint.js
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
function docsInstallLines() {
  return [
    "Docs (optional): keep per-file and per-subsystem documentation in sync with your code on every commit.",
    "  Enable in a repo:  hivemind docs sync    (one-time consent; opt into per-commit auto-sync when asked)",
    "  Turn it off later: hivemind docs auto off",
    "  Check status:      hivemind docs list"
  ];
}
function isHomeRoot(gitRoot, home) {
  return resolve(gitRoot) === resolve(home);
}
function shouldPromptDocsSetup(opts) {
  return opts.interactive && opts.inGitRepo && opts.loggedIn && !opts.atHome;
}
function docsHintSentinelPath() {
  return process.env.HIVEMIND_DOCS_HINT_FILE ?? join(homedir(), ".deeplake", ".docs-hint-shown");
}
function docsHintShown(file = docsHintSentinelPath()) {
  return existsSync(file);
}
function markDocsHintShown(file = docsHintSentinelPath()) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, (/* @__PURE__ */ new Date()).toISOString() + "\n");
  } catch {
  }
}

export {
  docsInstallLines,
  isHomeRoot,
  shouldPromptDocsSetup,
  docsHintShown,
  markDocsHintShown
};
