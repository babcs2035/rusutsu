import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/rusutsu",
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "surfsnow.jp"
      },
      {
        protocol: "https",
        hostname: "www.snowjapan.com"
      }
    ]
  }
};

export default nextConfig;
