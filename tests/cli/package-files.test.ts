import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every payload directory an installer reads from pkgRoot() must be listed in
 * package.json `files`, or the published package silently installs nothing
 * from it. harnesses/pi/bundle was missing for every release up to 0.7.159:
 * the pi installer guards the copy with existsSync, so npm users got no
 * wiki / skillify / autopull workers and never saw an error.
 */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as { files: string[] };
const installers = ["install-codex", "install-cursor", "install-hermes", "install-openclaw", "install-pi", "install-mcp-shared"]
  .map(f => readFileSync(join(ROOT, "src", "cli", `${f}.ts`), "utf-8"))
  .join("\n");

describe("package.json files covers every installer payload", () => {
  // join(pkgRoot(), "a", "b", ...) -> "a/b/..." (a directory or a single file).
  const payloads = [...installers.matchAll(/join\(pkgRoot\(\),\s*((?:"[^"]+",?\s*)+)\)/g)]
    .map(m => m[1].match(/"([^"]+)"/g)!.map(s => s.slice(1, -1)).join("/"))
    .filter((d, i, all) => all.indexOf(d) === i);

  it("finds the payloads the installers read", () => {
    expect(payloads).toEqual(expect.arrayContaining([
      "harnesses/codex/bundle", "harnesses/hermes/bundle", "harnesses/hermes/skills",
      "harnesses/pi/bundle", "harnesses/pi/extension-source/hivemind.ts", "harnesses/openclaw/dist", "mcp/bundle",
    ]));
  });

  it.each(payloads)("%s is shipped", (payload) => {
    expect(pkg.files.some(f => payload === f || payload.startsWith(`${f}/`))).toBe(true);
  });
});
