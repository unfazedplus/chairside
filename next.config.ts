import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components requires dynamic data access to be declared explicitly
  // (see `export const instant = false` on request-bound routes).
  cacheComponents: true,
  partialPrefetching: true,
  // Pin the workspace root so Turbopack does not walk up to a lockfile outside
  // this repository (e.g. a stray one in the parent folder).
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
