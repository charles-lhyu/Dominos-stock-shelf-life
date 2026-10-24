import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = "Dominos-stock-shelf-life";
const basePath = isGithubPages ? `/${repoName}` : "";
const appVersion =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  process.env.NEXT_PUBLIC_APP_VERSION ??
  "dev";

// Static file the Update button fetches to see if a newer deploy is live.
writeFileSync(
  join(process.cwd(), "public", "app-version.json"),
  `${JSON.stringify({ version: appVersion }, null, 2)}\n`,
);

const nextConfig: NextConfig = {
  // The dev server is opened at 127.0.0.1. Without this, Next blocks the
  // HMR socket and the page stays as static HTML.
  allowedDevOrigins: ["127.0.0.1"],
  ...(isGithubPages
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath ? `${basePath}/` : undefined,
        // Static hosting cannot use the server component cache pipeline.
        cacheComponents: false,
      }
    : {
        cacheComponents: true,
        partialPrefetching: true,
      }),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    // GitHub Actions sets GITHUB_SHA — used to detect a fresh deploy after Update.
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
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
