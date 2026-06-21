import { type ApiConfig } from "./types";
import fs from "fs";
import path from "path";
import { homedir } from "os";
import crypto from "crypto";
import { getServerEncryptionKey } from "./server-key";
import { errorLogger } from "@/shared/error-logger";

const CONFIG_DIR = path.join(homedir(), ".ai-animation-studio");
const CONFIG_FILE = path.join(CONFIG_DIR, "api-config.json");
const IV_LENGTH = 16;

export async function encryptField(text: string): Promise<string> {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    await getServerEncryptionKey(),
    iv,
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `srv:${iv.toString("hex")}:${encrypted}`;
}

export async function decryptField(encrypted: string): Promise<string | null> {
  if (!encrypted.startsWith("srv:")) return null;
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[1]!, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      await getServerEncryptionKey(),
      iv,
    );
    let decrypted = decipher.update(parts[2]!, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    errorLogger.warn("[ApiConfig] Failed to decrypt API key", e as Error);
    return null;
  }
}

export async function encryptConfig(config: ApiConfig): Promise<ApiConfig> {
  return {
    ...config,
    providers: await Promise.all(
      config.providers.map(async (p) => ({
        ...p,
        apiKey: p.apiKey ? await encryptField(p.apiKey) : "",
      })),
    ),
  };
}

export async function decryptConfig(config: ApiConfig): Promise<ApiConfig> {
  return {
    ...config,
    providers: await Promise.all(
      config.providers.map(async (p) => {
        if (p.apiKey && p.apiKey.startsWith("srv:")) {
          const decrypted = await decryptField(p.apiKey);
          return { ...p, apiKey: decrypted || p.apiKey };
        }
        return p;
      }),
    ),
  };
}

export async function loadConfigFromFile(): Promise<ApiConfig | null> {
  try {
    const fsPromises = fs.promises;
    try {
      await fsPromises.access(CONFIG_FILE);
      const content = await fsPromises.readFile(CONFIG_FILE, "utf8");
      const config = JSON.parse(content);
      const decrypted = await decryptConfig(config);
      errorLogger.info("[API Config] 从 api-config.json 加载配置成功");
      return decrypted;
    } catch (error) {
      errorLogger.debug("[API Config] api-config.json 不存在或无法解析:", error instanceof Error ? error.message : error);
    }

    const ipcConfigFile = path.join(CONFIG_DIR, "config.json");
    try {
      await fsPromises.access(ipcConfigFile);
      const content = await fsPromises.readFile(ipcConfigFile, "utf8");
      const config = JSON.parse(content);
      if (config.providers || config.mapping) {
        errorLogger.info("[API Config] 从 config.json (IPC) 回退加载配置成功");
        await saveConfigToFile(config);
        return config;
      }
    } catch (error) {
      errorLogger.debug("[API Config] config.json 不存在或无法解析:", error instanceof Error ? error.message : error);
    }

    errorLogger.warn("[API Config] 没有找到配置文件");
  } catch (error) {
    errorLogger.error("[API Config] 从文件加载配置失败:", error);
  }
  return null;
}

export async function saveConfigToFile(config: ApiConfig): Promise<void> {
  try {
    const fsPromises = fs.promises;
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
    const encrypted = encryptConfig(config);
    const tempPath = `${CONFIG_FILE}.tmp`;
    await fsPromises.writeFile(tempPath, JSON.stringify(encrypted, null, 2));
    await fsPromises.rename(tempPath, CONFIG_FILE);
    try {
      await fsPromises.chmod(CONFIG_FILE, 0o600);
    } catch (error) {
      errorLogger.debug("[API Config] chmod 失败 (非关键):", error instanceof Error ? error.message : error);
    }
    errorLogger.info("[API Config] 配置已加密保存到文件");
  } catch (error) {
    errorLogger.error("[API Config] 保存配置到文件失败:", error);
  }
}
