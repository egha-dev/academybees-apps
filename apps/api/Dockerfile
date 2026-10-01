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
RUN pnpm dlx turbo@2.11.5 prune @academybee/api --docker

# 2. Install (cached on the lockfile), build, then copy the API with production deps only.
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@academybee/api
RUN pnpm --filter @academybee/api deploy --prod --legacy /prod/api

# 3. Runtime: no build tools, non-root.
FROM ${NODE_IMAGE} AS runner
ARG RELEASE_SHA=dev
ENV RELEASE_SHA=${RELEASE_SHA}
# tini as PID 1: forwards SIGTERM and reaps children so graceful shutdown works on deploys.
RUN apk add --no-cache tini
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=builder --chown=node:node /prod/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/v1/health/live" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
