/**
 * 工具插件类型定义（P3 工具插件化）
 *
 * 设计要点：
 * - 声明式 JSON 格式，用户无需写代码即可扩展 Agent 工具
 * - 支持 3 种 action 类型：http-call / builtin-mirror / text-template
 * - 工具插件加载后注册到 toolRegistry，与内置工具统一管理
 * - 安全约束：http-call 的 URL 必须为 http(s)，禁止内网 IP（防 SSRF）
 *
 * 与 AI Provider 插件系统（electron/src/plugins/）的区别：
 * - Provider 插件：面向 AI 模型调用（13 个内置 + 用户 JSON + 代码插件）
 * - 工具插件：面向 Agent 工具扩展（本文件，仅声明式 JSON，不执行用户代码）
 * - 两者独立，不共享加载机制（分层约束：agent 模块不能 import electron/src/plugins）
 *
 * 文件格式：.tool-plugin.json
 * 存放目录：{cacheDir}/agent/tool-plugins/
 */

import type { ToolDomain } from "./types";

/**
 * 工具插件配置（JSON 文件根结构）
 *
 * 一个插件文件可包含多个工具，共享元信息和可选的 name 前缀。
 */
export interface ToolPluginConfig {
  /** 插件 ID（小写字母+数字+连字符，不可与内置工具域冲突） */
  id: string;
  /** 版本号（语义化版本，如 "1.0.0"） */
  version: string;
  /** 显示名称（UI 展示用） */
  displayName: string;
  /** 插件描述 */
  description?: string;
  /** 作者 */
  author?: string;
  /** 工具列表 */
  tools: ToolPluginTool[];
  /**
   * 工具名前缀（避免与内置工具冲突）
   *
   * 设置后，所有工具的最终注册名为 `${prefix}${tool.name}`。
   * 例如 prefix="wiki_" + tool.name="search" → 注册名 "wiki_search"。
   */
  prefix?: string;
}

/**
 * 单个工具定义
 *
 * 与 ToolImpl 一一对应，但 execute 被 action 替代（声明式执行）。
 */
export interface ToolPluginTool {
  /** 工具名（若 prefix 设置，则最终名为 prefix+name） */
  name: string;
  /** 工具描述（传给 LLM，影响 LLM 调用决策） */
  description: string;
  /** 业务域（用于按域过滤，建议用 "plugin" 或与功能匹配的域） */
  domain: ToolDomain;
  /** 参数 JSON Schema（OpenAI function-calling 格式） */
  parameters: Record<string, unknown>;
  /** 执行动作 */
  action: ToolPluginAction;
  /** 是否需要用户确认（如调用写操作 API） */
  requiresConfirmation?: boolean;
  /** 超时（ms），未设置则使用默认 30s */
  timeoutMs?: number;
}

/**
 * 工具动作（声明式执行）
 *
 * 三种类型：
 * - http-call：调用外部 HTTP API（最常用）
 * - builtin-mirror：镜像内置工具（创建别名或预设参数）
 * - text-template：纯文本模板返回（用于静态响应或快速原型）
 */
export type ToolPluginAction =
  | HttpCallAction
  | BuiltinMirrorAction
  | TextTemplateAction;

/**
 * HTTP 调用动作
 *
 * 调用外部 API 并返回结果。支持模板替换（{{argName}}）。
 *
 * 模板替换规则：
 * - 所有 string 类型的字段（url、headers 值、query 值、body 值）都会替换 {{argName}}
 * - 替换源为工具调用时传入的 args
 * - 未找到的 arg 替换为空字符串
 *
 * 安全约束：
 * - URL 必须 http/https 协议
 * - 禁止 localhost / 127.0.0.0/8 / 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 / ::1 / fc00::/7 / fe80::/10
 * - 超时由 timeoutMs 控制（默认 30s）
 */
export interface HttpCallAction {
  type: "http-call";
  /** 请求 URL（支持 {{arg}} 模板） */
  url: string;
  /** HTTP 方法（默认 GET） */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** 请求头（值支持 {{arg}} 模板） */
  headers?: Record<string, string>;
  /** 查询参数（GET 时拼接到 URL，值支持 {{arg}} 模板） */
  query?: Record<string, string>;
  /** 请求体（POST/PUT 时发送，支持 {{arg}} 模板） */
  body?: Record<string, unknown>;
  /** 响应提取路径（点分，如 "data.results"），不设置则返回完整响应 */
  responsePath?: string;
  /** 响应处理方式（默认 json） */
  responseTransform?: "json" | "text" | "raw";
}

/**
 * 内置工具镜像动作
 *
 * 创建一个内置工具的别名，可预设部分参数。
 * 用于给现有工具起易记的别名，或固化常用参数组合。
 *
 * 参数合并规则：presetArgs 与调用 args 合并，args 优先（可覆盖预设）。
 */
export interface BuiltinMirrorAction {
  type: "builtin-mirror";
  /** 目标内置工具名 */
  targetTool: string;
  /** 预设参数（与调用参数合并，args 优先） */
  presetArgs?: Record<string, unknown>;
}

/**
 * 文本模板动作
 *
 * 返回固定/模板化文本，不发起任何外部调用。
 * 用于快速创建返回说明、帮助信息、固定数据的工具。
 */
export interface TextTemplateAction {
  type: "text-template";
  /** 模板内容（支持 {{arg}} 替换） */
  template: string;
}

/**
 * 工具插件加载结果
 *
 * 单个插件的加载反馈，包含成功注册数、跳过的工具、错误信息。
 */
export interface ToolPluginLoadResult {
  /** 插件 ID */
  pluginId: string;
  /** 成功注册的工具数 */
  registeredCount: number;
  /** 跳过的工具（重名等） */
  skipped: Array<{ name: string; reason: string }>;
  /** 错误信息（适配/注册失败） */
  errors: Array<{ tool: string; error: string }>;
}

/**
 * 插件管理配置（持久化在 agent.toolPlugins 配置键）
 *
 * 记录已启用/禁用的插件 ID，控制加载行为。
 */
export interface ToolPluginsConfig {
  /** 启用的插件 ID 列表（空数组=全部启用） */
  enabled: string[];
  /** 禁用的插件 ID 列表（优先级高于 enabled） */
  disabled: string[];
}
