# Hivemind MCP HTTP server — deploy

The HTTP MCP server that makes Hivemind reachable from the ChatGPT App Directory. It is the same tool code as the stdio MCP server agents use locally (`src/mcp/tools.ts`), wrapped in `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk`.

## What this directory contains

- `Dockerfile` — multi-stage build, produces a ~150 MB Alpine image running as `hivemind:10001`, ENTRYPOINT `node bundle/cli.js serve-mcp`.
- `k8s.yaml` — Namespace + ConfigMap + Deployment + Service + Ingress as a starting template. Adapt to your cluster's namespacing, image registry, and ingress class before applying.

## Configuration (env vars)

All read by `src/cli/serve-mcp.ts`:

| Var | Default | Notes |
|---|---|---|
| `HIVEMIND_MCP_AUTH_ISSUER` | _(required)_ | Auth0 issuer URL (trailing slash). Advertised in `WWW-Authenticate` on 401 so ChatGPT can discover the auth server. e.g. `https://auth-beta.deeplake.ai/` |
| `HIVEMIND_MCP_PORT` | `8787` | Listen port |
| `HIVEMIND_MCP_HOST` | `0.0.0.0` | Bind host |
| `HIVEMIND_API_URL` | `https://api.deeplake.ai` | deeplake-api base URL |

## Build

```sh
# from the repo root
docker build -f deploy/mcp/Dockerfile -t hivemind-mcp:<tag> .
```

The image is self-contained; nothing else from the repo is needed at runtime.

## Run locally

```sh
docker run --rm -p 8787:8787 \
  -e HIVEMIND_MCP_AUTH_ISSUER=https://auth-beta.deeplake.ai/ \
  hivemind-mcp:<tag>

# Then:
curl http://127.0.0.1:8787/health
# {"status":"ok","version":"0.7.67"}

curl -i -X POST http://127.0.0.1:8787/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{}}'
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer realm="https://auth-beta.deeplake.ai/", error="invalid_token", ...
```

## Deploy to k8s

1. Push the image to your registry (`ghcr.io/activeloopai/hivemind-mcp:<tag>`).
2. Update `k8s.yaml` — image tag, namespace if not `hivemind-mcp`, ingress host if not `api.deeplake.ai`, cluster issuer name.
3. `kubectl apply -f deploy/mcp/k8s.yaml`.

The Ingress in the template routes `api.deeplake.ai/mcp/*` to this Service. **Important:** the existing `api.deeplake.ai/*` rules must keep routing non-`/mcp` paths to the existing deeplake-api backend — otherwise you'll black-hole the rest of the API. Layering this Ingress alongside the existing one (with explicit `pathType: Prefix` on `/mcp` only) is the safest pattern.

SSE streams require buffering off — the ingress annotations in the template set `nginx.ingress.kubernetes.io/proxy-buffering: off` and 1-hour read/send timeouts.

## Known caveats

- **Lockfile drift on `origin/main`** — `package-lock.json` is currently out of sync with `package.json` (e.g. `pg` resolves to a newer minor than the lockfile records). The Dockerfile uses `npm install --ignore-scripts` as a workaround. Once the lockfile is regenerated, switch back to `npm ci` for reproducibility.
- **No JWT validation in the MCP server itself** — the Bearer token is forwarded to deeplake-api, which validates it via `internal/auth/jwt.go`. The MCP server only checks the token is *present*; it does not validate the signature.
- **Multi-org users** — the first call to `GET /organizations` picks the user's primary org. A workspace picker is deferred (see plan).
- **No rate limit in this server** — front this with the existing api.deeplake.ai rate-limiter middleware via the ingress, or add one in a Tier-2 follow-up.

## Verification

```sh
npx vitest run tests/shared/mcp-http-server.test.ts
# Test Files  1 passed (1)
#      Tests  5 passed (5)
```

End-to-end against a real ChatGPT account is the gating check before submission — covered in the main plan (task #7).
