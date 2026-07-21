/**
 * Secret redaction for captured session content.
 *
 * Hivemind captures prompts, tool inputs, tool outputs and assistant messages
 * and persists/embeds them. Those payloads routinely contain credentials —
 * a Bash `export GITHUB_TOKEN=…`, an `Authorization: Bearer …` header echoed
 * by curl, a connection string with an inline password, or an API response
 * carrying a fresh access token. We mask those with stars BEFORE the text is
 * embedded or written to the store, so a leaked secret never lands in the
 * vector or the row.
 *
 * Coverage is layered, most-specific first:
 *   1. Private-key blocks (PEM / OpenSSH).
 *   2. ~30 known provider token schemes (keep the scheme prefix as a hint).
 *   3. Structured secrets: Authorization headers, bare Bearer, URL basic-auth,
 *      Sentry DSN, Slack webhooks.
 *   4. Generic `KEY=VALUE` / `"key":"value"` where KEY is a secret-ish word.
 *   5. High-entropy backstop: a bare, unlabeled, random-looking token with no
 *      known prefix (e.g. an AWS secret access key, a raw API key in JSON).
 *
 * Design:
 *   - Fixed-length mask (`MASK`) — never reveal the secret's length.
 *   - Keep a NON-secret hint where useful: the scheme prefix of a known token
 *     (`ghp_********`) or the key name of an assignment (`password=********`).
 *   - Precision guards on the generic/entropy layers so we don't mask
 *     look-alikes (`tokenizer`, `max_tokens`), UUIDs, git SHAs, hashes, or
 *     literal `true/false/null`.
 *   - Pure, dependency-free, idempotent, and star-safe: replacements introduce
 *     only `*` and kept literal prefixes, so running this over a serialized
 *     JSON string keeps the JSON parseable.
 */

const MASK = "********";

interface Rule {
  re: RegExp;
  replace: string | ((match: string, ...groups: string[]) => string);
}

/** Shannon entropy in bits per character. */
function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Does a bare token look like a random secret? Deliberately conservative so
 * the entropy backstop doesn't shred ordinary identifiers in a trace.
 */
function looksLikeSecret(tok: string): boolean {
  if (tok.length < 24) return false;
  if (/^\d+$/.test(tok)) return false; // pure number
  if (/^[0-9a-f]+$/i.test(tok)) return false; // hex hash / git SHA / md5
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tok)) return false; // UUID
  // Provider model identifiers (e.g. claude-haiku-4-5-20251001, gpt-5.6-sol,
  // qwen2.5-coder-32b-instruct, us.anthropic.claude-3-5-sonnet-20241022-v2) —
  // a long dated slug can otherwise trip the entropy check, and these are
  // captured into every trace row's `model` field, so shredding them would
  // break per-model usage rollups. Kept safe by two invariants that a random
  // secret can't satisfy: lowercase only (random keys mix case) and every
  // dot/dash segment capped at 12 chars (so no 24+ high-entropy run fits).
  // Within those bounds we allow optional cloud/region prefixes (Bedrock etc.),
  // a digit fused to the family (`qwen2`, `llama3`), and short version segments.
  if (
    /^(?:(?:us|eu|apac|anthropic|amazon|bedrock|cohere|meta|mistral|google)\.)*(?:claude|gpt|o[1-9]|gemini|gemma|codex|text-embedding|dall-e|whisper|grok|deepseek|kimi|llama|mixtral|qwen|phi)[0-9]?(?:[._-][a-z0-9]{1,12})*$/.test(
      tok,
    )
  )
    return false;
  // Require a mix of character classes — random keys blend cases/digits, while
  // English words, dotted versions and snake_case identifiers do not.
  const classes =
    (/[a-z]/.test(tok) ? 1 : 0) + (/[A-Z]/.test(tok) ? 1 : 0) + (/[0-9]/.test(tok) ? 1 : 0);
  if (classes < 2) return false;
  return shannonEntropy(tok) >= 3.5;
}

