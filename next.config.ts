import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const repoName = "Dominos-stock-shelf-life";
const basePath = isGithubPages ? `/${repoName}` : "";

/**
 * Semver from package.json (MAJOR.MINOR.PATCH):
 * - PATCH — bug fixes
 * - MINOR — small features
 * - MAJOR — big / breaking updates only
 * Bump package.json before shipping; Update app compares this value.
 */
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
) as { version?: string };
const appVersion =
  process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version ?? "1.0.0";

const changelog = JSON.parse(
  readFileSync(join(process.cwd(), "lib", "changelog-data.json"), "utf8"),
) as Array<{ version?: string; notes?: string[] }>;
const releaseNotes =
  changelog.find((entry) => entry.version === appVersion)?.notes ?? [];

// Static files the Update flow fetches (version + notes for the confirm sheet).
writeFileSync(
  join(process.cwd(), "public", "app-version.json"),
  `${JSON.stringify({ version: appVersion, notes: releaseNotes }, null, 2)}\n`,
);
writeFileSync(
  join(process.cwd(), "public", "changelog.json"),
  `${JSON.stringify(changelog, null, 2)}\n`,
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
