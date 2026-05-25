const fs = require("fs");
const path = require("path");

console.log("[Clean] Starting pre-build cleanup...");

const rootDir = path.join(__dirname, "..");

// 需要清理的目录和文件
const itemsToClean = [
  // 旧的构建输出
  path.join(rootDir, ".next"),
  path.join(rootDir, "dist"),
  path.join(rootDir, "release"),
  // 旧的编译缓存
  path.join(rootDir, "node_modules", ".cache"),
  // 开发数据库（不应该被打包）
  path.join(rootDir, "dev.db"),
  path.join(rootDir, "*.db"),
];

let cleanedCount = 0;

for (const item of itemsToClean) {
  try {
    if (fs.existsSync(item)) {
      const stat = fs.statSync(item);
      if (stat.isDirectory()) {
        fs.rmSync(item, { recursive: true, force: true });
        console.log(`[Clean] Removed directory: ${path.relative(rootDir, item)}`);
      } else {
        fs.unlinkSync(item);
        console.log(`[Clean] Removed file: ${path.relative(rootDir, item)}`);
      }
      cleanedCount++;
    }
  } catch (error) {
    console.warn(`[Clean] Failed to remove ${item}:`, error.message);
  }
}

// 清理 better-sqlite3 的旧编译缓存
try {
  const betterSqlite3Dir = path.join(rootDir, "node_modules", "better-sqlite3");
  if (fs.existsSync(betterSqlite3Dir)) {
    const buildDir = path.join(betterSqlite3Dir, "build");
    if (fs.existsSync(buildDir)) {
      // 保留最新的 .node 文件，删除其他缓存
      const entries = fs.readdirSync(buildDir);
      for (const entry of entries) {
        if (entry !== "Release" && entry !== "better_sqlite3.node") {
          const entryPath = path.join(buildDir, entry);
          fs.rmSync(entryPath, { recursive: true, force: true });
          console.log(`[Clean] Removed build cache: ${entry}`);
          cleanedCount++;
        }
      }
    }
  }
} catch (error) {
  console.warn("[Clean] Failed to clean better-sqlite3 cache:", error.message);
}

console.log(`[Clean] Cleanup complete. Removed ${cleanedCount} items.`);
