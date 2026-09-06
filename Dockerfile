# syntax=docker/dockerfile:1

# ==============================================================================
# Base Stage
# ==============================================================================
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN npm install -g pnpm@11.20.0
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
COPY . .

# Generate Prisma Client
# Node 24 + arm64 does not have the WASM DMMF bug (prisma/prisma#29464)
RUN pnpm exec prisma generate

# Playwright install (Note: Only needed if build process uses it, otherwise move to runner)
# Installing here to ensure binaries are available for copy
RUN pnpm exec playwright install-deps chromium && \
    pnpm exec playwright install chromium

# Build Next.js application
RUN --mount=type=cache,id=nextjs,target=/app/.next/cache pnpm build

# ==============================================================================
# Stage 3: Production runner
# ==============================================================================
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV TZ=Asia/Tokyo
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nextjs/.cache/ms-playwright

# Install system dependencies
RUN apt-get update && apt-get install -y tzdata openssl \
    && pnpm dlx playwright install-deps chromium \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Install global tools
RUN mkdir -p "$PNPM_HOME/bin" \
    && pnpm config set global-bin-dir "$PNPM_HOME/bin" \
    && pnpm add -g prisma@7.9.1 tsx@4.23.11

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
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/scripts ./src/private/scripts
# Frozen sources for EXPLICIT one-time import/recovery. App startup never imports.
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/SkiAreaNameDict.json ./src/private/data/SkiAreaNameDict.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/SkiResortNameAliases.json ./src/private/data/SkiResortNameAliases.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/SkiResortLinks.json ./src/private/data/SkiResortLinks.json
COPY --from=build-cache --chown=nextjs:nodejs /app/src/private/data/lift-ticket ./src/private/data/lift-ticket
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
    /app/var/crawler-worker-artifacts && \
    chown -R nextjs:nodejs /app /home/nextjs/.cache /pnpm

# Switch to non-root user
USER nextjs

# Verify the final image, including files not discoverable by Next's tracer.
# These commands do not connect to a DB or crawl any external website.
RUN node scripts/ops/check-runtime-files.mjs && \
    node --import tsx scripts/importCanonicalDataDocuments.ts --dry-run && \
    node --import tsx scripts/importSkiResortShortNames.ts --dry-run

EXPOSE 3000

CMD ["node", "scripts/ops/start-app.mjs"]
