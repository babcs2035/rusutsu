import type { NextConfig } from "next";

// Report-Only CSP: 地図タイル・天気 iframe・写真・OAuth・Google Fonts を許可し、
// 違反を /api/csp-report に集めてから強制（enforce）へ切り替える。
// 'unsafe-inline' は Next.js の RSC インラインスクリプト／スタイルのため必須。
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://tile.openstreetmap.org https://tile.googleapis.com https://cyberjapandata.gsi.go.jp https://cyberjapandata2.gsi.go.jp",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://tile.openstreetmap.org https://tile.googleapis.com https://cyberjapandata.gsi.go.jp https://cyberjapandata2.gsi.go.jp https://www.google-analytics.com https://*.google-analytics.com",
  "frame-src 'self' https://ja.snow-forecast.com",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "report-uri /rusutsu/api/csp-report",
].join("; ");

const nextConfig: NextConfig = {
  // Allows an isolated QA server alongside the developer's existing server.
  distDir: process.env.RUSUTSU_DIST_DIR || ".next",
  basePath: "/rusutsu",
  async headers() {
    return [
      {
        // 全ルートに適用するセキュリティヘッダー。位置取得（geolocation）は
        // 本人の現在地表示に必要なので self 許可を維持する。
        source: "/:path*",
        headers: [
          {
            key:
              process.env.NODE_ENV === "production" &&
              process.env.RUSUTSU_CSP_ENFORCE === "true"
                ? "Content-Security-Policy"
                : "Content-Security-Policy-Report-Only",
            value: CSP,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self)",
          },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/map-sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/rusutsu" },
        ],
      },
    ];
  },
  devIndicators: {
    position: "bottom-right",
  },
  allowedDevOrigins: ["10.100.160.132", "*.trycloudflare.com", "192.168.10.25"],
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/share-image": [
      // Playwright resolves its browser metadata dynamically at runtime.
      "node_modules/playwright-core/browsers.json",
      "node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
    ],
  },
  outputFileTracingExcludes: {
    // Cover named trace entries such as next-server as well as URL routes.
    "**": [
      "**/.env*",
      "**/backups/**/*",
      "**/resorts-temporary/tmp/**/*",
      "**/resorts-temporary/logs/**/*",
      "**/resorts-temporary/crawl_latest_dom/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "64mb",
      allowedOrigins:
        process.env.NODE_ENV === "development"
          ? ["ktak.dev", "*.trycloudflare.com"]
          : ["ktak.dev"],
    },
  },
  serverExternalPackages: [
    "heic-decode",
    "@prisma/client",
    "@prisma/config",
    "playwright",
    "pg",
    "node-cron",
    "@prisma/adapter-pg",
    "dotenv",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
