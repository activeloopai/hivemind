# syntax=docker/dockerfile:1.7

# Multi-stage build for the Hivemind HTTP MCP server.
#
# Image layout:
#   /app/bundle/cli.js   — esbuild-bundled hivemind CLI (bin entry)
#   /app/node_modules    — runtime deps for externalized native modules
#                          (tree-sitter, zstd, etc.) — most aren't loaded
#                          by `serve-mcp`, but the ESM import chain may
#                          require them to be resolvable.
#
# Entry point: `node bundle/cli.js serve-mcp`.
# Configure via env at runtime — see src/cli/serve-mcp.ts.

# ────────────────────────────── builder ──────────────────────────────
FROM node:24-alpine AS build

# Native build deps for tree-sitter rebuild on arm64; safe no-ops on x64.
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy manifest + scripts first so postinstall has what it needs.
COPY package.json package-lock.json ./
COPY scripts ./scripts

# `npm install --ignore-scripts` skips:
#   - `prepare` (would run husky + npm run build before sources are copied)
#   - `postinstall` (tree-sitter native rebuild — not needed for serve-mcp,
#     which doesn't load the graph extractor)
#
# We use `npm install` (not `npm ci`) because origin/main's
# package-lock.json drifts from package.json (e.g. `pg` resolves to a
# newer minor than the lockfile records). Once the lockfile is
# regenerated (a separate cleanup) this can switch back to `npm ci`
# without `--ignore-scripts`.
RUN npm install --ignore-scripts --no-audit --no-fund

# Copy the sources needed to build the CLI bundle. `npm run build` ==
# `tsc && node esbuild.config.mjs`.
COPY tsconfig.json esbuild.config.mjs ./
COPY src ./src
# esbuild.config.mjs reads version banners + SKILL bodies from a few of
# the agent subtrees (notably openclaw/) when building all bundles. The
# CLI bundle itself only needs `dist/src/cli/index.js` (a tsc output),
# but the build step still walks the per-agent entry points, so we copy
# the source-tracked agent dirs here. `cursor/` and `mcp/` are build
# *outputs* — they don't exist as sources on origin/main.
COPY .claude-plugin ./.claude-plugin
COPY claude-code ./claude-code
COPY codex ./codex
COPY hermes ./hermes
COPY openclaw ./openclaw
COPY pi ./pi

RUN npm run build

# Drop devDependencies so the runtime stage carries only production deps.
RUN npm prune --omit=dev

# ────────────────────────────── runtime ──────────────────────────────
FROM node:24-alpine AS runtime

# Non-root user.
RUN addgroup -g 10001 hivemind && adduser -H -D -u 10001 -G hivemind hivemind

WORKDIR /app

COPY --from=build --chown=hivemind:hivemind /app/bundle ./bundle
COPY --from=build --chown=hivemind:hivemind /app/node_modules ./node_modules
COPY --from=build --chown=hivemind:hivemind /app/package.json ./package.json

USER hivemind

ENV NODE_ENV=production \
    HIVEMIND_MCP_PORT=8787 \
    HIVEMIND_MCP_HOST=0.0.0.0

EXPOSE 8787

# k8s liveness/readiness can hit /health directly. Docker's built-in
# HEALTHCHECK uses wget (busybox in alpine).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${HIVEMIND_MCP_PORT}/health || exit 1

ENTRYPOINT ["node", "bundle/cli.js"]
CMD ["serve-mcp"]
