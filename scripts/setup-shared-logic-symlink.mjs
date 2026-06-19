import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const symlinkPath = path.join(projectRoot, "node_modules", "@shared-logic");
const targetPath = path.join(projectRoot, "src", "shared-logic");

// 使用 lstatSync（不跟随符号链接）检测链接状态，
// 避免断链（target 已删）时 existsSync 返回 false 导致跳过重建
try {
  const stat = fs.lstatSync(symlinkPath);
  if (stat.isSymbolicLink()) {
    // 链接存在，验证目标是否可达
    if (fs.existsSync(symlinkPath)) {
      process.exit(0);
    }
    // 断链：删除后重建
    fs.unlinkSync(symlinkPath);
    console.warn("[postinstall] Removed broken @shared-logic symlink, recreating...");
  } else if (stat.isDirectory()) {
    // 真实目录（非链接），跳过
    process.exit(0);
  }
} catch {
  // 路径不存在，继续创建
}

try {
  fs.mkdirSync(path.dirname(symlinkPath), { recursive: true });
  fs.symlinkSync(targetPath, symlinkPath, "junction");
  console.log("[postinstall] Created @shared-logic junction:", symlinkPath, "->", targetPath);
} catch (e) {
  console.warn("[postinstall] Failed to create @shared-logic junction:", e.message);
  console.warn("[postinstall] TypeScript compilation may fail for electron/src/");
}
