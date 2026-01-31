# syntax=docker/dockerfile:1

# ==============================================================================
# Base Stage
# ==============================================================================
FROM node:25.4-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.28.2
WORKDIR /app

# ==============================================================================
# Stage 1: Install dependencies
# ==============================================================================
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# ==============================================================================
# Stage 1.5: Generate Prisma Client (on Build Platform / amd64)
# ==============================================================================
FROM --platform=$BUILDPLATFORM node:25.4-slim AS prisma-gen
WORKDIR /app
RUN apt-get update && apt-get install -y openssl
RUN npm install -g pnpm@10.28.2
RUN echo "node-linker=hoisted" > .npmrc
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts
COPY prisma ./prisma
RUN pnpm prisma generate

# ==============================================================================
# Stage 2: Build the application
# ==============================================================================
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Playwright install (Note: Only needed if build process uses it, otherwise move to runner)
# Installing here to ensure binaries are available for copy
RUN pnpm exec playwright install-deps chromium && \
    pnpm exec playwright install chromium

# Copy generated Prisma Client
RUN rm -rf node_modules/.prisma node_modules/@prisma
COPY --from=prisma-gen /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma-gen /app/node_modules/@prisma ./node_modules/@prisma

ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Build Next.js application
RUN --mount=type=cache,id=nextjs,target=/app/.next/cache pnpm build

# FIX: Explicitly copy external packages to standalone node_modules
# This addresses the issue where 'pg' and other native modules are not correctly
# included in the standalone build or handled by serverExternalPackages in Turbopack
RUN cp -R -L node_modules/pg .next/standalone/node_modules/ || true \
    && cp -R -L node_modules/node-cron .next/standalone/node_modules/ || true \
    && cp -R -L node_modules/@prisma/adapter-pg .next/standalone/node_modules/@prisma/ || true \
    && cp -R -L node_modules/@prisma/driver-adapter-utils .next/standalone/node_modules/@prisma/ || true \
    && cp -R -L node_modules/@prisma/debug .next/standalone/node_modules/@prisma/ || true \
    && cp -R -L node_modules/dotenv .next/standalone/node_modules/ || true \
    && cp -R -L node_modules/prisma .next/standalone/node_modules/ || true

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
RUN pnpm add -g prisma@6.19.2 tsx@4.19.2

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Copy Playwright binaries
COPY --from=builder --chown=nextjs:nodejs /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright

# Setup permissions
RUN mkdir -p .cache /pnpm && chown -R nextjs:nodejs /app /home/nextjs/.cache /pnpm

# Switch to non-root user
USER nextjs

EXPOSE 3000

CMD ["/bin/sh", "-c", "prisma migrate deploy && tsx prisma/seed.ts && node server.js"]
