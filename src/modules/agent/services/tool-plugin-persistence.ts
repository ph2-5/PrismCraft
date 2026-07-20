/**
 * 工具插件文件持久化（P3 工具插件化）
 *
 * 从 tool-plugin-loader.ts 拆分而来，目的：
 * - 降低主文件行数（原 849 行 > max-lines 500）
 * - 隔离文件 I/O 和索引管理逻辑
 *
 * 包含：
 * - saveToolPluginFile: 保存插件配置到文件 + 更新索引
 * - deleteToolPluginFile: 删除插件文件 + 更新索引
 * - listToolPluginFiles: 列出所有已保存的插件配置
 * - getPluginsConfig: 读取启用/禁用配置
 *
 * 索引管理（私有）：
 * - getPluginIndex / updatePluginIndex / removePluginFromIndex
 *
 * 所有文件操作通过 @/shared/file-http 统一层，禁止直接调用 electronAPI。
 */

import type {
  ToolPluginConfig,
  ToolPluginsConfig,
} from "../domain/tool-plugin-types";
import { getCacheDirectory, readFile, writeFile, deleteFile, getConfig, setConfig } from "@/shared/file-http";
import { validateConfig } from "./tool-plugin-validator";

// ============= 常量 =============

/** 工具插件目录（相对缓存目录） */
const TOOL_PLUGINS_DIR = "agent/tool-plugins";

/** 索引配置键：记录所有已保存的插件文件列表 */
const TOOL_PLUGINS_INDEX_KEY = "agent.toolPlugins.index";

/** 启用/禁用配置键 */
const TOOL_PLUGINS_CONFIG_KEY = "agent.toolPlugins";

// ============= 索引类型 =============

interface PluginIndexEntry {
  id: string;
  fileName: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
}

// ============= 路径辅助 =============

/**
 * 获取插件目录绝对路径
 *
 * 目录：{cacheDir}/agent/tool-plugins/
 */
async function getPluginsDir(): Promise<string | null> {
  const result = await getCacheDirectory();
  if (!result.success || !result.path) return null;
  return `${result.path}/${TOOL_PLUGINS_DIR}`;
}

/**
 * 生成插件文件名
 *
 * 格式：{pluginId}.tool-plugin.json
 */
function pluginFileName(pluginId: string): string {
  return `${pluginId}.tool-plugin.json`;
}

// ============= 索引管理 =============

/** 读取插件索引 */
async function getPluginIndex(): Promise<PluginIndexEntry[]> {
  try {
    const raw = await getConfig(TOOL_PLUGINS_INDEX_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is PluginIndexEntry =>
        e && typeof e === "object" && typeof e.id === "string" && typeof e.fileName === "string",
    );
  } catch {
    return [];
  }
}

/** 更新插件索引（追加或替换同 id 条目） */
async function updatePluginIndex(pluginId: string, entry: PluginIndexEntry): Promise<void> {
  try {
    const index = await getPluginIndex();
    const filtered = index.filter((e) => e.id !== pluginId);
    filtered.push(entry);
    await setConfig(TOOL_PLUGINS_INDEX_KEY, filtered);
  } catch (e) {
    console.warn(`[ToolPlugin] 更新索引失败:`, e);
  }
}

/** 从索引中移除插件 */
async function removePluginFromIndex(pluginId: string): Promise<void> {
  try {
    const index = await getPluginIndex();
    const filtered = index.filter((e) => e.id !== pluginId);
    await setConfig(TOOL_PLUGINS_INDEX_KEY, filtered);
  } catch (e) {
    console.warn(`[ToolPlugin] 移除索引失败:`, e);
  }
}

// ============= 文件持久化 =============

/**
 * 保存插件配置到文件 + 更新索引
 *
 * 流程：
 * 1. 写入 {cacheDir}/agent/tool-plugins/{pluginId}.tool-plugin.json
 * 2. 更新 agent.toolPlugins.index 配置键（追加/更新条目）
 *
 * @returns true 成功，false 失败
 */
export async function saveToolPluginFile(config: ToolPluginConfig): Promise<boolean> {
  const dir = await getPluginsDir();
  if (!dir) return false;

  const filePath = `${dir}/${pluginFileName(config.id)}`;
  try {
    const result = await writeFile(filePath, JSON.stringify(config, null, 2));
    if (!result.success) return false;
  } catch {
    return false;
  }

  // 更新索引
  await updatePluginIndex(config.id, {
    id: config.id,
    fileName: pluginFileName(config.id),
    displayName: config.displayName,
    version: config.version,
    description: config.description,
    author: config.author,
  });

  return true;
}

/**
 * 删除插件文件 + 更新索引
 *
 * 注意：不自动卸载已加载的工具，调用方应先调用 unloadPlugin。
 */
export async function deleteToolPluginFile(pluginId: string): Promise<boolean> {
  const dir = await getPluginsDir();
  if (!dir) return false;

  const filePath = `${dir}/${pluginFileName(pluginId)}`;
  try {
    const ok = await deleteFile(filePath);
    if (!ok) return false;
  } catch {
    return false;
  }

  // 从索引中移除
  await removePluginFromIndex(pluginId);
  return true;
}

/**
 * 列出所有已保存的插件配置
 *
 * 从索引读取文件列表，逐个读取并解析。
 * 损坏的文件会被跳过（记录到 console.warn）。
 */
export async function listToolPluginFiles(): Promise<ToolPluginConfig[]> {
  const index = await getPluginIndex();
  if (index.length === 0) return [];

  const dir = await getPluginsDir();
  if (!dir) return [];

  const configs: ToolPluginConfig[] = [];
  for (const entry of index) {
    const filePath = `${dir}/${entry.fileName}`;
    try {
      const result = await readFile(filePath);
      if (!result?.success || !result.data) continue;
      const text = new TextDecoder().decode(result.data);
      const parsed = JSON.parse(text) as unknown;
      const validation = validateConfig(parsed);
      if (!validation.ok) {
        console.warn(`[ToolPlugin] 插件 ${entry.id} 配置校验失败:`, validation.errors);
        continue;
      }
      configs.push(parsed as ToolPluginConfig);
    } catch (e) {
      console.warn(`[ToolPlugin] 读取插件文件 ${entry.fileName} 失败:`, e);
    }
  }
  return configs;
}

// ============= 启用/禁用配置 =============

/**
 * 读取启用/禁用配置
 *
 * 默认返回 { enabled: [], disabled: [] }（全部启用）。
 */
export async function getPluginsConfig(): Promise<ToolPluginsConfig> {
  try {
    const raw = await getConfig(TOOL_PLUGINS_CONFIG_KEY);
    if (!raw || typeof raw !== "object") {
      return { enabled: [], disabled: [] };
    }
    const c = raw as Record<string, unknown>;
    return {
      enabled: Array.isArray(c.enabled) ? c.enabled.filter((x): x is string => typeof x === "string") : [],
      disabled: Array.isArray(c.disabled) ? c.disabled.filter((x): x is string => typeof x === "string") : [],
    };
  } catch {
    return { enabled: [], disabled: [] };
  }
}
