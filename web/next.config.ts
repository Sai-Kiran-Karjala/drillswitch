import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // No on-screen Next.js indicator in development; build and runtime errors still show.
  devIndicators: false,
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
