import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: "dist",
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "60mb",
    },
  },
};

export default nextConfig;
