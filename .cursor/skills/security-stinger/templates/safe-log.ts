// templates/safe-log.ts
//
// Reference implementation of a token/PII-redacting logger for Hivemind. Drop
// into `src/lib/safe-log.ts` and replace every `console.log` in a sensitive path
// (the Deep Lake client, the capture hooks, the auth/credential flow) with the
// matching `safeLog.*` call. Also use `redact()` at the capture boundary before
// any INSERT into the `sessions` / `memory` tables.
//
// Rationale: guides/04-pii-and-financial.md C2 / C5 - never log or persist the
// Activeloop Bearer token, the X-Activeloop-Org-Id paired with a token, or raw
// captured-trace content.
//
// Behavior:
//   - Deep-clones the payload.
//   - Walks every object/array; replaces the VALUE of any key matching
//     SENSITIVE_KEYS (case-insensitive, partial match) with '[REDACTED]'.
//   - Masks Bearer/JWT-shaped strings anywhere in string values.
//   - Leaves the original object untouched.

const SENSITIVE_KEYS: readonly string[] = [
  // auth / credentials - the keys-to-the-kingdom on Hivemind
  'password', 'pwd', 'passwd',
  'token', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'apiKey', 'api_key', 'secret', 'clientSecret', 'client_secret',
  'authorization', 'auth', 'bearer', 'cookie', 'set-cookie',
  'credentials', 'deviceCode', 'device_code',
  'sessionId', 'session_id',
  // org/tenant identifiers that enable cross-tenant access when paired with a token
  'orgId', 'org_id', 'x-activeloop-org-id',
  // captured-trace content fields that may carry raw prompt/response text
  'prompt', 'completion', 'response', 'rawHeaders', 'headers', 'env',
];

const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]{8,}/g;
const JWT_RE = /\beyJ[A-Za-z0-9._-]{10,}\b/g;
const REDACTED = '[REDACTED]';

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s.toLowerCase()));
}

function maskTokens(value: string): string {
  return value
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(JWT_RE, '[REDACTED_JWT]');
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return maskTokens(value);

  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return Object.fromEntries(
      entries.map(([k, v]) => [
        k,
        isSensitiveKey(k) ? REDACTED : redactValue(v, depth + 1),
      ]),
    );
  }

  return value;
}

export function redact<T>(payload: T): T {
  return redactValue(payload) as T;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, payload?: unknown) {
  const safe = payload === undefined ? undefined : redact(payload);
  const line = safe === undefined
    ? `[${level}] ${message}`
    : `[${level}] ${message} ${JSON.stringify(safe)}`;
  // Route to the real logger in production. This reference implementation
  // uses the console methods but the real version should hand off to
  // pino / winston / your platform logger.
  // eslint-disable-next-line no-console
  (console[level === 'debug' ? 'log' : level] as (s: string) => void)(line);
}

export const safeLog = {
  debug: (message: string, payload?: unknown) => emit('debug', message, payload),
  info:  (message: string, payload?: unknown) => emit('info', message, payload),
  warn:  (message: string, payload?: unknown) => emit('warn', message, payload),
  error: (message: string, payload?: unknown) => emit('error', message, payload),

  /** Structured exception logging without leaking sensitive context */
  captureException: (err: unknown, context?: Record<string, unknown>) => {
    emit('error', 'exception', {
      name: (err as Error)?.name,
      message: (err as Error)?.message,
      // NOTE: stack intentionally NOT included by default - it can echo the
      // resolved memory path or internal Deep Lake detail. Re-enable only for
      // server-side debugging, never into a captured trace.
      ...(context ?? {}),
    });
  },
};

export type SafeLog = typeof safeLog;

// Add sensitive keys for your domain
export function extendSensitiveKeys(keys: string[]) {
  for