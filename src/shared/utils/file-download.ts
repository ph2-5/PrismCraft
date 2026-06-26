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
