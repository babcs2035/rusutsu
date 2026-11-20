# syntax=docker/dockerfile:1@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183

# ==============================================================================
# Base Stage
# ==============================================================================
FROM node:24-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@12.18.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ==============================================================================
# Stage 1: Install dependencies
# ==============================================================================
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN echo "node-linker=hoisted" > .npmrc
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# ==============================================================================
# Stage 2: Build the application
# ==============================================================================
FROM base AS build-cache
ARG DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
RUN node node_modules/playwright/cli.js install chromium
COPY . .

# Generate Prisma Client
# Node 26 breaks under QEMU arm64 (prisma/prisma#29464); keep Node 24 here
RUN pnpm exec prisma generate

# Build Next.js application
RUN --mount=type=cache,id=nextjs,target=/app/.next/cache pnpm build

# ==============================================================================
# Stage 3: Production runner
# ==============================================================================
FROM base AS runner

LABEL com.rusutsu.image-cleanup="app"

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Asia/Tokyo
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nextjs/.cache/ms-playwright

# Install system dependencies
RUN apt-get update && apt-get install -y tzdata \
    && pnpm dlx playwright@1.65.0 install-deps chromium \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy standalone build
COPY --from=build-cache --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build-cache --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build-cache --chown=nextjs:nodejs /app/prisma.config.ts ./
COPY --from=build-cache --chown=nextjs:nodejs /app/tsconfig.json ./
# Runtime CLI entry points need source files that Next's route tracer cannot
# discover (scheduler, YukiMagi, migrations, and explicit recovery importers).
COPY --from=build-cache --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=build-cache --chown=nextjs:nodejs /app/src/lib ./src/lib
COPY --from=build-cache --chown=nextjs:nodejs /app/src/server ./src/server
COPY --from=build-cache --chown=nextjs:nodejs /app/src/shared ./src/shared
COPY --from=build-cache --chown=nextjs:nodejs /app/src/features/course-recommendations/algorithm.ts ./src/features/course-recommendations/algorithm.ts
COPY --from=build-cache --chown=nextjs:nodejs /app/src/features/latest-status-mapping ./src/features/latest-status-mapping
COPY --from=build-cache --chown=nextjs:nodejs /app/src/features/resort-detail/utils/detailMetrics.ts /app/src/features/resort-detail/utils/courseStatusSummary.ts ./src/features/resort-detail/utils/
COPY --from=build-cache --chown=nextjs:nodejs /app/src/features/home/utils/operatingCounts.ts ./src/features/home/utils/operatingCounts.ts
COPY --from=build-cache --chown=nextjs:nodejs /app/src/features/resort-links/convert.ts /app/src/features/resort-links/model.ts /app/src/features/resort-links/linkTypes.json /app/src/features/resort-links/linkSources.json ./src/features/resort-links/
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/scripts ./src/private/scripts
# Frozen sources for EXPLICIT one-time import/recovery. App startup never imports.
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/SkiAreaNameDict.json ./src/private/data/SkiAreaNameDict.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/SkiResortNameAliases.json ./src/private/data/SkiResortNameAliases.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/SkiResortLinks.json ./src/private/data/SkiResortLinks.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/pass-programs/aliases.json ./src/private/data/pass-programs/aliases.json
# EV充電の管理画面で出す、近くの充電器の候補（buildEvChargerCandidates.py が作る）
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/ev-charging/admin-candidates.json ./src/private/data/ev-charging/admin-candidates.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/reviews ./src/private/data/reviews
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/latest_status_mapping ./src/private/data/resorts-temporary/latest_status_mapping
# Historical crawl results also support status-name mapping before the first DB result.
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/latest_data ./src/private/data/resorts-temporary/latest_data
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/lift_20m ./src/private/data/resorts-temporary/lift_20m
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/lift_before ./src/private/data/resorts-temporary/lift_before
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/lift_confirmed.json ./src/private/data/resorts-temporary/lift_confirmed.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/lift_detail ./src/private/data/resorts-temporary/lift_detail
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/slope_10m ./src/private/data/resorts-temporary/slope_10m
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/slope_10m_osm ./src/private/data/resorts-temporary/slope_10m_osm
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/slope_before ./src/private/data/resorts-temporary/slope_before
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/slope_before_osm ./src/private/data/resorts-temporary/slope_before_osm
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/resorts-temporary/slope_detail ./src/private/data/resorts-temporary/slope_detail
# Ticket validation uses the same Skill locally and in production.
COPY --from=build-cache --chown=nextjs:nodejs /app/.shared/skills/collect-ski-lift-ticket-pricing ./.shared/skills/collect-ski-lift-ticket-pricing
# Copy Playwright binaries
COPY --from=build-cache --chown=nextjs:nodejs /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright
# Copy full node_modules for Prisma CLI module resolution
# Prisma CLI needs @prisma/config and its transitive dependencies (c12, effect, etc.)
# Copy to temp location first, then merge to avoid Docker overlay file-to-dir conflict
COPY --from=build-cache /app/node_modules /tmp/node_modules
RUN cp -an /tmp/node_modules/. ./node_modules/ && rm -rf /tmp/node_modules

# Setup permissions. The crawler artifact directory is mounted as a persistent
# volume in production, so warning/failure DOMs survive container replacement.
RUN mkdir -p .cache /pnpm /app/var/crawler-artifacts \
    /app/var/crawler-worker-artifacts /app/var/share-images && \
    chown -R nextjs:nodejs /app /home/nextjs/.cache /pnpm

# Switch to non-root user
USER nextjs

# Verify the final image, including files not discoverable by Next's tracer.
# These commands do not connect to a DB or crawl any external website.
RUN node scripts/ops/check-runtime-files.ts && \
    node --conditions=react-server --import tsx --input-type=module --eval 'await Promise.all([import("./src/server/course-recommendations/projection.ts"), import("./src/private/scripts/crawlTourLinks.ts"), import("./src/private/scripts/crawlPassPrograms.ts")])' && \
    node --import tsx scripts/importCanonicalDataDocuments.ts --dry-run && \
    node --import tsx scripts/importSkiResortShortNames.ts --dry-run

EXPOSE 3000

CMD ["node", "scripts/ops/start-app.ts"]
