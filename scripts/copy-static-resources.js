const fs = require("fs");
const path = require("path");

console.log("[Copy Static] Starting to copy static resources...");

const rootDir = path.join(__dirname, "..");
const nextDir = path.join(rootDir, ".next");
const standaloneDir = path.join(nextDir, "standalone");
const staticSourceDir = path.join(nextDir, "static");
const staticTargetDir = path.join(standaloneDir, ".next", "static");
const publicSourceDir = path.join(rootDir, "public");
const publicTargetDir = path.join(standaloneDir, "public");

// 检查源目录是否存在
if (!fs.existsSync(staticSourceDir)) {
  console.error("[Copy Static] Source directory not found:", staticSourceDir);
  process.exit(1);
}

// 确保目标目录存在
if (!fs.existsSync(standaloneDir)) {
  console.error("[Copy Static] Standalone directory not found:", standaloneDir);
  console.error("[Copy Static] Please run: npm run build");
  process.exit(1);
}

// 创建目标目录
if (!fs.existsSync(staticTargetDir)) {
  fs.mkdirSync(staticTargetDir, { recursive: true });
  console.log("[Copy Static] Created target directory:", staticTargetDir);
}

// 递归复制目录
function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn("[Copy Static] Source not found:", src);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
      console.log(`[Copy Static] Copied directory: ${entry.name}`);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`[Copy Static] Copied file: ${entry.name}`);
    }
  }
}

// 复制 .next/static 资源
copyDirSync(staticSourceDir, staticTargetDir);

console.log("[Copy Static] Static resources copied successfully!");
console.log("[Copy Static] Source:", staticSourceDir);
console.log("[Copy Static] Target:", staticTargetDir);

// 复制 public 目录（如果存在）
if (fs.existsSync(publicSourceDir)) {
  copyDirSync(publicSourceDir, publicTargetDir);
  console.log("[Copy Static] Public resources copied successfully!");
  console.log("[Copy Static] Public source:", publicSourceDir);
  console.log("[Copy Static] Public target:", publicTargetDir);
} else {
  console.log("[Copy Static] No public directory found, skipping...");
}

// 验证复制结果（安全地检查目录）
let cssCount = 0;
let jsCount = 0;

const cssDir = path.join(staticTargetDir, "css");
const chunksDir = path.join(staticTargetDir, "chunks");

if (fs.existsSync(cssDir)) {
  cssCount = fs.readdirSync(cssDir, { recursive: true }).length;
}

if (fs.existsSync(chunksDir)) {
  jsCount = fs.readdirSync(chunksDir, { recursive: true }).length;
}

console.log(
  `[Copy Static] Copied ${cssCount} CSS files and ${jsCount} JS files`,
);
console.log("[Copy Static] Done!");
