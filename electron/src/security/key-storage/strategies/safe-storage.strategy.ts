/**
 * security/key-storage/strategies/safe-storage.strategy.ts
 *
 * Electron safeStorage 策略
 *
 * 使用 Electron 内置 safeStorage API 加密敏感数据。
 * - Windows: DPAPI
 * - macOS: Keychain
 * - Linux: libsecret / kwallet
 *
 * 优势：零外部依赖，利用操作系统级安全机制
 * 限制：仅在 Electron 主进程中可用
 */

import { safeStorage } from "electron";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { KeyStorageStrategy, StorageResult, EncryptedDataPacket } from "../types";
import { getUserDataPath } from "../../../database/db-schema";
import { getLogger } from "../../../logging/logger";

const logger = getLogger("key-storage-safe");

function getEncryptedKeysFile(): string {
  return path.join(getUserDataPath(), "secure", "encrypted-keys.json");
}

export class SafeStorageStrategy implements KeyStorageStrategy {
  readonly name = "safe-storage";
  readonly priority = 1; // 最高优先级

  private dataCache: Map<string, string> | null = null;

  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      logger.warn("Failed to check safeStorage encryption availability");
      return false;
    }
  }

  async save(key: string, value: string): Promise<StorageResult> {
    try {
      const data = await this.loadAllData();
      data.set(key, value);
      await this.saveAllData(data);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `safeStorage save failed: ${(error as Error).message}` };
    }
  }

  async load(key: string): Promise<StorageResult<string | null>> {
    try {
      const data = await this.loadAllData();
      const value = data.get(key) ?? null;
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: `safeStorage load failed: ${(error as Error).message}` };
    }
  }

  async delete(key: string): Promise<StorageResult> {
    try {
      const data = await this.loadAllData();
      data.delete(key);
      await this.saveAllData(data);
      this.dataCache = null; // 清除缓存
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `safeStorage delete failed: ${(error as Error).message}` };
    }
  }

  async list(): Promise<StorageResult<string[]>> {
    try {
      const data = await this.loadAllData();
      return { ok: true, value: Array.from(data.keys()) };
    } catch (error) {
      return { ok: false, error: `safeStorage list failed: ${(error as Error).message}` };
    }
  }

  async clear(): Promise<StorageResult> {
    try {
      this.dataCache = null;
      if (fs.existsSync(getEncryptedKeysFile())) {
        fs.unlinkSync(getEncryptedKeysFile());
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `safeStorage clear failed: ${(error as Error).message}` };
    }
  }

  /** 导出加密数据包（用于云端同步） */
  async exportEncrypted(): Promise<StorageResult<EncryptedDataPacket>> {
    try {
      const data = await this.loadAllData();
      const plaintext = JSON.stringify(Object.fromEntries(data));

      const iv = crypto.randomBytes(12);
      const key = this.deriveKey();
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

      let ciphertext = cipher.update(plaintext, "utf8");
      ciphertext = Buffer.concat([ciphertext, cipher.final()]);
      const tag = cipher.getAuthTag();

      return {
        ok: true,
        value: {
          alg: "aes-256-gcm",
          iv: iv.toString("base64"),
          tag: tag.toString("base64"),
          ciphertext: ciphertext.toString("base64"),
          createdAt: new Date().toISOString(),
          strategy: this.name,
        },
      };
    } catch (error) {
      return { ok: false, error: `Export failed: ${(error as Error).message}` };
    }
  }

  /** 从加密数据包导入（用于云端恢复） */
  async importEncrypted(packet: EncryptedDataPacket): Promise<StorageResult<number>> {
    try {
      const key = this.deriveKey();
      const iv = Buffer.from(packet.iv, "base64");
      const tag = Buffer.from(packet.tag, "base64");
      const ciphertext = Buffer.from(packet.ciphertext, "base64");

      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);

      let plaintext = decipher.update(ciphertext);
      plaintext = Buffer.concat([plaintext, decipher.final()]);
      const data = JSON.parse(plaintext.toString("utf8")) as Record<string, string>;

      let count = 0;
      for (const [k, v] of Object.entries(data)) {
        const result = await this.save(k, v);
        if (result.ok) count++;
      }

      return { ok: true, value: count };
    } catch (error) {
      return { ok: false, error: `Import failed: ${(error as Error).message}` };
    }
  }

  // --- 内部方法 ---

  /** 从 safeStorage 派生 AES 密钥 */
  private deriveKey(): Buffer {
    // 使用 safeStorage 加密一个固定种子，然后派生 AES 密钥
    const seed = "ai-animation-studio-key-derivation-seed-v1";
    const encrypted = safeStorage.encryptString(seed);
    // 取加密结果的 SHA-256 作为密钥
    return crypto.createHash("sha256").update(encrypted).digest();
  }

  /** 加载所有密钥数据（带缓存） */
  private async loadAllData(): Promise<Map<string, string>> {
    const secureDir = path.join(getUserDataPath(), "secure");
    if (!fs.existsSync(secureDir)) {
      fs.mkdirSync(secureDir, { recursive: true });
    }

    if (this.dataCache) return this.dataCache;

    const data = new Map<string, string>();

    if (!fs.existsSync(getEncryptedKeysFile())) {
      this.dataCache = data;
      return data;
    }

    try {
      const raw = fs.readFileSync(getEncryptedKeysFile(), "utf-8").trim();
      if (!raw) {
        this.dataCache = data;
        return data;
      }

      // 尝试解密
      let decrypted: string;
      try {
        decrypted = safeStorage.decryptString(Buffer.from(raw, "base64"));
      } catch {
        logger.warn("Failed to decrypt with safeStorage, treating as plaintext");
        decrypted = raw;
      }

      const parsed = JSON.parse(decrypted);
      if (parsed && typeof parsed === "object") {
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") {
            data.set(k, v);
          }
        }
      }
    } catch (error) {
      logger.error("[SafeStorage] Failed to load encrypted keys:", error instanceof Error ? error : new Error(String(error)));
    }

    this.dataCache = data;
    return data;
  }

  /** 保存所有密钥数据 */
  private async saveAllData(data: Map<string, string>): Promise<void> {
    const secureDir = path.join(getUserDataPath(), "secure");
    if (!fs.existsSync(secureDir)) {
      fs.mkdirSync(secureDir, { recursive: true });
    }

    const plaintext = JSON.stringify(Object.fromEntries(data));
    const encrypted = safeStorage.encryptString(plaintext);

    const encryptedKeysFile = getEncryptedKeysFile();
    const tempPath = `${encryptedKeysFile}.tmp`;
    fs.writeFileSync(tempPath, encrypted.toString("base64"));
    fs.renameSync(tempPath, encryptedKeysFile);

    this.dataCache = data;
  }
}
