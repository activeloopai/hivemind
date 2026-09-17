import { existsSync, copyFileSync, rmSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { HOME, pkgRoot, ensureDir, syncDir, writeVersionStamp, log, warn, symlinkForce, reportPruned } from "./util.js";
import { getVersion } from "./version.js";
import { ensureHivemindAllowlisted } from "../../harnesses/openclaw/src/setup-config.js";

const PLUGIN_DIR = join(HOME, ".openclaw", "extensions", "hivemind");

export function installOpenclaw(): void {
  const srcDist = join(pkgRoot(), "harnesses", "openclaw", "dist");
  const srcManifest = join(pkgRoot(), "harnesses", "openclaw", "openclaw.plugin.json");
  const srcPkg = join(pkgRoot(), "harnesses", "openclaw", "package.json");
  const srcSkills = join(pkgRoot(), "harnesses", "openclaw", "skills");

  if (!existsSync(srcDist)) {
    throw new Error(`OpenClaw bundle missing at ${srcDist}. Run 'npm run build' first.`);
  }

  ensureDir(PLUGIN_DIR);
  // syncDir drops orphans from a previous install (a renamed chunk such as
  // the single-L `skilify-worker.js` from before #116 would otherwise sit
  // next to the new one and re-introduce ClawHub static-scan findings).
  reportPruned("OpenClaw", syncDir(srcDist, join(PLUGIN_DIR, "dist")));
  // syncDir is for directories. Use copyFileSync for individual files so a
  // directory at the destination path can never swallow the file.
  if (existsSync(srcManifest)) copyFileSync(srcManifest, join(PLUGIN_DIR, "openclaw.plugin.json"));
  if (existsSync(srcPkg)) copyFileSync(srcPkg, join(PLUGIN_DIR, "package.json"));
  if (existsSync(srcSkills)) reportPruned("OpenClaw", syncDir(srcSkills, join(PLUGIN_DIR, "skills")));

  // Graph workers (graph-on-stop / graph-pull-worker) externalize tree-sitter
  // native addons — link embed-deps so builds can resolve them at runtime.
  const pluginNm = join(PLUGIN_DIR, "node_modules");
  const embedDepsNm = join(HOME, ".hivemind", "embed-deps", "node_modules");
  if (existsSync(embedDepsNm)) {
    try { const st = lstatSync(pluginNm); if (st.isDirectory() && !st.isSymbolicLink()) rmSync(pluginNm, { recursive: true }); } catch { /* ok */ }
    symlinkForce(embedDepsNm, pluginNm);
  } else {
    warn(
      `  OpenClaw       graph workers need tree-sitter native deps at ${embedDepsNm} — ` +
      "run `hivemind embeddings install`, then `hivemind claw install` again",
    );
  }

  writeVersionStamp(PLUGIN_DIR, getVersion());
  log(`  OpenClaw       installed -> ${PLUGIN_DIR}`);

  // Patch ~/.openclaw/openclaw.json so the gateway actually loads us.
  // Without this, plugins.allow gates the plugin out — the files land
  // on disk but the loader never registers them, so `/hivemind_setup`
  // is unreachable from inside the agent (chicken-and-egg). The same
  // helper is shared with the slash command, so behavior stays
  // identical across both surfaces. See issue #121.
  //
  // Safe-by-default: if openclaw.json doesn't exist (gateway never
  // started) or is malformed, we skip silently. If plugins.allow is
  // absent/empty (default-allow), we leave it alone — only patch
  // explicit allowlists so we never flip the user into restrictive
  // mode and break their other plugins.
  const result = ensureHivemindAllowlisted();
  if (result.status === "added") {
    const touched: string[] = [];
    if (result.delta.pluginsAllow) touched.push("plugins.allow");
    if (result.delta.toolsAlsoAllow) touched.push("tools.alsoAllow");
    log(`  OpenClaw       patched ${touched.join(" + ")} in ${result.configPath}`);
    log(`  OpenClaw       backup: ${result.backupPath}`);
    log(`  OpenClaw       restart the gateway to activate: systemctl --user restart openclaw-gateway.service`);
    log(`  OpenClaw       capture starts on the NEXT turn — earlier turns are NOT backfilled`);
  } else if (result.status === "already-set") {
    log(`  OpenClaw       allowlist already covers hivemind in ${result.configPath}`);
  } else if (result.status === "error") {
    // "openclaw config file not found" is the common no-op case (gateway
    // never started). Log it at info-level — installer is non-fatal, the
    // /hivemind_setup slash command will patch on first openclaw run.
    // Other errors (malformed JSON, write failure) are user-actionable
    // and get a warn so they're visible. CodeRabbit on #124 caught the
    // previous silent-error path.
    if (result.error === "openclaw config file not found") {
      log(`  OpenClaw       openclaw.json not present at ${result.configPath} — run openclaw once, then \`hivemind claw install\` again`);
    } else {
      warn(`  OpenClaw       could not patch allowlist in ${result.configPath}: ${result.error}`);
    }
  }
}

export function uninstallOpenclaw(): void {
  if (existsSync(PLUGIN_DIR)) {
    rmSync(PLUGIN_DIR, { recursive: true, force: true });
    log(`  OpenClaw       removed ${PLUGIN_DIR}`);
  } else {
    log(`  OpenClaw       nothing to remove`);
  }
}
