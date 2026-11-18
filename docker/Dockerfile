# syntax=docker/dockerfile:1
# XieFlow r21 - multi-stage image.
#   builder : Node 20 installs the workspace and builds the web SPA.
#   runtime : slim Node 20 image serves web + api on one port (8080), SQLite on a data volume.
# Build context is the repository root (see docker/docker-compose.yml).

FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @xieflow/web build

FROM node:20-bookworm-slim AS runtime
# remote mode forces auth for business routes (health/mode/settings stay public).
ENV XIEFLOW_MODE=remote \
    XIEFLOW_PORT=8080 \
    XIEFLOW_API_PORT=8787 \
    XIEFLOW_DB_PATH=/app/data/xieflow.db \
    NODE_ENV=production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY . .
COPY --from=builder /app/apps/web/dist ./apps/web/dist
RUN pnpm install --frozen-lockfile && mkdir -p /app/data
# SQLite database lives here; mount a named volume to survive container replacement.
VOLUME ["/app/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "docker/serve.mjs"]
