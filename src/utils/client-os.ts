/**
 * X-Hivemind-OS header helper.
 *
 * The deeplake-api backend records the client OS on the signup analytics
 * events and forwards it to the marketing CRM, so "did this lead install on
 * Windows?" has an answer. `process.platform` is the only truthful source:
 * the server would see its own GOOS, and the CLI's HTTP client sends no OS
 * token in its User-Agent.
 *
 * Normalized here rather than server-side so PostHog and the CRM share one
 * vocabulary and neither has to guess at Node's platform names. Platforms we
 * do not ship an installer for omit the header entirely — an absent property
 * is more honest than a bucket named "other", and it matches how the
 * install-id header degrades.
 *
 * Header, not a dimension on X-Deeplake-Client: that header's value is a
 * parsed contract (product, optionally product/version) and overloading it
 * would break ParseClientHeader on the backend.
 */

export const HIVEMIND_OS_HEADER = "X-Hivemind-OS";

// Node platform -> the vocabulary the backend allowlists. Deliberately only
// the three we publish install routes for (hivemind.sh, hivemind.ps1).
const OS_NAMES: Record<string, string> = {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
};

/** Returns "macos" | "windows" | "linux", or "" on any other platform. */
export function hivemindOsValue(): string {
  return OS_NAMES[process.platform] ?? "";
}

/**
 * Returns `{ "X-Hivemind-OS": "<os>" }` for spreading into a headers object,
 * or `{}` on a platform we do not ship for. Same shape and same
 * never-throws contract as deeplakeClientHeader() / hivemindInstallIDHeader().
 */
export function hivemindOsHeader(): Record<string, string> {
  const os = hivemindOsValue();
  if (!os) return {};
  return { [HIVEMIND_OS_HEADER]: os };
}
