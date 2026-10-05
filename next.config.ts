import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/rusutsu",
  async headers() {
    return [
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
  outputFileTracingExcludes: {
    "/*": [
      "./src/private/data/resorts-temporary/tmp/**/*",
      "./src/private/data/resorts-temporary/logs/**/*",
      "./src/private/data/resorts-temporary/crawl_latest_dom/**/*",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
      allowedOrigins: ["ktak.dev", "*.trycloudflare.com"],
    },
  },
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/config",
    "playwright",
    "pg",
    "node-cron",
    "@prisma/adapter-pg",
    "dotenv",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
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
