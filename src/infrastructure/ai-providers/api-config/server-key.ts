/**
 * 服务端密钥管理
 * 用于安全地管理服务端加密密钥
 */

import crypto from "crypto";
import { promises as fsp } from "fs";
import path from "path";
import { homedir } from "os";
import { promisify } from "util";
import { errorLogger } from "@/shared/error-logger";

const CONFIG_DIR = path.join(homedir(), ".ai-animation-studio");
const KEY_FILE = path.join(CONFIG_DIR, ".server-key");

const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
) => Promise<Buffer>;

/**
 * 异步检查路径是否存在
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 密钥派生结果
 */
interface DerivedKey {
  key: Buffer;
  salt: Buffer;
}

/**
 * 安全地生成或加载服务端加密密钥
 *
 * 安全策略：
 * 1. 优先从环境变量读取（适用于生产环境/自部署）
 * 2. 其次从本地密钥文件读取（适用于本地开发）
 * 3. 最后生成新密钥并保存到文件（首次运行）
 *
 * 注意：密钥文件权限设置为 0o600（仅所有者可读写）
 */
export async function getServerEncryptionKey(): Promise<Buffer> {
  const derived = await deriveKey();
  return derived.key;
}

/**
 * 派生加密密钥
 */
async function deriveKey(): Promise<DerivedKey> {
  // 1. 尝试从环境变量获取（生产环境推荐）
  const envKey = process.env.AAS_SERVER_KEY;
  const envSalt = process.env.AAS_SERVER_SALT;

  if (envKey && envSalt) {
    // 环境变量优先级最高
    return {
      key: await scrypt(envKey, envSalt, 32),
      salt: Buffer.from(envSalt, "utf8"),
    };
  }

  // 2. 尝试从密钥文件加载
  const fileKey = await loadKeyFromFile();
  if (fileKey) {
    return fileKey;
  }

  // 3. 生成新密钥并保存
  return generateAndSaveKey();
}

/**
 * 从密钥文件加载密钥
 */
async function loadKeyFromFile(): Promise<DerivedKey | null> {
  try {
    if (!(await pathExists(KEY_FILE))) {
      return null;
    }

    const content = await fsp.readFile(KEY_FILE, "utf8");
    const data = JSON.parse(content);

    // 验证数据格式
    if (!data.key || !data.salt || !data.version) {
      errorLogger.warn("[ServerKey] 密钥文件格式无效，将重新生成");
      return null;
    }

    // 版本检查（未来可扩展）
    if (data.version !== 1) {
      errorLogger.warn("[ServerKey] 密钥文件版本不兼容，将重新生成");
      return null;
    }

    return {
      key: Buffer.from(data.key, "hex"),
      salt: Buffer.from(data.salt, "hex"),
    };
  } catch (error) {
    errorLogger.warn("[ServerKey] 读取密钥文件失败:", error);
    return null;
  }
}

/**
 * 生成新密钥并保存到文件
 */
async function generateAndSaveKey(): Promise<DerivedKey> {
  // 生成随机密钥材料
  const keyMaterial = crypto.randomBytes(32);
  const salt = crypto.randomBytes(16);

  // 派生最终密钥
  const derivedKey = await scrypt(keyMaterial, salt, 32);

  const keyData = {
    version: 1,
    key: derivedKey.toString("hex"),
    salt: salt.toString("hex"),
    createdAt: new Date().toISOString(),
  };

  try {
    // 确保目录存在
    if (!(await pathExists(CONFIG_DIR))) {
      await fsp.mkdir(CONFIG_DIR, { recursive: true });
    }

    // 写入临时文件
    const tempFile = `${KEY_FILE}.tmp`;
    await fsp.writeFile(tempFile, JSON.stringify(keyData, null, 2), {
      encoding: "utf8",
      mode: 0o600, // 仅所有者可读写
    });

    // 原子性重命名
    await fsp.rename(tempFile, KEY_FILE);

    errorLogger.info("[ServerKey] 新密钥已生成并保存");
  } catch (error) {
    errorLogger.error("[ServerKey] 保存密钥文件失败:", error);
    // 即使保存失败，仍然返回生成的密钥（仅在内存中使用）
  }

  return {
    key: derivedKey,
    salt,
  };
}

/**
 * 检查密钥是否来自环境变量
 * 用于判断是否为生产环境
 */
export function isKeyFromEnv(): boolean {
  return !!(process.env.AAS_SERVER_KEY && process.env.AAS_SERVER_SALT);
}

/**
 * 检查密钥文件是否存在
 */
export async function keyFileExists(): Promise<boolean> {
  return pathExists(KEY_FILE);
}

/**
 * 删除密钥文件（用于重置或卸载）
 */
export async function deleteKeyFile(): Promise<boolean> {
  try {
    if (await pathExists(KEY_FILE)) {
      await fsp.unlink(KEY_FILE);
      errorLogger.info("[ServerKey] 密钥文件已删除");
    }
    return true;
  } catch (error) {
    errorLogger.error("[ServerKey] 删除密钥文件失败:", error);
    return false;
  }
}

/**
 * 验证密钥是否有效
 */
export function validateKey(key: Buffer): boolean {
  return Buffer.isBuffer(key) && key.length === 32;
}
