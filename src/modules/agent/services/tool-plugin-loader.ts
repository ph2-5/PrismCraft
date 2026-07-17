/**
 * 工具插件加载器（P3 工具插件化）
 *
 * 设计要点：
 * - 从用户目录加载声明式 JSON 工具插件，注册到 toolRegistry
 * - 支持 3 种 action：http-call / builtin-mirror / text-template
 * - 模板替换：{{argName}} 从工具参数取值（递归渲染对象中的所有字符串）
 * - 安全约束：
 *   - http-call URL 必须 http(s) 协议
 *   - 禁止内网 IP（防 SSRF）：127.0.0.0/8 / 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 / ::1 / fc00::/7 / fe80::/10
 *   - localhost 禁止
 * - 冲突检测：与内置工具/其他插件重名时跳过并记录
 * - 幂等加载：重复加载同插件先卸载旧工具再注册新的
 * - 索引持久化：通过 agent.toolPlugins.index 配置键记录插件文件列表
 *
 * 与 AI Provider 插件系统的关系：
 * - 完全独立，不共享加载机制（分层约束）
 * - 本加载器在渲染进程运行，仅处理 JSON 配置，不执行用户代码
 * - Provider 插件在主进程，支持代码插件（worker 进程隔离）
 *
 * 集成点：
 * - registerAllTools() 注册内置工具后，调用 ensureToolPluginsLoaded() 加载用户插件
 * - AgentLoop 通过 toolRegistry 统一调用所有工具（内置 + 插件）
 * - 插件工具自动出现在 list_available_commands 工具的输出中
 */

import type { ToolImpl, ToolResult, ToolContext, DangerLevel } from "../domain/types";
import type {
  ToolPluginConfig,
  ToolPluginTool,
  HttpCallAction,
  BuiltinMirrorAction,
  TextTemplateAction,
  ToolPluginLoadResult,
  ToolPluginsConfig,
} from "../domain/tool-plugin-types";
import { toolRegistry } from "./tool-registry";
import { getCacheDirectory, readFile, writeFile, deleteFile, getConfig, setConfig } from "@/shared/file-http";

// ============= 常量 =============

/** 工具插件目录（相对缓存目录） */
const TOOL_PLUGINS_DIR = "agent/tool-plugins";

/** 索引配置键：记录所有已保存的插件文件列表 */
const TOOL_PLUGINS_INDEX_KEY = "agent.toolPlugins.index";

/** 启用/禁用配置键 */
const TOOL_PLUGINS_CONFIG_KEY = "agent.toolPlugins";

/** 默认 HTTP 调用超时 */
const DEFAULT_HTTP_TIMEOUT_MS = 30000;

/** 内网 IP 模式（防 SSRF） */
const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0/,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

// ============= 已加载插件记录 =============

interface LoadedPlugin {
  pluginId: string;
  toolNames: string[];
  config: ToolPluginConfig;
}

/** 已加载的插件映射（pluginId → LoadedPlugin） */
const loadedPlugins = new Map<string, LoadedPlugin>();

// ============= 模板替换 =============

/**
 * 将 {{arg}} 替换为 args 中对应的值
 *
 * 未找到的 arg 替换为空字符串。值会被 String() 转换。
 */
function renderTemplate(tpl: string, args: Record<string, unknown>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = args[key];
    if (val === undefined || val === null) return "";
    return String(val);
  });
}

/**
 * 递归渲染对象中的所有字符串模板
 *
 * 遍历对象/数组的所有字符串字段，应用 renderTemplate。
 * 非字符串值原样返回。
 */
function renderObject(obj: unknown, args: Record<string, unknown>): unknown {
  if (typeof obj === "string") return renderTemplate(obj, args);
  if (Array.isArray(obj)) return obj.map((v) => renderObject(v, args));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = renderObject(v, args);
    }
    return result;
  }
  return obj;
}

// ============= 安全检查 =============

