import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/rusutsu",
  output: "standalone",
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
        hostname: "surfsnow.jp",
      },
      {
        protocol: "https",
        hostname: "www.snowjapan.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["ktak.dev"],
    },
  },
};

export default nextConfig;
