import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function safeParseJson(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text.trim()) {
      throw new ApiError(t("error.requestBodyEmpty"), 400);
    }
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new ApiError(t("error.requestBodyMustBeObject"), 400);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(t("error.requestJsonInvalid"), 400);
  }
}

export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    let msg = error.message;
    msg = msg.replace(/[A-Z]:\\[^\s"']+/gi, "[路径]");
    msg = msg.replace(/\/[a-zA-Z][^\s"']+/g, "[路径]");
    msg = msg.replace(/sk-[a-zA-Z0-9]{8,}/g, "[API_KEY]");
    msg = msg.replace(/key[=:]\s*["']?[a-zA-Z0-9]{8,}/gi, "[API_KEY]");
    msg = msg.replace(/Bearer\s+[a-zA-Z0-9._-]{8,}/gi, "Bearer [TOKEN]");
    msg = msg.replace(/at\s+\S+\s*\([^)]*\)/g, "[stack]");
    msg = msg.replace(/at\s+\S+/g, "[stack]");
    return msg;
  }
  return "内部错误";
}

export function validateRequiredFields(
  data: Record<string, unknown>,
  fields: string[],
): string | null {
  for (const field of fields) {
    if (data[field] === undefined || data[field] === null) {
      return `缺少必填字段: ${field}`;
    }
  }
  return null;
}

export function isUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "169.254.169.254") return false;
    if (parsed.hostname === "metadata.google.internal") return false;
    return true;
  } catch (e) {
    errorLogger.warn("[ApiUtils] Failed to validate URL", e as Error);
    return false;
  }
}

export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) return "";
  return apiKey.slice(0, 4) + "****" + apiKey.slice(-4);
}
