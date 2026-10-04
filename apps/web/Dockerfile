# syntax=docker/dockerfile:1.7
# AcademyBee web image: Next.js standalone server (C-69, C-75). Build from the repo root:
#   docker build -f apps/web/Dockerfile -t academybee-web .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 CI=1
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate

# 1. Only the workspace packages the web app depends on.
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo@2.11.5 prune @academybee/web --docker \
 && (cp .release-sha out/full/.release-sha 2>/dev/null || echo dev > out/full/.release-sha)

# 2. Install and build the standalone server.
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
# No BuildKit cache mount: Railway's builder only accepts its own cache IDs (C-75).
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
# Inlined into browser code at build time (Railway passes service variables as build args).
ARG NEXT_PUBLIC_APP_ENV=
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV} NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_OUTPUT=standalone
RUN RELEASE_SHA="$(cat .release-sha)" pnpm turbo run build --filter=@academybee/web

# 3. Runtime: the traced server only, non-root.
FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache tini
# HOSTNAME=:: listens on IPv4 and IPv6 (Railway's edge and private network).
ENV NODE_ENV=production PORT=3000 HOSTNAME=:: NEXT_TELEMETRY_DISABLED=1
ARG RELEASE_SHA=
ENV RELEASE_SHA=${RELEASE_SHA}
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/.release-sha ./RELEASE_SHA
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/offline" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/bin/sh", "-c", "export RELEASE_SHA=\"${RELEASE_SHA:-$(cat RELEASE_SHA)}\"; exec node apps/web/server.js"]
