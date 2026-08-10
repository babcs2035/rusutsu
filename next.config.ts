import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/rusutsu",
  allowedDevOrigins: ["10.100.160.132", "*.trycloudflare.com", "192.168.10.25"], //TODO: Add your dev origins here
  output: "standalone",
  compiler: {
    emotion: true,
  },
  experimental: {
    optimizePackageImports: ["@chakra-ui/react"],
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
        hostname: "surfsnow.jp",
      },
      {
        protocol: "https",
        hostname: "www.snowjapan.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
