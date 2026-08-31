import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/rusutsu",
  devIndicators: {
    position: "bottom-right",
  },
  allowedDevOrigins: ["10.100.160.132", "*.trycloudflare.com", "192.168.10.25"],
  output: "standalone",
  experimental: {
    serverActions: {
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
