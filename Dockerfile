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

# アプリケーションをビルド
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

# 非特権ユーザー作成
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# standalone ビルド成果物をコピー
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Playwright ブラウザをコピー
COPY --from=builder /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright
RUN chown -R nextjs:nodejs /home/nextjs/.cache

# キャッシュディレクトリの権限設定
RUN mkdir -p .cache && chown -R nextjs:nodejs .cache

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
