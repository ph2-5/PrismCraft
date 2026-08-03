/**
 * 浏览器/网络工具共享辅助函数
 *
 * 被 web-tools-search / web-tools-download / web-tools-fetch / web-tools-bookmark
 * 各子文件共用的辅助函数集中于此，避免子文件之间或与聚合入口文件产生循环依赖。
 */

/** 校验 URL 是否为 http/https 协议（防 SSRF / 协议混淆） */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
