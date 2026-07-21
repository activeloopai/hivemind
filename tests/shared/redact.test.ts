import { describe, it, expect } from "vitest";
import { redactSecrets } from "../../src/hooks/shared/redact.js";

const MASK = "********";

// Build fixture secrets from split literals at runtime so the *source* never
// contains a scannable vendor token (GitHub push protection / secret scanning
// would otherwise block this very file). The redactor still sees the full
// assembled string.
const j = (...parts: string[]): string => parts.join("");

describe("redactSecrets — known token schemes", () => {
  const cases: Array<[string, string, string]> = [
    ["GitHub classic PAT", j("ghp_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), "ghp_"],
    ["GitHub fine-grained PAT", j("github_", "pat_11ABCDE0Y0abcdefghij_KLMNOPqrstuvwxyz0123456789ABCDE"), "github_pat_"],
    ["GitHub oauth token", j("gho_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), "gho_"],
    ["OpenAI sk key", j("sk-", "ABCDEFGHIJKLMNOPQRSTUVWX"), "sk-"],
    ["Anthropic sk-ant key", j("sk-", "ant-api03-ABCDEFGHIJKLMNOPQRSTUV_wx"), "sk-ant-"],
    ["Stripe live secret", j("sk_", "live_ABCDEFGHIJKLMNOPQRSTUVWX"), "sk_live_"],
    ["Slack bot token", j("xoxb", "-1234567890-abcdefghijABCDEF"), "xoxb-"],
    ["Slack app token", j("xapp", "-1-A012345-abcdef"), "xapp-"],
    ["Google API key", j("AIza", "SyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456"), "AIza"],
    ["HuggingFace token", j("hf_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123"), "hf_"],
    ["GitLab PAT", j("glpat", "-ABCDEFGHIJKLMNOPQRST"), "glpat-"],
  ];
  for (const [name, secret, keptPrefix] of cases) {
    it(`masks ${name} but keeps the scheme prefix`, () => {
      const out = redactSecrets(`the value is ${secret} ok`);
      expect(out).toContain(`${keptPrefix}${MASK}`);
      expect(out).not.toContain(secret);
    });
  }

  it("masks an AWS access key id, keeping the AKIA prefix", () => {
    const akia = j("AKIA", "IOSFODNN7EXAMPLE");
    const out = redactSecrets(`key ${akia} here`);
    expect(out).toContain(`AKIA${MASK}`);
    expect(out).not.toContain(akia);
  });

  it("masks a JWT entirely", () => {
    const jwt =
      j("eyJ", "hbGciOiJIUzI1NiJ9") + "." + j("eyJ", "zdWIiOiIxMjM0NTY3ODkwIn0") +
      ".dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const out = redactSecrets(`token=${jwt}`);
    expect(out).not.toContain(jwt);
    expect(out).toContain(MASK);
  });
});

describe("redactSecrets — headers, URLs, private keys", () => {
  it("masks an Authorization: Bearer header", () => {
    const out = redactSecrets("Authorization: Bearer abcDEF123456ghiJKL789");
    expect(out).toBe(`Authorization: Bearer ${MASK}`);
  });

  it("masks a bare Bearer token", () => {
    const out = redactSecrets("curl -H 'x' Bearer abcDEF123456ghiJKL789xyz");
    expect(out).toContain(`Bearer ${MASK}`);
    expect(out).not.toContain("abcDEF123456ghiJKL789xyz");
  });

  it("masks the password in a connection string, keeping user and host", () => {
    const out = redactSecrets("postgres://neohorizon:s3cr3tP4ss@db.internal:5432/app");
    expect(out).toBe(`postgres://neohorizon:${MASK}@db.internal:5432/app`);
  });

  it("strips a PEM private key body, keeping the markers", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234\nabcd/efgh+ijkl\n-----END RSA PRIVATE KEY-----";
    const out = redactSecrets(pem);
    expect(out).toContain("-----BEGIN RSA PRIVATE KEY-----");
    expect(out).toContain("-----END RSA PRIVATE KEY-----");
    expect(out).toContain(MASK);
    expect(out).not.toContain("MIIEpAIBAAKCAQEA1234");
  });
});

describe("redactSecrets — labeled assignments", () => {
  const forms: Array<[string, string]> = [
    ["password=hunter2horse", "password="],
    ["PASSWORD: hunter2horse", "PASSWORD:"],
    ["PGPASSWORD='hunter2horse'", "PGPASSWORD="],
    ["export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMIK7MDENGbPxRfiCY", "AWS_SECRET_ACCESS_KEY="],
    ["api_key = myS3cretValue123", "api_key ="],
    ["client_secret: aBcDeF123456", "client_secret:"],
  ];
  for (const [input, keepFragment] of forms) {
    it(`masks the value in \`${input}\``, () => {
      const out = redactSecrets(input);
      expect(out).toContain(keepFragment);
      expect(out).toContain(MASK);
      // the secret body is gone
      expect(out).not.toMatch(/hunter2horse|wJalrXUtnFEMIK7MDENGbPxRfiCY|myS3cretValue123|aBcDeF123456/);
    });
  }

  it('masks a JSON "key":"value" pair and stays valid JSON', () => {
    const json = JSON.stringify({ tool: "bash", api_key: "supersecretvalue123", note: "hi" });
    const out = redactSecrets(json);
    expect(out).not.toContain("supersecretvalue123");
    const parsed = JSON.parse(out);
    expect(parsed.api_key).toBe(MASK);
    expect(parsed.note).toBe("hi");
    expect(parsed.tool).toBe("bash");
  });

  it("masks --password CLI flag values (space and = separated)", () => {
    expect(redactSecrets("psql --password s3cretPass")).toContain(`--password ${MASK}`);
    expect(redactSecrets("mytool --token=abc123def456")).toContain(`--token=${MASK}`);
    expect(redactSecrets("psql --password s3cretPass")).not.toContain("s3cretPass");
  });
});

describe("redactSecrets — precision (no over-redaction)", () => {
  it("does not touch secret-word look-alikes", () => {
    const s = "tokenizer=gpt2 max_tokens=4096 keyboard=mechanical";
    expect(redactSecrets(s)).toBe(s);
  });

  it("leaves boolean/null secret values readable", () => {
    for (const s of ["secret: false", "token = null", "password: true", "api_key: none"]) {
      expect(redactSecrets(s)).toBe(s);
    }
  });

  it("returns non-secret text unchanged", () => {
    const s = "SELECT * FROM sessions WHERE org_id = '6a733763' LIMIT 10;";
    expect(redactSecrets(s)).toBe(s);
  });

  it("leaves a CLI flag with a boolean value alone", () => {
    expect(redactSecrets("mytool --token=false")).toBe("mytool --token=false");
  });

  it("does NOT mask a long but low-entropy repeated token", () => {
    // Mixed character classes (passes the class gate) but highly repetitive, so
    // Shannon entropy stays under the threshold — not a random secret.
    const repeated = "Ab1".repeat(10); // 30 chars, entropy ~1.58 bits/char
    expect(redactSecrets(`id ${repeated} x`)).toContain(repeated);
  });

  it("handles empty / undefined-ish input", () => {
    expect(redactSecrets("")).toBe("");
    // @ts-expect-error — defensive: real callers pass strings
    expect(redactSecrets(undefined)).toBe(undefined);
  });
});

describe("redactSecrets — extended provider coverage", () => {
  const cases: Array<[string, string, string]> = [
    ["npm token", j("npm_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab"), "npm_"],
    ["Shopify access token", j("shpat", "_0123456789abcdef0123456789abcdef"), "shpat_"],
    ["SendGrid key", j("SG.", "ABCDEFGHIJKLMNOPQRSTUV.") + "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab", "SG."],
    ["Groq key", j("gsk_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghij"), "gsk_"],
    ["xAI key", j("xai-", "A".repeat(70)), "xai-"],
    ["Notion secret", j("secret", "_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefg"), "secret_"],
    ["Stripe webhook secret", j("whsec_", "ABCDEFGHIJKLMNOPQRSTUVWX"), "whsec_"],
    ["Google OAuth access", j("ya29.", "ABCDEFGHIJKLMNOPQRSTUVWX"), "ya29."],
    ["Linear api key", j("lin_api_", "ABCDEFGHIJKLMNOPQRSTUVWX"), "lin_api_"],
    ["DigitalOcean token", j("dop_v1_", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"), "dop_v1_"],
  ];
  for (const [name, secret, keptPrefix] of cases) {
    it(`masks ${name}`, () => {
      const out = redactSecrets(`val=${secret}`);
      expect(out).toContain(keptPrefix);
      expect(out).not.toContain(secret);
      expect(out).toContain(MASK);
    });
  }

  it("masks a Telegram bot token", () => {
    const tok = j("123456789", ":AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPPqrs");
    const out = redactSecrets(`TELEGRAM=${tok}`);
    expect(out).not.toContain(tok);
    expect(out).toContain(MASK);
  });

  it("masks a Slack incoming-webhook URL path", () => {
    const url = j("https://hooks.slack.com/services/", "T00000000/B00000000/abcdefABCDEF0123456789");
    const out = redactSecrets(url);
    expect(out).toContain("hooks.slack.com/services/");
    expect(out).not.toContain("abcdefABCDEF0123456789");
    expect(out).toContain(MASK);
  });

  it("masks a Sentry DSN key, keeping the ingest host", () => {
    const dsn = j("https://", "0123456789abcdef0123456789abcdef") + "@o123.ingest.sentry.io/456";
    const out = redactSecrets(dsn);
    expect(out).toContain("@o123.ingest.sentry.io/456");
    expect(out).not.toContain("0123456789abcdef0123456789abcdef");
    expect(out).toContain(MASK);
  });
});

describe("redactSecrets — high-entropy backstop", () => {
  it("masks a bare, unlabeled random token with no known prefix", () => {
    const secret = "aB3xK9pQ2mN7vR4tW1zY6cF8dG5hJ0"; // 30 chars, mixed classes
    const out = redactSecrets(`response body: ${secret} end`);
    expect(out).not.toContain(secret);
    expect(out).toContain(MASK);
  });

  it("does NOT mask a git SHA (40 hex)", () => {
    const sha = "e94b5c716bf6622ac4d41fa513fbff9ee39fb882";
    expect(redactSecrets(`commit ${sha}`)).toContain(sha);
  });

  it("does NOT mask a UUID", () => {
    const uuid = "6a733763-1129-4656-aa1f-6f12d4b5c69d";
    expect(redactSecrets(`org_id=${uuid}`)).toContain(uuid);
  });

  it("does NOT mask a long single-case word or a filesystem path", () => {
    expect(redactSecrets("abcdefghijklmnopqrstuvwxyzabc")).toBe("abcdefghijklmnopqrstuvwxyzabc");
    const path = "/home/admin/sasun/work/deeplake-api/internal/workspaces";
    expect(redactSecrets(path)).toBe(path);
  });

  it("does NOT mask a long decimal number", () => {
    expect(redactSecrets("count=123456789012345678901234567890")).toContain("123456789012345678901234567890");
  });

  it("does NOT mask provider model identifiers (stored in trace rows)", () => {
    // These are captured into every trace row's `model` field; masking a long
    // dated slug would break per-model token rollups. Bare token in / bare
    // token out — exact, no redaction.
    for (const m of [
      "claude-haiku-4-5-20251001",
      "claude-3-5-sonnet-20241022",
      "gemini-3-flash-preview",
      "qwen2.5-coder-32b-instruct",
      "llama3.1-405b-instruct",
      "us.anthropic.claude-3-5-sonnet-20241022-v2",
    ]) {
      expect(redactSecrets(m)).toBe(m);
    }
  });

  it("STILL masks a high-entropy secret that wears a model-name prefix", () => {
    // The model-id exemption must not become a bypass: a random key with a
    // `gpt-`/`claude-` prefix has an over-long or mixed-case segment and must
    // still be redacted to exactly the mask.
    for (const s of [
      "gpt-AbCdEfGhIjKlMnOpQrStUvWxYz123456",
      "claude-Zk9QW3mLpX7vNbR2tYcH8dFgJsK4uE1a",
      "gpt-abcdefghijklmnopqrstuvwxyz0123456789",
    ]) {
      expect(redactSecrets(s)).toBe(MASK);
    }
  });
});

describe("redactSecrets — idempotency & multi-secret", () => {
  it("is idempotent", () => {
    const s = `GITHUB_TOKEN=${j("ghp_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")} and password=hunter2horse`;
    const once = redactSecrets(s);
    expect(redactSecrets(once)).toBe(once);
  });

  it("masks every secret in a multi-secret blob", () => {
    const ghToken = j("ghp_", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    const oaKey = j("sk-", "ABCDEFGHIJKLMNOPQRSTUVWX");
    const blob = [
      `export GITHUB_TOKEN=${ghToken}`,
      `export OPENAI_API_KEY=${oaKey}`,
      "psql postgres://u:p4ssw0rdX@h/db",
    ].join("\n");
    const out = redactSecrets(blob);
    expect(out).not.toContain(ghToken);
    expect(out).not.toContain(oaKey);
    expect(out).not.toContain("p4ssw0rdX");
    expect(out.match(/\*{8}/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
