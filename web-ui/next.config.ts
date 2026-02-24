import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@codex-app/shared-contracts"],
};

export default nextConfig;
