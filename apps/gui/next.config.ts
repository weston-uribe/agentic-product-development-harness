import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const nextConfig: NextConfig = {
  serverExternalPackages: ["@cursor/sdk", "@linear/sdk", "@sentry/node"],
  // GitHub Codespaces / forwarded dev URLs use *.app.github.dev as the browser Host.
  allowedDevOrigins: ["*.app.github.dev"],
  experimental: {
    externalDir: true,
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.app.github.dev"],
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@harness": path.join(repoRoot, "src"),
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
