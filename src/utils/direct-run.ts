import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

function canonical(path: string): string {
  const resolved = resolve(path);
  try { return realpathSync.native(resolved); } catch { return resolved; }
}

export function isDirectRun(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;

  try {
    return canonical(fileURLToPath(metaUrl)) === canonical(entry);
  } catch {
    return false;
  }
}
