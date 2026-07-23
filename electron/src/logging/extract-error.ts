/**
 * electron/src/logging/extract-error.ts
 *
 * 主进程通用的错误消息提取工具。
 *
 * 对应渲染进程的实现：`src/shared/error-logger.ts:66` 中的 `extractErrorMessage`。
 * 渲染进程版本依赖 `AppError` 等领域类型，主进程无法复用，因此在此提供
 * 一个零外部依赖的等价实现，用于消除主进程中 20+ 处
 * `error instanceof Error ? error.message : String(error)` 与
 * `(error as Error).message` 的重复模式。
 *
 * 行为对齐说明（与 renderer 版本逐分支对应）：
 *  - null / undefined → "Unknown error"
 *  - string → 原值或 "Unknown error"（空串回退）
 *  - Error 实例 → message || name || "Unknown error"
 *  - ApiClientError（electron 侧带 statusCode 的 Error 子类）→ 走 instanceof Error 分支即可
 *  - 普通 ApiError（{ code, message } 鸭子类型）→ 走 hasMessage 鸭子分支
 *  - 其他对象 → 依次尝试 message / name / JSON.stringify
 *  - 兜底 → String(error) 或 "Unknown error"
 *
 * 注意：本函数仅提取"可读消息字符串"，不读取 statusCode 等附加字段。
 * 如需 HTTP 状态码，请使用 `getApiErrorStatusCode`（见 api-gateway-utils.ts）。
 */

function hasMessage(e: unknown): e is { message: unknown } {
  return typeof e === "object" && e !== null && "message" in e;
}

function hasName(e: unknown): e is { name: unknown } {
  return typeof e === "object" && e !== null && "name" in e;
}

export function extractErrorMessage(error: unknown): string {
  if (error === undefined || error === null) return "Unknown error";
  if (typeof error === "string") return error || "Unknown error";
  if (error instanceof Error) return error.message || error.name || "Unknown error";
  if (typeof error === "object" && error !== null) {
    if (hasMessage(error)) {
      const msg = error.message;
      if (typeof msg === "string" && msg.trim().length > 0) return msg;
    }
    if (hasName(error)) {
      const name = error.name;
      if (typeof name === "string" && name.trim().length > 0) return name;
    }
    try {
      const json = JSON.stringify(error);
      if (json !== "{}") return json;
    } catch {
      /* ignore */
    }
  }
  return String(error) || "Unknown error";
}
