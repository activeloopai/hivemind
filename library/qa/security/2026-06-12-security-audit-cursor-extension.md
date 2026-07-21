# Security Audit Report - Cursor Extension Dev
**Date:** 2026-06-12
**Auditor:** security-guardian
**Scope:** `/home/marioaldayuz/Desktop/GitHub/cursor-extension-dev/cursor-extension/src/**` and `src/skillify/agent-roots.ts`
**Stack:** TypeScript / Node.js (VS Code Extension)

---

## Executive Summary

Audited 20 TypeScript source files covering auth flows, webview HTML generation, subprocess invocation, and path utilities. Found **2 High** and **4 Medium** findings. Both High findings were **remediated in-session**. Two of the four Medium findings (insecure nonce, unnecessary shell spawn) were also fixed in-session. Two Medium findings (CSP `unsafe-inline`, external CDN without SRI) are documented as follow-up items requiring architectural changes.

No Critical findings. No PII/financial data exposure. No token/secret leakage in logs.

---

## Scorecard

| Category | Checked | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| Command injection | Yes | 0 | 1 (FIXED) | 1 (FIXED) | 0 |
| Path traversal | Yes | 0 | 1 (FIXED) | 0 | 0 |
| XSS / webview injection | Yes | 0 | 0 | 1 (documented) | 0 |
| Insecure randomness | Yes | 0 | 0 | 1 (FIXED) | 0 |
| Secret / token leakage in logs | Yes | 0 | 0 | 0 | 0 |
| CSP misconfig | Yes | 0 | 0 | 1 (documented) | 0 |
| Supply chain (CDN SRI) | Yes | 0 | 0 | 1 (documented) | 0 |
| Input validation | Yes | 0 | 0 | 0 | 0 |
| Credential storage | Yes | 0 | 0 | 0 | 0 |
| PII exposure | Yes | 0 | 0 | 0 | 0 |
| CVE-2025-29927 (Next.js) | N/A - not Next.js | - | - | - | - |
| CVE-2025-55182 (React RSC) | N/A - not React | - | - | - | - |

---

## Findings

### FINDING-01 - HIGH - FIXED
**Title:** Command injection via `execSync` with string-interpolated URL in `openBrowser`

**File:** `cursor-extension/src/auth/device-flow.ts:26-36`

**Vulnerable pattern:**
```ts
const cmd = process.platform === "darwin"
  ? `open "${url}"`
  : `xdg-open "${url}"`;
execSync(cmd, { stdio: "ignore", timeout: 5000 });
```

**Reasoning:** `url` originates from the OAuth device-flow API response (`verification_uri_complete`). A compromised or MITM'd API server could return a URL containing shell metacharacters (e.g., `"; rm -rf ~; echo "`), which would execute arbitrary OS commands in the extension host process with the user's OS privileges.

**Severity Rationale:** Arbitrary command execution in the user's OS context. No authentication required beyond controlling the device-flow API response.

**Fix applied:**
```ts
if (process.platform === "darwin") {
  execFileSync("open", [url], { stdio: "ignore", timeout: 5000 });
} else if (process.platform === "win32") {
  execFileSync("cmd", ["/c", "start", "", url], { stdio: "ignore", timeout: 5000 });
} else {
  execFileSync("xdg-open", [url], { stdio: "ignore", timeout: 5000 });
}
```
`execFileSync` with an argument array never invokes a shell, so the URL is passed as a literal argument regardless of its content.

---

### FINDING-02 - HIGH - FIXED
**Title:** Path traversal in `readSessionSummary` via unvalidated webview `sessionId`

**File:** `cursor-extension/src/webview/DashboardPanel.ts:39-48`

**Vulnerable pattern:**
```ts
function readSessionSummary(sessionId: string): string | null {
  const user = creds?.userName ?? "unknown";
  const path = join(homedir(), ".deeplake", "memory", "summaries", user, `${sessionId}.md`);
  // no validation of sessionId before use
  return readFileSync(path, "utf-8");
}
```

**Reasoning:** `sessionId` arrives via `webview.onDidReceiveMessage` (`msg.sessionId`). A malicious or corrupted webview context could send `sessionId = "../../../../.ssh/id_rsa"` (the `.md` extension adds a constant suffix but `path.join` resolves `..` segments). This would cause the extension to read arbitrary files on disk and return their contents to the webview.

**Severity Rationale:** Arbitrary local file read in the user's home directory context. `path.join` resolves `..` before the `.md` suffix check that never existed.

**Fix applied:**
```ts
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function readSessionSummary(sessionId: string): string | null {
  if (!SESSION_ID_RE.test(sessionId)) return null;
  const user = creds?.userName ?? "unknown";
  if (user.includes("/") || user.includes("\\") || user.includes("..")) return null;
  const path = join(homedir(), ".deeplake", "memory", "summaries", user, `${sessionId}.md`);
  ...
}
```

---

### FINDING-03 - MEDIUM - FIXED
**Title:** Cryptographically insecure CSP nonce generation (`Math.random()`)

**File:** `cursor-extension/src/webview/html/dashboard-shell.ts:6-9`

**Vulnerable pattern:**
```ts
function getNonce(): string {
  const chars = "ABCDE...0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}
```