/**
 * 校验 URL 安全性（防 SSRF）
 *
 * 规则：
 * - 必须 http/https 协议
 * - 禁止 localhost
 * - 禁止内网 IP（私有地址段）
 *
 * @returns ok=true 通过，ok=false 时 error 为错误信息
 */
function validateUrl(url: string): { ok: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: `无效 URL: ${url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `仅支持 http/https 协议，当前: ${parsed.protocol}` };
  }
  const host = parsed.hostname;
  if (host === "localhost") {
    return { ok: false, error: `禁止访问 localhost` };
  }
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(host))) {
    return { ok: false, error: `禁止访问内网地址: ${host}` };
  }
  return { ok: true };
}

// ============= 路径提取 =============

/**
 * 从对象中按点分路径提取值
 *
 * 例如 extractPath({ data: { results: [1,2] } }, "data.results") → [1, 2]
 * 路径不存在时返回 undefined。
 */
function extractPath(data: unknown, path: string): unknown {
  if (!path) return data;
  const parts = path.split(".");
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// ============= Action 执行 =============

/**
 * 执行 http-call action
 *
 * 流程：
 * 1. 模板替换 URL/headers/query/body
 * 2. SSRF 校验
 * 3. 合并 query 到 URL
 * 4. fetch + 超时控制（AbortController）
 * 5. 响应解析（json/text/raw）
 * 6. 路径提取
 */
async function executeHttpCall(
  action: HttpCallAction,
  args: Record<string, unknown>,
  ctx: ToolContext,
  timeoutMs: number,
): Promise<ToolResult> {
  const url = renderTemplate(action.url, args);
  const urlCheck = validateUrl(url);
  if (!urlCheck.ok) {
    return { success: false, error: urlCheck.error, duration: 0 };
  }

  const method = action.method ?? "GET";
  const headers = renderObject(action.headers, args) as Record<string, string> | undefined;
  const query = renderObject(action.query, args) as Record<string, string> | undefined;

  // 构建最终 URL（合并 query 参数）
  const finalUrl = new URL(url);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      finalUrl.searchParams.set(k, v);
    }
  }

  const fetchOptions: RequestInit = { method, headers };
  if (method !== "GET" && method !== "DELETE" && action.body) {
    const renderedBody = renderObject(action.body, args);
    fetchOptions.body = JSON.stringify(renderedBody);
    fetchOptions.headers = {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    };
  }

  // 超时 + 外部取消
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (ctx.signal) {
    if (ctx.signal.aborted) {
      clearTimeout(timer);
      return { success: false, error: "已取消", duration: 0 };
    }
    ctx.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(finalUrl.toString(), {
      ...fetchOptions,
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        duration: 0,
      };
    }

    const transform = action.responseTransform ?? "json";
    let data: unknown;
    if (transform === "text") {
      data = await response.text();
    } else if (transform === "raw") {
      data = { status: response.status, ok: response.ok, url: response.url };
    } else {
      data = await response.json();
    }

    if (action.responsePath) {
      data = extractPath(data, action.responsePath);
    }

    return { success: true, data, duration: 0 };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // AbortError 区分超时 vs 外部取消
    if (e instanceof Error && e.name === "AbortError") {
      return {
        success: false,
        error: ctx.signal?.aborted ? "已取消" : `请求超时（${timeoutMs}ms）`,
        duration: 0,
      };
    }
    return { success: false, error: errMsg, duration: 0 };
  } finally {
    clearTimeout(timer);
    if (ctx.signal) {
      ctx.signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * 执行 builtin-mirror action
 *
 * 调用目标内置工具，合并 presetArgs（args 优先）。
 *
 * 安全规则：builtin-mirror **必须继承**目标工具的 dangerLevel/requiresConfirmation，
 * 防止插件通过 mirror 包装绕过危险工具的用户确认机制。
 */
async function executeBuiltinMirror(
  action: BuiltinMirrorAction,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const target = toolRegistry.get(action.targetTool);
  if (!target) {
    return {
      success: false,
      error: `目标内置工具 ${action.targetTool} 不存在`,
      duration: 0,
    };
  }
  // presetArgs 作为默认值，args 可覆盖
  const mergedArgs = { ...(action.presetArgs ?? {}), ...args };
  return target.execute(mergedArgs, ctx);
}

/**
 * 执行 text-template action
 *
 * 渲染模板并返回文本，不发起任何外部调用。
 */
async function executeTextTemplate(
  action: TextTemplateAction,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const text = renderTemplate(action.template, args);
  return { success: true, data: { text }, duration: 0 };
}

// ============= 工具适配 =============

/**
 * 将插件工具配置转为 ToolImpl
 *
 * execute 函数根据 action.type 分派到对应的执行器。
 * 失败统一捕获并返回 ToolResult.error。
 *
 * 安全规则：
 * - builtin-mirror 类型**必须继承**目标工具的 dangerLevel/requiresConfirmation，
 *   插件配置中的 requiresConfirmation 字段对 mirror 类型被忽略
 * - 这防止插件通过 mirror 包装危险工具（如 delete_file）并设置 requiresConfirmation:false
 *   来绕过用户确认机制
 */
function adaptTool(pluginTool: ToolPluginTool, prefix?: string): ToolImpl {
  const finalName = prefix ? `${prefix}${pluginTool.name}` : pluginTool.name;
  const action = pluginTool.action;
  const timeoutMs = pluginTool.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;

  // builtin-mirror 安全规则：继承目标工具的权限标记，忽略插件声明的 requiresConfirmation
  let effectiveDangerLevel: DangerLevel | undefined;
  let effectiveRequiresConfirmation: boolean | undefined;

  if (action.type === "builtin-mirror") {
    const targetTool = toolRegistry.get(action.targetTool);
    if (targetTool) {
      // 继承目标工具的危险等级
      effectiveDangerLevel = targetTool.dangerLevel;
      effectiveRequiresConfirmation = targetTool.requiresConfirmation;
    } else {
      // 目标工具不存在时默认为 destructive（安全默认）
      effectiveDangerLevel = "destructive";
      effectiveRequiresConfirmation = true;
    }
  } else {
    // 非 mirror 类型：使用插件声明的权限标记
    effectiveRequiresConfirmation = pluginTool.requiresConfirmation;
  }

  return {
    def: {
      type: "function",
      function: {
        name: finalName,
        description: pluginTool.description,
        parameters: pluginTool.parameters,
      },
    },
    domain: pluginTool.domain,
    dangerLevel: effectiveDangerLevel,
    requiresConfirmation: effectiveRequiresConfirmation,
    timeoutMs,
    async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      try {
        switch (action.type) {
          case "http-call":
            return await executeHttpCall(action, args, ctx, timeoutMs);
          case "builtin-mirror":
            return await executeBuiltinMirror(action, args, ctx);
          case "text-template":
            return await executeTextTemplate(action, args);
          default:
            return {
              success: false,
              error: `未知 action 类型: ${(action as { type: string }).type}`,
              duration: 0,
            };
        }
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : String(e),
          duration: 0,
        };
      }
    },
  };
}

// ============= 配置校验 =============

/**
 * 校验插件配置（运行时类型检查）
 *
 * 不使用 Zod（避免引入依赖），手工校验关键字段。
 * 校验失败时返回错误信息列表。
 */
export function validateConfig(config: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== "object") {
    return { ok: false, errors: ["配置必须为对象"] };
  }
  const c = config as Record<string, unknown>;
  if (typeof c.id !== "string" || !/^[a-z0-9-]+$/.test(c.id)) {
    errors.push("id 必须为小写字母+数字+连字符");
  }
  if (typeof c.version !== "string" || !c.version) {
    errors.push("version 必须为非空字符串");
  }
  if (typeof c.displayName !== "string" || !c.displayName) {
    errors.push("displayName 必须为非空字符串");
  }
  if (!Array.isArray(c.tools) || c.tools.length === 0) {
    errors.push("tools 必须为非空数组");
    return { ok: false, errors };
  }
  for (let i = 0; i < c.tools.length; i++) {
    const t = c.tools[i] as Record<string, unknown>;
    const prefix = `tools[${i}]`;
    if (!t || typeof t !== "object") {
      errors.push(`${prefix} 必须为对象`);
      continue;
    }
    if (typeof t.name !== "string" || !/^[a-z_][a-z0-9_]*$/.test(t.name)) {
      errors.push(`${prefix}.name 必须为合法标识符（小写字母/数字/下划线，不能以数字开头）`);
    }
    if (typeof t.description !== "string" || !t.description) {
      errors.push(`${prefix}.description 必须为非空字符串`);
    }
    if (typeof t.domain !== "string") {
      errors.push(`${prefix}.domain 必须为字符串`);
    }
    if (!t.parameters || typeof t.parameters !== "object") {
      errors.push(`${prefix}.parameters 必须为对象（JSON Schema）`);
    }
    if (!t.action || typeof t.action !== "object") {
      errors.push(`${prefix}.action 必须为对象`);
    } else {
      const action = t.action as Record<string, unknown>;
      if (!["http-call", "builtin-mirror", "text-template"].includes(action.type as string)) {
        errors.push(`${prefix}.action.type 必须为 http-call / builtin-mirror / text-template`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// ============= 加载/卸载 =============

/**
 * 加载单个插件配置
 *
 * 流程：
 * 1. 校验配置
 * 2. 卸载已加载的同名插件（幂等）
 * 3. 适配每个工具为 ToolImpl
 * 4. 冲突检测（与已注册工具重名时跳过）
 * 5. 注册到 toolRegistry
 *
 * @param config 插件配置对象
 * @returns 加载结果（成功数/跳过/错误）
 */
export async function loadToolPlugin(config: ToolPluginConfig): Promise<ToolPluginLoadResult> {
  const result: ToolPluginLoadResult = {
    pluginId: config.id,
    registeredCount: 0,
    skipped: [],
    errors: [],
  };

  // 校验配置
  const validation = validateConfig(config);
  if (!validation.ok) {
    for (const err of validation.errors) {
      result.errors.push({ tool: "(config)", error: err });
    }
    return result;
  }

  // 卸载已加载的同名插件
  unloadPlugin(config.id);

  // 适配 + 冲突检测
  const toolsToRegister: ToolImpl[] = [];
  for (const pluginTool of config.tools) {
    const finalName = config.prefix ? `${config.prefix}${pluginTool.name}` : pluginTool.name;
    if (toolRegistry.has(finalName)) {
      result.skipped.push({ name: finalName, reason: "与已注册工具重名" });
      continue;
    }
    try {
      toolsToRegister.push(adaptTool(pluginTool, config.prefix));
    } catch (e) {
      result.errors.push({
        tool: finalName,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 注册（逐个注册，单个失败不影响其他）
  const registeredNames: string[] = [];
  for (const tool of toolsToRegister) {
    try {
      toolRegistry.register(tool);
      registeredNames.push(tool.def.function.name);
      result.registeredCount++;
    } catch (e) {
      result.errors.push({
        tool: tool.def.function.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  loadedPlugins.set(config.id, {
    pluginId: config.id,
    toolNames: registeredNames,
    config,
  });

  return result;
}

/**
 * 卸载插件
 *
 * 从 toolRegistry 中移除该插件的所有工具。
 * 不存在时返回 false（幂等）。
 */
export function unloadPlugin(pluginId: string): boolean {
  const loaded = loadedPlugins.get(pluginId);
  if (!loaded) return false;
  for (const name of loaded.toolNames) {
    toolRegistry.unregister(name);
  }
  loadedPlugins.delete(pluginId);
  return true;
}

/**
 * 列出已加载的插件
 *
 * 返回已加载插件的元信息（不包含完整配置，避免泄露内部细节）。
 */
export function listLoadedPlugins(): Array<{
  pluginId: string;
  displayName: string;
  version: string;
  toolNames: string[];
}> {
  return Array.from(loadedPlugins.values()).map((p) => ({
    pluginId: p.pluginId,
    displayName: p.config.displayName,
    version: p.config.version,
    toolNames: [...p.toolNames],
  }));
}

// ============= 文件持久化 =============

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

// ============= 索引管理 =============

interface PluginIndexEntry {
  id: string;
  fileName: string;
  displayName: string;
  version: string;
  description?: string;
  author?: string;
}

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

// ============= 启用/禁用配置 =============

/**
 * 读取启用/禁用配置
 *
 * 默认返回 { enabled: [], disabled: [] }（全部启用）。
 */
async function getPluginsConfig(): Promise<ToolPluginsConfig> {
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

// ============= 批量加载 =============

/**
 * 加载所有已保存的插件
 *
 * 流程：
 * 1. 读取索引
 * 2. 读取启用/禁用配置
 * 3. 过滤掉禁用的插件
 * 4. 逐个读取文件 + 校验 + 加载
 *
 * @returns 每个插件的加载结果
 */
export async function loadAllToolPlugins(): Promise<ToolPluginLoadResult[]> {
  const configs = await listToolPluginFiles();
  if (configs.length === 0) return [];

  const pluginsConfig = await getPluginsConfig();
  const disabledSet = new Set(pluginsConfig.disabled);
  // enabled 为空表示全部启用；非空表示只启用列表中的
  const enabledSet = new Set(pluginsConfig.enabled);

  const results: ToolPluginLoadResult[] = [];
  for (const config of configs) {
    // 禁用优先级高于启用
    if (disabledSet.has(config.id)) continue;
    // enabled 非空时，只加载列表中的
    if (enabledSet.size > 0 && !enabledSet.has(config.id)) continue;

    try {
      const result = await loadToolPlugin(config);
      results.push(result);
    } catch (e) {
      results.push({
        pluginId: config.id,
        registeredCount: 0,
        skipped: [],
        errors: [
          {
            tool: "(load)",
            error: e instanceof Error ? e.message : String(e),
          },
        ],
      });
    }
  }
  return results;
}

/** 是否已加载过用户插件（幂等标志） */
let pluginsLoaded = false;

/**
 * 确保用户插件已加载（幂等）
 *
 * 首次调用时加载所有插件，后续调用无副作用。
 * 在 registerAllTools() 之后调用。
 */
export async function ensureToolPluginsLoaded(): Promise<void> {
  if (pluginsLoaded) return;
  pluginsLoaded = true;
  try {
    const results = await loadAllToolPlugins();
    const totalRegistered = results.reduce((sum, r) => sum + r.registeredCount, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped.length, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
    if (totalRegistered > 0 || totalSkipped > 0 || totalErrors > 0) {
      console.info(
        `[ToolPlugin] 加载完成: ${results.length} 个插件, ${totalRegistered} 个工具注册成功, ${totalSkipped} 跳过, ${totalErrors} 错误`,
      );
    }
  } catch (e) {
    console.warn(`[ToolPlugin] 加载用户插件失败:`, e);
  }
}

/**
 * 重置加载状态（仅测试用）
 *
 * 卸载所有已加载的插件工具，重置幂等标志。
 */
export function _resetToolPlugins(): void {
  for (const pluginId of Array.from(loadedPlugins.keys())) {
    unloadPlugin(pluginId);
  }
  pluginsLoaded = false;
}

// ============= 测试辅助 =============

/**
 * 获取已加载插件的完整配置（仅测试用）
 *
 * 用于测试断言插件是否正确加载。
 */
export function _getLoadedPluginConfig(pluginId: string): ToolPluginConfig | undefined {
  return loadedPlugins.get(pluginId)?.config;
}

// ============= 模板替换导出（供测试） =============

export const _testUtils = {
  renderTemplate,
  renderObject,
  validateUrl,
  validateConfig,
  extractPath,
};
