/**
 * 工具插件 Action 执行器（P3 工具插件化）
 *
 * 从 tool-plugin-loader.ts 拆分而来，目的：
 * - 降低主文件行数（原 849 行 > max-lines 500）
 * - 通过提取子函数降低 executeHttpCall 的 complexity（原 23 > 20）
 *
 * 包含：
 * - executeHttpCall: 执行 http-call action（含 SSRF 校验、超时、响应解析）
 * - executeBuiltinMirror: 执行 builtin-mirror action（继承目标工具权限）
 * - executeTextTemplate: 执行 text-template action（纯模板渲染）
 */

import type { ToolResult, ToolContext } from "../domain/types";
import type {
  HttpCallAction,
  BuiltinMirrorAction,
  TextTemplateAction,
} from "../domain/tool-plugin-types";
import { toolRegistry } from "./tool-registry";
import { renderTemplate, renderObject, extractPath } from "./tool-plugin-template";
import { validateUrl } from "./tool-plugin-security";

// ============= http-call 辅助函数 =============

/**
 * 构建最终 URL（合并 query 参数）
 *
 * 将 query 中的键值对设置到 URL 的 searchParams 上。
 */
function buildFinalUrl(url: string, query: Record<string, string> | undefined): URL {
  const finalUrl = new URL(url);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      finalUrl.searchParams.set(k, v);
    }
  }
  return finalUrl;
}

/**
 * 构建请求选项（method/headers/body）
 *
 * 仅当方法非 GET/DELETE 且存在 body 时才附加 body。
 * body 会被模板渲染后序列化为 JSON，并补充 Content-Type 头。
 */
function buildFetchOptions(
  method: string,
  headers: Record<string, string> | undefined,
  action: HttpCallAction,
  args: Record<string, unknown>,
): RequestInit {
  const fetchOptions: RequestInit = { method, headers };
  const hasBody = method !== "GET" && method !== "DELETE" && action.body;
  if (!hasBody) return fetchOptions;

  const renderedBody = renderObject(action.body, args);
  fetchOptions.body = JSON.stringify(renderedBody);
  fetchOptions.headers = {
    "Content-Type": "application/json",
    ...(headers ?? {}),
  };
  return fetchOptions;
}

/**
 * 设置 AbortController（超时 + 外部取消信号）
 *
 * 返回控制器和清理函数；若外部信号已取消则返回 aborted=true。
 * 调用方需在 finally 中执行 cleanup 以清理 timer 和事件监听。
 */
function setupAbortController(
  ctx: ToolContext,
  timeoutMs: number,
): { aborted: true } | { aborted: false; controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 无外部信号：仅需清理 timer
  if (!ctx.signal) {
    return {
      aborted: false,
      controller,
      cleanup: () => clearTimeout(timer),
    };
  }

  // 外部信号已取消：直接返回 aborted
  if (ctx.signal.aborted) {
    clearTimeout(timer);
    return { aborted: true };
  }

  // 监听外部取消信号
  const onExternalAbort = () => controller.abort();
  ctx.signal.addEventListener("abort", onExternalAbort, { once: true });
  return {
    aborted: false,
    controller,
    cleanup: () => {
      clearTimeout(timer);
      ctx.signal!.removeEventListener("abort", onExternalAbort);
    },
  };
}

/**
 * 解析响应数据
 *
 * 根据 transform 类型选择解析方式：
 * - text: 返回纯文本
 * - raw: 返回 { status, ok, url } 元信息
 * - json: 返回 JSON 解析结果（默认）
 */
async function parseResponseData(
  response: Response,
  transform: "json" | "text" | "raw",
): Promise<unknown> {
  if (transform === "text") return response.text();
  if (transform === "raw") {
    return { status: response.status, ok: response.ok, url: response.url };
  }
  return response.json();
}

/**
 * 处理 fetch 错误（区分超时/外部取消/其他）
 *
 * AbortError 时根据 ctx.signal.aborted 判断是外部取消还是超时。
 */
function handleFetchError(e: unknown, ctx: ToolContext, timeoutMs: number): ToolResult {
  if (e instanceof Error && e.name === "AbortError") {
    return {
      success: false,
      error: ctx.signal?.aborted ? "已取消" : `请求超时（${timeoutMs}ms）`,
      duration: 0,
    };
  }
  return {
    success: false,
    error: e instanceof Error ? e.message : String(e),
    duration: 0,
  };
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
export async function executeHttpCall(
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
  const finalUrl = buildFinalUrl(url, query);
  const fetchOptions = buildFetchOptions(method, headers, action, args);

  const abortSetup = setupAbortController(ctx, timeoutMs);
  if (abortSetup.aborted) {
    return { success: false, error: "已取消", duration: 0 };
  }

  try {
    const response = await fetch(finalUrl.toString(), {
      ...fetchOptions,
      signal: abortSetup.controller.signal,
    });
    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        duration: 0,
      };
    }

    const transform = action.responseTransform ?? "json";
    let data: unknown = await parseResponseData(response, transform);
    if (action.responsePath) {
      data = extractPath(data, action.responsePath);
    }
    return { success: true, data, duration: 0 };
  } catch (e) {
    return handleFetchError(e, ctx, timeoutMs);
  } finally {
    abortSetup.cleanup();
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
export async function executeBuiltinMirror(
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
export async function executeTextTemplate(
  action: TextTemplateAction,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const text = renderTemplate(action.template, args);
  return { success: true, data: { text }, duration: 0 };
}
