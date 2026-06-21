import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const isElectron = process.env.BUILD_TARGET === "electron";

/**
 * Replace Node.js-only modules with browser-safe stubs.
 * Prevents `os.homedir()` etc. from being bundled into the browser build.
 * 仅在非 Electron（浏览器）构建时启用，避免 Electron 构建误替换为抛错的 stub。
 */
function nodeModuleBrowserStubs(): import("vite").Plugin {
  const replacements: Array<{ from: string; to: string }> = [
    { from: "local-file-storage", to: "local-file-storage.browser" },
  ];
  return {
    name: "node-module-browser-stubs",
    enforce: "pre",
    async resolveId(source, importer) {
      for (const { from, to } of replacements) {
        // 精确匹配：仅匹配以 "/from" 结尾或等于 "from" 的导入路径，
        // 避免误伤如 "./my-local-file-storage" 等同后缀路径
        const isMatch =
          source === from ||
          source === `./${from}` ||
          source === `../${from}` ||
          source.endsWith(`/${from}`);
        if (isMatch) {
          const newSource = source.slice(0, -from.length) + to;
          const resolved = await this.resolve(newSource, importer, { skipSelf: true });
          return resolved;
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 渲染进程（包括 Electron 渲染进程）均使用 browser stub，
    // 避免 os.homedir() 等 Node.js API 被错误打包进浏览器 bundle。
    nodeModuleBrowserStubs(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared-logic": path.resolve(__dirname, "./src/shared-logic"),
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
