/**
 * URL 安全验证工具
 * 
 * 作为本地优先项目，我们支持多种协议和来源：
 * - data: - base64 内联图片/视频
 * - blob: - 浏览器 Blob URL（缓存的视频）
 * - file:// - 本地文件系统（Electron 环境）
 * - http:// / https:// - 网络资源（包括本地 AI 提供商）
 * 
 * 安全原理：
 * - 所有 URL 都来自我们自己的存储和 API，不是用户直接输入
 * - 我们信任用户在设置中配置的 AI 提供商
 * - Electron 本地环境中文件访问是正常操作
 */

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateExternalUrl(url: string): UrlValidationResult {
  if (!url) {
    return { valid: false, reason: "URL 不能为空" };
  }

  const allowedProtocols = ["data:", "blob:", "file:", "http:", "https:"];
  const hasValidProtocol = allowedProtocols.some((p) => url.startsWith(p));

  if (!hasValidProtocol) {
    return { valid: false, reason: "不支持的协议" };
  }

  return { valid: true };
}

export function isAllowedImageUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("file:") ||
    url.startsWith("http:") ||
    url.startsWith("https:")
  );
}

export function isAllowedVideoUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("file:") ||
    url.startsWith("http:") ||
    url.startsWith("https:")
  );
}
