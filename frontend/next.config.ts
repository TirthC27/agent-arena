import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack — Solana's @noble/curves uses BigInt
  // which Turbopack's dev server can't handle properly
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      stream: false,
      buffer: false,
    };
    return config;
  },
};

export default nextConfig;
