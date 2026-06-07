import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isElectron = process.env.BUILD_TARGET === "electron";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: isElectron ? "./" : "/",
  build: {
    outDir: "out",
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    reportCompressedSize: false,
    sourcemap: !isElectron,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              test: /node_modules[\\/]react[\\/]|node_modules[\\/]react-dom[\\/]|node_modules[\\/]react-router|node_modules[\\/]scheduler[\\/]/,
              priority: 30,
            },
            {
              name: "vendor-state",
              test: /node_modules[\\/]zustand[\\/]|node_modules[\\/]@tanstack[\\/]/,
              priority: 25,
            },
            {
              name: "vendor-ui",
              test: /node_modules[\\/]lucide-react[\\/]|node_modules[\\/]clsx[\\/]|node_modules[\\/]tailwind-merge[\\/]|node_modules[\\/]class-variance-authority[\\/]/,
              priority: 25,
            },
            {
              name: "vendor-misc",
              test: /node_modules/,
              priority: 10,
            },
            {
              name: "app-infra-core",
              test: /src[\\/]infrastructure[\\/]/,
              priority: 20,
            },
            {
              name: "app-shared",
              test: /src[\\/]shared[\\/]/,
              priority: 18,
            },
            {
              name: "app-domain",
              test: /src[\\/]domain[\\/]/,
              priority: 18,
            },
            {
              name: "app-story",
              test: /src[\\/]modules[\\/]story[\\/]/,
              priority: 15,
            },
            {
              name: "app-video",
              test: /src[\\/]modules[\\/]video[\\/]/,
              priority: 15,
            },
            {
              name: "app-shot",
              test: /src[\\/]modules[\\/]shot[\\/]/,
              priority: 15,
            },
            {
              name: "app-character",
              test: /src[\\/]modules[\\/]character[\\/]/,
              priority: 15,
            },
            {
              name: "app-scene",
              test: /src[\\/]modules[\\/]scene[\\/]/,
              priority: 15,
            },
            {
              name: "app-infra",
              test: /src[\\/]modules[\\/](asset|sync|persistence)[\\/]/,
              priority: 15,
            },
            {
              name: "app-prompt",
              test: /src[\\/]modules[\\/]prompt[\\/]/,
              priority: 15,
            },
            {
              name: "common",
              minShareCount: 2,
              minSize: 10000,
              priority: 5,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false,
  },
});
