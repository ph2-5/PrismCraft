import type { NextConfig } from "next";
import { API_SERVER_PORT } from "./src/config/ports";

const isElectron = process.env.BUILD_TARGET === "electron";

const nextConfig: NextConfig = {
  output: isElectron ? "export" : "standalone",
  distDir: ".next",
  trailingSlash: isElectron,
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  turbopack: {},
  ...(!isElectron && {
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: `http://localhost:${API_SERVER_PORT}/api/:path*`,
        },
      ];
    },
  }),
  ...(isElectron && {
    webpack(config, { isServer }) {
      if (isServer) {
        const originalEntry = config.entry;
        config.entry = async () => {
          const entries = await (typeof originalEntry === "function" ? originalEntry() : originalEntry);
          if (entries && typeof entries === "object" && !Array.isArray(entries)) {
            const filtered: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(entries)) {
              if (!key.includes("api/")) {
                filtered[key] = value;
              }
            }
            return filtered;
          }
          return entries;
        };
      }
      return config;
    },
  }),
};

export default nextConfig;
