import fs from "fs";
import path from "path";
import { getLogger } from "../logging/logger";
import type { AIProviderPlugin } from "./types";
import type { UserPluginConfig } from "./user-plugin-schema";
import { validatePluginConfig } from "./user-plugin-schema";
import { UserPluginAdapter } from "./user-plugin-adapter";
import { getUserDataSubDir } from "../app-paths";

const logger = getLogger("user-plugin-loader");

const USER_PLUGINS_DIR = getUserDataSubDir("Plugins");

export function loadUserPlugins(): AIProviderPlugin[] {
  const plugins: AIProviderPlugin[] = [];

  if (!fs.existsSync(USER_PLUGINS_DIR)) {
    try {
      fs.mkdirSync(USER_PLUGINS_DIR, { recursive: true });
      const examplePath = path.join(USER_PLUGINS_DIR, "_example.plugin.json");
      if (!fs.existsSync(examplePath)) {
        fs.writeFileSync(examplePath, JSON.stringify(EXAMPLE_PLUGIN, null, 2), "utf-8");
      }
    } catch (e) {
      logger.warn(
        `Failed to create plugins directory: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return plugins;
  }

  const files: string[] = [];
  try {
    const entries = fs.readdirSync(USER_PLUGINS_DIR);
    for (const entry of entries) {
      if (entry.endsWith(".plugin.json") || entry.endsWith(".json")) {
        files.push(path.join(USER_PLUGINS_DIR, entry));
      }
    }
  } catch (e) {
    logger.warn(
      `Failed to read plugins directory: ${e instanceof Error ? e.message : String(e)}`,
    );
    return plugins;
  }

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const config = JSON.parse(content) as UserPluginConfig;
      const validation = validatePluginConfig(config);

      if (!validation.valid) {
        logger.warn(
          `Invalid plugin config in ${path.basename(filePath)}: ${validation.errors.join("; ")}`,
        );
        continue;
      }

      const plugin = new UserPluginAdapter(config);
      plugins.push(plugin);
      logger.info(
        `Loaded user plugin: ${config.id} (${config.displayName}) from ${path.basename(filePath)}`,
      );
    } catch (e) {
      logger.warn(
        `Failed to load plugin from ${path.basename(filePath)}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return plugins;
}

export function saveUserPlugin(config: UserPluginConfig): {
  success: boolean;
  error?: string;
  filePath?: string;
} {
  const validation = validatePluginConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join("; ") };
  }

  try {
    if (!fs.existsSync(USER_PLUGINS_DIR)) {
      fs.mkdirSync(USER_PLUGINS_DIR, { recursive: true });
    }

    const fileName = `${config.id}.plugin.json`;
    const filePath = path.join(USER_PLUGINS_DIR, fileName);
    const backupPath = filePath + ".bak";
    let hadBackup = false;

    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath);
      hadBackup = true;
    }

    try {
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
    } catch (writeError) {
      if (hadBackup) {
        try {
          fs.copyFileSync(backupPath, filePath);
        } catch (_restoreError) {
          logger.warn(`Failed to restore backup after write failure`);
        }
      }
      throw writeError;
    }

    if (hadBackup) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        logger.warn(`Failed to clean up backup file: ${backupPath}`);
      }
    }

    return { success: true, filePath };
  } catch (e) {
    return {
      success: false,
      error: `保存失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function deleteUserPlugin(pluginId: string): {
  success: boolean;
  error?: string;
} {
  const fileName = `${pluginId}.plugin.json`;
  const filePath = path.join(USER_PLUGINS_DIR, fileName);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: `插件文件不存在: ${fileName}` };
  } catch (e) {
    return {
      success: false,
      error: `删除失败: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function listUserPluginFiles(): Array<{
  id: string;
  fileName: string;
  filePath: string;
  displayName: string;
  version: string;
  valid: boolean;
  errors: string[];
}> {
  const result: Array<{
    id: string;
    fileName: string;
    filePath: string;
    displayName: string;
    version: string;
    valid: boolean;
    errors: string[];
  }> = [];

  if (!fs.existsSync(USER_PLUGINS_DIR)) {
    return result;
  }

  try {
    const entries = fs.readdirSync(USER_PLUGINS_DIR);
    for (const entry of entries) {
      if (!entry.endsWith(".plugin.json") && !entry.endsWith(".json")) continue;
      if (entry.startsWith("_")) continue;

      const filePath = path.join(USER_PLUGINS_DIR, entry);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const config = JSON.parse(content);
        const validation = validatePluginConfig(config);

        result.push({
          id: config.id || "unknown",
          fileName: entry,
          filePath,
          displayName: config.displayName || "Unknown",
          version: config.version || "0.0.0",
          valid: validation.valid,
          errors: validation.errors,
        });
      } catch (e) {
        result.push({
          id: "parse-error",
          fileName: entry,
          filePath,
          displayName: "解析失败",
          version: "0.0.0",
          valid: false,
          errors: [`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`],
        });
      }
    }
  } catch (e) {
    logger.warn(
      `Failed to list user plugins: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return result;
}

export { USER_PLUGINS_DIR };
export { UserPluginAdapter } from "./user-plugin-adapter";

const EXAMPLE_PLUGIN: UserPluginConfig = {
  id: "my-custom-provider",
  version: "1.0.0",
  displayName: "我的自定义提供商",
  description: "自定义 AI 提供商插件示例",
  author: "",
  match: {
    apiUrlPatterns: ["api.my-provider.com"],
    modelPatterns: ["my-model"],
  },
  capabilities: {
    video: {
      supportsLastFrame: true,
      supportsReferenceVideo: false,
      supportsMimicryLevel: false,
      defaultModel: "my-model-v1",
      maxDuration: 10,
    },
    image: {
      supportsReferenceImage: false,
      defaultModel: "my-model-v1",
    },
  },
  transport: {
    imageMode: "base64",
    videoMode: "url",
    preferLocalData: true,
  },
  auth: {
    type: "bearer",
  },
  endpoints: {
    video: {
      generate: "/v1/videos/generations",
      status: "/v1/videos/{taskId}",
    },
    image: {
      generate: "/v1/images/generations",
    },
    text: {
      generate: "/v1/chat/completions",
    },
  },
  request: {
    video: {
      bodyFormat: "flat",
    },
    image: {
      bodyFormat: "flat",
    },
    text: {
      bodyFormat: "openai",
    },
  },
  response: {
    video: {
      taskIdPath: "data.id",
      videoUrlPath: "data.video_url",
    },
    image: {
      imageUrlPath: "data.url",
    },
  },
};
