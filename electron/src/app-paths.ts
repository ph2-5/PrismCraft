import fs from "fs";
import os from "os";
import path from "path";

/**
 * 用户数据目录解析器。
 * 规则：
 * - 新安装用户使用 "PrismCraft"（当前品牌名）
 * - 若旧目录 "AI Animation Studio" 已存在，则继续使用（向后兼容，保护用户数据）
 * - 旧路径 ~/.ai-animation-studio 属于应用内部目录，不做重命名
 */

const CURRENT_DIR_NAME = "PrismCraft";
const LEGACY_DIR_NAME = "AI Animation Studio";

/**
 * 检测并返回用户数据根目录。
 * 首次调用时检测旧目录，后续调用缓存结果。
 */
let cachedRootDir: string | null = null;

export function getUserDataRootDir(): string {
  if (cachedRootDir) return cachedRootDir;
  const legacy = path.join(os.homedir(), LEGACY_DIR_NAME);
  const current = path.join(os.homedir(), CURRENT_DIR_NAME);
  // 旧目录存在则继续使用；否则使用新目录
  cachedRootDir = fs.existsSync(legacy) ? legacy : current;
  return cachedRootDir;
}

/**
 * 获取用户数据子目录（如 Assets/Cache/Plugins 等）。
 * 若旧目录存在则返回旧子目录，否则返回新子目录。
 */
export function getUserDataSubDir(...subPaths: string[]): string {
  const root = getUserDataRootDir();
  return path.join(root, ...subPaths);
}

/**
 * 所有用户数据目录的完整集合（同时包含新旧路径，用于路径白名单）。
 */
export function getAllUserDataDirs(): string[] {
  const legacy = path.join(os.homedir(), LEGACY_DIR_NAME);
  const current = path.join(os.homedir(), CURRENT_DIR_NAME);
  return legacy === current ? [legacy] : [legacy, current];
}

/**
 * 安全的路径前缀匹配：校验路径分隔符，防止兄弟目录绕过。
 * 例如 "C:\Users\user\PrismCraft" 不应匹配 "C:\Users\user\PrismCraft-evil\file"。
 *
 * @param target 待检查的已解析路径
 * @param allowedRoot 允许的根目录
 * @returns 是否在允许的根目录下（含根目录本身）
 */
export function isPathUnderRoot(target: string, allowedRoot: string): boolean {
  const normalizedTarget = path.resolve(target).toLowerCase();
  const normalizedRoot = path.resolve(allowedRoot).toLowerCase();
  if (normalizedTarget === normalizedRoot) return true;
  // 必须以 root + 路径分隔符开头，防止兄弟目录前缀匹配
  return normalizedTarget.startsWith(normalizedRoot + path.sep.toLowerCase());
}

/**
 * 检查路径是否在任一允许的根目录下。
 */
export function isPathUnderAnyRoot(target: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => isPathUnderRoot(target, root));
}
