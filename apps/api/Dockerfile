# syntax=docker/dockerfile:1.7
# AcademyBee API image (ADR-001, C-48). Build from the repo root:
#   docker build -f apps/api/Dockerfile -t academybee-api .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate

# 1. Only the workspace packages the API depends on.
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.5 prune @academybee/api --docker \
 && (cp .release-sha out/full/.release-sha 2>/dev/null || echo dev > out/full/.release-sha)

# 2. Install (cached on the lockfile), build, then copy the API with production deps only.
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
# No BuildKit cache mount: Railway's builder only accepts its own cache IDs (C-75).
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@academybee/api
RUN pnpm --filter @academybee/api deploy --prod --legacy /prod/api

# 3. Runtime: no build tools, non-root.
FROM ${NODE_IMAGE} AS runner
# The deployed commit: a build arg (docker build), else Railway's RAILWAY_GIT_COMMIT_SHA at runtime
# (GitHub deploys, C-76), else `.release-sha`, else "dev".
ARG RELEASE_SHA=
ENV RELEASE_SHA=${RELEASE_SHA}
# tini as PID 1: forwards SIGTERM and reaps children so graceful shutdown works on deploys.
RUN apk add --no-cache tini
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
COPY --from=builder --chown=node:node /repo/.release-sha ./RELEASE_SHA
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/v1/health/live" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/bin/sh", "-c", "export RELEASE_SHA=\"${RELEASE_SHA:-${RAILWAY_GIT_COMMIT_SHA:-$(cat RELEASE_SHA)}}\"; exec node dist/main.js"]
