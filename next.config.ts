import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
   experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  compress: true,
  transpilePackages: ['three'],


};

export default nextConfig;
