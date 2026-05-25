/**
 * security/key-storage/strategies/plaintext.strategy.ts
 *
 * 明文回退策略（仅用于开发/测试环境）
 *
 * 当 safeStorage 不可用时，使用 AES-256-GCM 加密存储到本地文件。
 * masterKey 从机器特征派生（非安全，仅作为回退方案）。
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { KeyStorageStrategy, StorageResult } from "../types";
import { getUserDataPath } from "../../../database/db-schema";
import { getLogger } from "../../../logging/logger";

const logger = getLogger("key-storage-fallback");

function getEncryptedKeysFile(): string {
  return path.join(getUserDataPath(), "secure", "encrypted-keys.fallback.json");
}

export class PlaintextFallbackStrategy implements KeyStorageStrategy {
  readonly name = "plaintext-fallback";
  readonly priority = 99; // 最低优先级

  private dataCache: Map<string, string> | null = null;

  isAvailable(): boolean {
    // 始终可用，但应发出警告
    return true;
  }

  async save(key: string, value: string): Promise<StorageResult> {
    try {
      const data = await this.loadAllData();
      data.set(key, value);
      await this.saveAllData(data);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `Fallback save failed: ${(error as Error).message}` };
    }
  }

  async load(key: string): Promise<StorageResult<string | null>> {
    try {
      const data = await this.loadAllData();
      const value = data.get(key) ?? null;
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: `Fallback load failed: ${(error as Error).message}` };
    }
  }

  async delete(key: string): Promise<StorageResult> {
    try {
      const data = await this.loadAllData();
      data.delete(key);
      await this.saveAllData(data);
      this.dataCache = null;
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: `Fallback delete failed: ${(error as Error).message}` };
    }
  }

  async list(): Promise<StorageResult<string[]>> {
    try {
      const data = await this.loadAllData();
      return { ok: true, value: Array.from(data.keys()) };
    } catch (error) {
      return { ok: false, error: `Fallback list failed: ${(error as Error).message}` };
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
      return { ok: false, error: `Fallback clear failed: ${(error as Error).message}` };
    }
  }

  // --- 内部方法 ---

  /** 从机器特征派生 masterKey（非安全，仅回退用） */
  private getMachineId(): string {
    try {
      const { machineIdSync } = require("node-machine-id") as { machineIdSync: () => string };
      return machineIdSync();
    } catch (e) { logger.warn("密钥存储操作失败", { error: e instanceof Error ? e.message : String(e) }); }
    const idFile = path.join(getUserDataPath(), "secure", ".machine-id");
    try {
      if (fs.existsSync(idFile)) {
        return fs.readFileSync(idFile, "utf-8").trim();
      }
    } catch (e) { logger.warn("密钥存储操作失败", { error: e instanceof Error ? e.message : String(e) }); }
    const newId = crypto.randomUUID();
    try {
      const dir = path.dirname(idFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(idFile, newId, { mode: 0o600 });
      return newId;
    } catch {
      const userDataPath = getUserDataPath();
      return crypto.createHash("sha256").update(userDataPath).digest("hex");
    }
  }

  private deriveKey(): Buffer {
    const machineId = this.getMachineId();
    const machineFingerprint = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.homedir(),
      machineId,
    ].join("|");
    return crypto.createHash("sha256")
      .update(`aas-fallback-v2:${machineFingerprint}`)
      .digest();
  }

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

      const packet = JSON.parse(raw);

      // 如果是加密格式
      if (packet.iv && packet.ciphertext) {
        const key = this.deriveKey();
        const iv = Buffer.from(packet.iv, "base64");
        const tag = Buffer.from(packet.tag, "base64");
        const ciphertext = Buffer.from(packet.ciphertext, "base64");

        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);

        let plaintext = decipher.update(ciphertext);
        plaintext = Buffer.concat([plaintext, decipher.final()]);
        const parsed = JSON.parse(plaintext.toString("utf8")) as Record<string, string>;

        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") data.set(k, v);
        }
      } else {
        // 明文 JSON（旧格式）
        for (const [k, v] of Object.entries(packet)) {
          if (typeof v === "string") data.set(k, v);
        }
      }
    } catch (error) {
      logger.error("[FallbackStorage] Failed to load keys:", error instanceof Error ? error : new Error(String(error)));
    }

    this.dataCache = data;
    return data;
  }

  private async saveAllData(data: Map<string, string>): Promise<void> {
    const secureDir = path.join(getUserDataPath(), "secure");
    if (!fs.existsSync(secureDir)) {
      fs.mkdirSync(secureDir, { recursive: true });
    }

    const plaintext = JSON.stringify(Object.fromEntries(data));
    const key = this.deriveKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let ciphertext = cipher.update(plaintext, "utf8");
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const tag = cipher.getAuthTag();

    const packet = {
      alg: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      createdAt: new Date().toISOString(),
      strategy: this.name,
    };

    const encryptedKeysFile = getEncryptedKeysFile();
    const tempPath = `${encryptedKeysFile}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(packet, null, 2));
    fs.renameSync(tempPath, encryptedKeysFile);

    this.dataCache = data;
  }
}
