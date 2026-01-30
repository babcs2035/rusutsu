# ==============================================================================
# Stage 1: Install dependencies
# ==============================================================================
FROM node:25.4-slim AS deps

WORKDIR /app

# pnpm のインストール
RUN npm install -g pnpm@10.28.2

# 依存関係ファイルをコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# 依存関係のインストール（開発依存含む）
RUN pnpm install --frozen-lockfile

# ==============================================================================
# Stage 1.5: Generate Prisma Client (on Build Platform / amd64)
# ==============================================================================
FROM --platform=$BUILDPLATFORM node:25.4-slim AS prisma-gen
WORKDIR /app
RUN npm install -g pnpm@10.28.2
RUN echo "node-linker=hoisted" > .npmrc
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN pnpm prisma generate

# ==============================================================================
# Stage 2: Build the application
# ==============================================================================
FROM node:25.4-slim AS builder

WORKDIR /app

# pnpm のインストール
RUN npm install -g pnpm@10.28.2

# 依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Playwright 用ライブラリインストール
RUN pnpm exec playwright install-deps chromium && \
    pnpm exec playwright install chromium

# 生成された Prisma Client をコピー (QEMUでのgenerate回避)
RUN rm -rf /app/node_modules/.prisma /app/node_modules/@prisma
COPY --from=prisma-gen /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=prisma-gen /app/node_modules/@prisma /app/node_modules/@prisma

# アプリケーションをビルド
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN pnpm build

# ==============================================================================
# Stage 3: Production runner
# ==============================================================================
FROM node:25.4-slim AS runner

WORKDIR /app

# 環境変数
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV TZ=Asia/Tokyo
ENV PLAYWRIGHT_BROWSERS_PATH=/home/nextjs/.cache/ms-playwright

# OS 依存関係のインストール（Playwright用ライブラリ含む）
RUN apt-get update && apt-get install -y tzdata openssl \
    && npx playwright install-deps chromium \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 非特権ユーザー作成
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# グローバルツールのインストール
RUN npm install -g pnpm@10.28.2 prisma@7.3.0 tsx@4.19.2

# standalone ビルド成果物をコピー
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Playwright ブラウザバイナリをコピー
COPY --from=builder --chown=nextjs:nodejs /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright

# 権限周りの整理
RUN mkdir -p .cache /pnpm && chown -R nextjs:nodejs /app /home/nextjs/.cache /pnpm

# seed.ts実行に必要な依存関係を追加
RUN pnpm add @prisma/adapter-pg pg

USER nextjs

EXPOSE 3000

CMD ["/bin/sh", "-c", "prisma migrate deploy && tsx prisma/seed.ts && node server.js"]