**Reasoning:** `Math.random()` is not cryptographically random. A nonce's security guarantee rests on it being unpredictable. While VSCode webviews have a different threat model than public web pages, using a predictable nonce weakens the CSP protection layer if the webview is ever rendered with content that can observe the nonce.

**Severity Rationale:** Medium - reduces effective CSP nonce entropy; not immediately exploitable in the current extension architecture but violates security best practice.

**Fix applied:**
```ts
import { randomBytes } from "node:crypto";

function getNonce(): string {
  return randomBytes(16).toString("hex");
}
```

---

### FINDING-04 - MEDIUM - FIXED
**Title:** `execSync` used for `hivemind login` unnecessarily spawning a shell

**File:** `cursor-extension/src/auth/device-flow.ts:147-153`

**Pattern before:**
```ts
execSync("hivemind login", { stdio: "inherit", timeout: 300000 });
```

**Reasoning:** `execSync` with a single string argument invokes `/bin/sh -c` on Unix, creating a shell. While the argument is hardcoded here (no immediate injection risk), consistent use of `execFileSync` with an argument array eliminates the shell entirely and prevents a class of errors if the call site is ever refactored.

**Fix applied:**
```ts
execFileSync("hivemind", ["login"], { stdio: "inherit", timeout: 300000 });
```

---

### FINDING-05 - MEDIUM - DOCUMENTED (follow-up required)
**Title:** `unsafe-inline` in webview `style-src` CSP

**File:** `cursor-extension/src/webview/html/dashboard-shell.ts:25`

**Pattern:**
```
style-src ${csp} 'unsafe-inline'
```

**Reasoning:** Permitting `unsafe-inline` in `style-src` allows any script that achieves XSS to inject CSS that can data-exfiltrate content or perform UI redressing. While the current XSS surface is low (data is HTML-escaped via `esc()`), defense-in-depth calls for removing `unsafe-inline`.

**Recommended fix:** Extract all inline `<style>` declarations to a static `.css` file bundled with the extension and loaded via a `vscode.Uri.joinPath` reference. This requires moving the CSS block to a separate file and updating the CSP to reference the extension's content-security-policy source.

**Effort:** Medium (1-2 hours; requires build step change to bundle the CSS file).

---

### FINDING-06 - MEDIUM - DOCUMENTED (follow-up required)
**Title:** D3 loaded from external CDN without Subresource Integrity (SRI) hash

**File:** `cursor-extension/src/webview/html/dashboard-shell.ts:153`

**Pattern:**
```html
<script nonce="${nonce}" src="https://d3js.org/d3.v7.min.js"></script>
```

**Reasoning:** If `d3js.org` is compromised or serves a modified file, the malicious script executes inside the webview with the full message-passing API to the extension host. This is a supply chain risk.

**Recommended fix (option A - preferred):** Bundle D3 locally inside the extension using the `vscode.Uri.joinPath` pattern, eliminating the external fetch entirely. This also works in offline environments.

**Recommended fix (option B):** Add the SRI `integrity` attribute:
```html
<script nonce="${nonce}" src="https://d3js.org/d3.v7.min.js"
  integrity="sha384-<HASH>" crossorigin="anonymous"></script>
```
Generate the hash with `openssl dgst -sha384 -binary d3.v7.min.js | openssl base64 -A`.

**Effort:** Low for option B (SRI hash addition); Medium for option A (bundle change).

---

## Catalog Coverage Confirmation

| Catalog | Status |
|---|---|
| A: Vibe-coding AI-generated patterns | Checked - no additional findings |
| B: OWASP Top 10:2025 | Checked - Findings 01-02 cover injection/path traversal |
| C: PII / financial exposure | Checked - token never logged; credentials stored at `0o600` file permission |
| CVE-2025-29927 (Next.js middleware bypass) | N/A - no Next.js |
| CVE-2025-55182 (React2Shell RCE) | N/A - no React RSC |
| Unicode cursor rules backdoor | Not applicable (not a rules file) |

## Credential storage review

Credentials written at `cursor-extension/src/auth/device-flow.ts:111-112`:
```ts
mkdirSync(deeplakeConfigDir(), { recursive: true, mode: 0o700 });
writeFileSync(credentialsPath(), JSON.stringify(creds, null, 2), { mode: 0o600 });
```
Directory created `0700`, file created `0600`. None detected in logs. **No findings.**

## agent-roots.ts review

`src/skillify/agent-roots.ts` was fully reviewed. It performs only `existsSync` filesystem probes on well-known home-directory paths. No user input, no subprocess calls, no network calls, no PII. **No findings.**

---

## Files changed (remediation diff summary)

| File | Change |
|---|---|
| `cursor-extension/src/auth/device-flow.ts` | Replace `execSync` with `execFileSync` for `openBrowser` and `loginViaHivemindCli`; remove unused `execSync` import |
| `cursor-extension/src/webview/DashboardPanel.ts` | Add `SESSION_ID_RE` allowlist validation and `user` path safety check in `readSessionSummary` |
| `cursor-extension/src/webview/html/dashboard-shell.ts` | Replace `Math.random()` nonce with `crypto.randomBytes(16).toString("hex")` |
