import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    // The Tailwind loader's output was being served stale from the persistent build cache
    // (new styles missing after a deploy), so builds always compile CSS from scratch.
    turbopackFileSystemCacheForBuild: false,
  },
  env: {
    // Changes on every deploy so the service worker refreshes its offline copy.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()),
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
