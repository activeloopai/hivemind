import {
  isHomeRoot,
  shouldPromptDocsSetup
} from "./chunk-PPCK3RF2.js";

// dist/src/docs/install-docs.js
async function runInstallDocsOnboarding(d) {
  let inGitRepo = false;
  let repoRoot = d.cwd;
  try {
    const top = d.gitTopLevel(d.cwd);
    inGitRepo = top !== null;
    repoRoot = top ?? d.cwd;
  } catch {
  }
  const prompt = shouldPromptDocsSetup({
    interactive: d.interactive,
    inGitRepo,
    loggedIn: d.loggedIn,
    atHome: isHomeRoot(repoRoot, d.home)
  });
  if (!prompt) {
    d.showHint();
    return { kind: "hint" };
  }
  try {
    const cfg = d.loadCfg();
    if (!cfg)
      return { kind: "noop" };
    if (d.autoEnabled(cfg.orgId, repoRoot)) {
      d.log("");
      await d.buildGraph(repoRoot);
      d.log("Docs auto-sync is on for this repo \u2014 refreshing in the background. See: hivemind docs list");
      return { kind: "already-enabled", root: repoRoot };
    }
    d.log("");
    d.log("Docs (optional): set up documentation for this repository.");
    await d.buildGraph(repoRoot);
    const result = await d.onboard({ root: repoRoot, orgId: cfg.orgId, orgName: cfg.orgName });
    if (!result.generate)
      return { kind: "declined" };
    if (d.spawn(["docs", "wiki", "--cwd", repoRoot])) {
      d.log("Generating wiki docs in the background \u2014 check with: hivemind docs list");
      return { kind: "spawned", root: repoRoot };
    }
    d.log("Run `hivemind docs wiki` to generate the corpus.");
    return { kind: "no-entry", root: repoRoot };
  } catch (err) {
    d.warn(`docs setup skipped: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: "noop" };
  }
}
export {
  runInstallDocsOnboarding
};