// Secret-ish key names for the generic assignment rule. Ordered longest-first.
const SECRET_KEY_WORDS = [
  "aws[_-]?secret[_-]?access[_-]?key",
  "secret[_-]?access[_-]?key",
  "client[_-]?secret",
  "access[_-]?key[_-]?id",
  "encryption[_-]?key",
  "connection[_-]?string",
  "private[_-]?key",
  "secret[_-]?key",
  "access[_-]?key",
  "auth[_-]?token",
  "refresh[_-]?token",
  "access[_-]?token",
  "session[_-]?key",
  "account[_-]?key",
  "id[_-]?token",
  "api[_-]?key",
  "app[_-]?key",
  "pgpassword",
  "passphrase",
  "password",
  "passwd",
  "credentials?",
  "signature",
  "secret",
  "token",
  "apikey",
].join("|");

// Values that are never secrets — keep configs like `secret: false` readable.
const NON_SECRET_VALUE = /^(true|false|null|none|undefined|nil|""|''|\{\}|\[\])$/i;

const RULES: Rule[] = [
  // ── 1. Private key blocks ────────────────────────────────────────────────
  {
    re: /(-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----)/g,
    replace: `$1${MASK}$2`,
  },

  // ── 2. Known provider token schemes — keep the scheme prefix ─────────────
  // GitHub (classic / oauth / user / server / refresh, fine-grained PAT).
  { re: /(github_pat_)[A-Za-z0-9_]{20,}/g, replace: `$1${MASK}` },
  { re: /(gh[pousr]_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  // OpenAI / Anthropic (sk-, sk-ant-, sk-proj-).
  { re: /(sk-(?:ant-|proj-)?)[A-Za-z0-9_-]{16,}/g, replace: `$1${MASK}` },
  // Stripe secret / restricted / webhook.
  { re: /((?:sk|rk)_(?:live|test)_)[A-Za-z0-9]{16,}/g, replace: `$1${MASK}` },
  { re: /(whsec_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  // Slack (bot/user/app tokens).
  { re: /(xox[baprse]-)[A-Za-z0-9-]{8,}/g, replace: `$1${MASK}` },
  { re: /(xapp-)[A-Za-z0-9-]{8,}/g, replace: `$1${MASK}` },
  // AWS access key ids (the secret access key is caught by the entropy layer).
  { re: /((?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA)[A-Z0-9]{16})/g, replace: (_m, p1) => `${(p1 as string).slice(0, 4)}${MASK}` },
  // Google API key + OAuth access token.
  { re: /(AIza)[A-Za-z0-9_-]{30,}/g, replace: `$1${MASK}` },
  { re: /(ya29\.)[A-Za-z0-9_-]{20,}/g, replace: `$1${MASK}` },
  // HuggingFace, GitLab, npm, PyPI.
  { re: /(hf_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /(glpat-)[A-Za-z0-9_-]{18,}/g, replace: `$1${MASK}` },
  { re: /(npm_)[A-Za-z0-9]{30,}/g, replace: `$1${MASK}` },
  { re: /(pypi-)[A-Za-z0-9_-]{40,}/g, replace: `$1${MASK}` },
  // Shopify, DigitalOcean, Doppler, Databricks, Linear, Postman.
  { re: /(shp(?:at|ss|ca|pa)_)[a-fA-F0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /((?:dop|doo|dor)_v1_)[a-f0-9]{40,}/g, replace: `$1${MASK}` },
  { re: /(dp\.pt\.)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /(dapi)[a-f0-9]{28,}/g, replace: `$1${MASK}` },
  { re: /(lin_api_)[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  { re: /(PMAK-)[a-f0-9]{20,}-[a-f0-9]{20,}/g, replace: `$1${MASK}` },
  // SendGrid, Atlassian, Notion, Groq, xAI, Replicate, Mailgun, Telegram bot.
  { re: /(SG\.)[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, replace: `$1${MASK}` },
  { re: /(ATATT)[A-Za-z0-9_\-=]{20,}/g, replace: `$1${MASK}` },
  { re: /((?:secret_|ntn_))[A-Za-z0-9]{40,}/g, replace: `$1${MASK}` },
  { re: /(gsk_)[A-Za-z0-9]{40,}/g, replace: `$1${MASK}` },
  { re: /(xai-)[A-Za-z0-9]{60,}/g, replace: `$1${MASK}` },
  { re: /(r8_)[A-Za-z0-9]{30,}/g, replace: `$1${MASK}` },
  { re: /(key-)[a-f0-9]{32}/g, replace: `$1${MASK}` },
  { re: /\b(\d{8,10}:AA)[A-Za-z0-9_-]{30,}/g, replace: `$1${MASK}` },
  // JWTs — three base64url segments; mask entirely.
  { re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, replace: MASK },

  // ── 3. Structured secrets ────────────────────────────────────────────────
  // DSN-style credential — a long hex key sitting in the userinfo of a URL
  // (`https://<hexkey>@host/…`, e.g. a Sentry DSN). Matched structurally (no
  // hostname literal) so it stays host-agnostic and doesn't trip URL linters.
  { re: /(https?:\/\/)[a-f0-9]{32,}(@)/gi, replace: `$1${MASK}$2` },
  // Slack incoming webhook — match the distinctive `/services/T…/B…/<token>`
  // path (the secret) rather than the hostname literal, so it's host-agnostic
  // and doesn't trip URL-anchoring linters.
  { re: /(\/services\/)T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,}/g, replace: `$1${MASK}` },
  // Authorization / Proxy-Authorization headers.
  {
    re: /((?:proxy-)?authorization["']?\s*[:=]\s*["']?(?:bearer|basic|token|digest)\s+)([A-Za-z0-9._~+/=-]{8,})/gi,
    replace: `$1${MASK}`,
  },
  // Bare `Bearer <token>`.
  { re: /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{12,})/g, replace: `$1${MASK}` },
  // Credentials embedded in a URL: `scheme://user:password@host`.
  { re: /([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s:/@]+)(@)/gi, replace: `$1${MASK}$3` },

  // ── 4. Generic labeled assignments ───────────────────────────────────────
  {
    re: new RegExp(
      `((?:${SECRET_KEY_WORDS})(?![A-Za-z0-9])["']?\\s*[:=]\\s*["']?)([^\\s"',;{}()\\[\\]]{1,})`,
      "gi",
    ),
    replace: (match, keep: string, value: string) =>
      NON_SECRET_VALUE.test(value) ? match : `${keep}${MASK}`,
  },
  // CLI-flag form: `--password VALUE` / `-p=VALUE`.
  {
    re: /(--?(?:password|passwd|pwd|token|secret|api[_-]?key)[\s=]+)(["']?)([^\s"']{1,})/gi,
    replace: (match, keep: string, quote: string, value: string) =>
      NON_SECRET_VALUE.test(value) ? match : `${keep}${quote}${MASK}`,
  },

  // ── 5. High-entropy backstop for bare, unlabeled secrets ─────────────────
  // A random-looking token with no known prefix and no labeling key (e.g. an
  // AWS secret access key, a raw key echoed in JSON). `/`, `=` and `+` are
  // excluded from the candidate charset so file paths, base64 data blobs and
  // `key=value` assignments break into short segments — keeping the value
  // (a UUID, a decimal, a hash) separate from its label instead of gluing them
  // into one high-entropy blob.
  {
    re: /[A-Za-z0-9_.-]{24,}/g,
    replace: (m) => (looksLikeSecret(m) ? MASK : m),
  },
];

/**
 * Mask tokens, passwords, API keys and other secrets in `text` with stars.
 * Returns the input unchanged when it contains no recognized secret. Safe to
 * run on a serialized JSON string (introduces only `*` and kept literals).
 */
export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, rule.replace as string);
  }
  return out;
}
