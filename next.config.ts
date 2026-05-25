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
};

export default nextConfig;
