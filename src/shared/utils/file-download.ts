import { BLOB_URL_LONG_REVOKE_DELAY_MS } from "@/shared/constants";

function downloadTextFile(content: string, filename: string, mimeType = "text/plain") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LONG_REVOKE_DELAY_MS);
}

export function downloadJSONFile(data: unknown, filename: string) {
  downloadTextFile(JSON.stringify(data, null, 2), filename, "application/json");
}

/**
 * 下载 Markdown 文件（Task 4.9 子项 2 新增）。
 *
 * mimeType 使用 text/markdown，浏览器会识别为 Markdown 文件。
 */
export function downloadMarkdownFile(content: string, filename: string) {
  downloadTextFile(content, filename, "text/markdown");
}
