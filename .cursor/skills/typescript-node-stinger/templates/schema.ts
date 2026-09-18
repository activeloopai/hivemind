// Canonical zod boundary-validation module for the Hivemind app.
//
// Rule: validate every external boundary - parsed JSON, env, file contents,
// third-party API responses - with zod at entry, then let the inferred type
// flow inward. See guides/12-strict-types-and-zod.md.
//
// IMPORTANT: the app uses `zod ^4` (import from "zod"). The MCP server is the
// one place that imports `zod/v3` (to match the MCP SDK's inputSchema
// inference). Do not import "zod/v3" here, and do not import "zod" inside the
// MCP inputSchema path.
import { z } from "zod";

/** Credentials + endpoint config, read once from env/user-config. */
export const HivemindConfigSchema = z.object({
  apiUrl: z.string().url(),
  workspaceId: z.string().min(1),
  orgId: z.string().min(1),
  // Token is required to reach Deep Lake. Never hardcode it; never log it.
  token: z.string().min(1),
});
export type HivemindConfig = z.infer<typeof HivemindConfigSchema>;

/** Shape of a memory row as read back from Deep Lake (mirror deeplake-schema.ts). */
export const MemoryRowSchema = z.object({
  path: z.string(),
  summary: z.string().default(""),
  project: z.string().default(""),
  last_update_date: z.string().default(""),
});
export type MemoryRow = z.infer<typeof MemoryRowSchema>;

/**
 * Parse untrusted JSON at a boundary. Throws (with a readable zod error) on
 * bad input - which is what you want at entry. For a soft path, use
 * `.safeParse` and branch on `.success`.
 */
export function parseConfig(raw: string): HivemindConfig {
  return HivemindConfigSchema.parse(JSON.parse(raw));
}

/** Validate a batch of rows, dropping anything malformed with a logged reason. */
export function parseMemoryRows(rows: unknown[]): MemoryRow[] {
  const out: MemoryRow[] = [];
  for (const row of rows) {
    const result = MemoryRowSchema.safeParse(row);
    if (result.success) out.push(result.data);
    // else: skip; surface a counted warning at the call site if it matters.
  }
  return out;
}
