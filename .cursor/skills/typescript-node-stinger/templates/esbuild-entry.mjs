// Snippet: adding a bundle entry to esbuild.config.mjs.
//
// The real config lives at esbuild.config.mjs in the repo root and builds one
// output dir per harness. This shows the shape of (a) the version `define`
// that single-sources the version into bundles, and (b) an entry-point list +
// build() call. See guides/04-esbuild-bundling.md and examples/08.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

// Single source of truth for the version: package.json. esbuild `define`
// inlines it so bundles never read package.json at runtime, and never hardcode
// a version string anywhere in src/.
const hivemindVersion = JSON.parse(readFileSync("package.json", "utf-8")).version;

// One harness's entry-point list. `entry` is the tsc output under dist/;
// `out` is the bundle-relative output name.
const ccHooks = [
  { entry: "dist/src/hooks/session-start.js", out: "session-start" },
  { entry: "dist/src/hooks/capture.js", out: "capture" },
  // Add your new hook/worker here:
  { entry: "dist/src/hooks/my-hook.js", out: "my-hook" },
];

await build({
  entryPoints: Object.fromEntries(ccHooks.map((h) => [h.out, h.entry])),
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "harnesses/claude-code/bundle",
  // Externalize node builtins, native addons, and optional deps so esbuild
  // does not try to bundle a .node binary. Add new native/optional deps here.
  external: ["node:*", "deeplake", "@huggingface/transformers", "tree-sitter", "tree-sitter-*"],
  define: {
    // Any reference compiled against this is replaced with the literal version.
    "process.env.HIVEMIND_VERSION": JSON.stringify(hivemindVersion),
  },
});
