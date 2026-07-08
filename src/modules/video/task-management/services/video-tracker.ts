import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { t } from "@/shared/constants";

export interface TrackingInfo {
  providerName?: string;
  model?: string;
  apiUrl?: string;
  queryEndpoint?: string;
  howToCheck: string;
  apiDocUrl?: string;
}

interface ProviderConfig {
  nameKey: string;
  id: string;
  baseUrl: string;
  docsUrl?: string;
  statusQueryUrl?: string;
  howToCheckKey: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  kling: {
    nameKey: "video.provider.kling",
    id: "kling",
    baseUrl: "https://api.klingai.com",
    docsUrl: "https://platform.klingai.com/docs",
    statusQueryUrl: "https://platform.klingai.com/task",
    howToCheckKey: "video.howToCheck.kling",
  },
  minimax: {
    nameKey: "video.provider.minimax",
    id: "minimax",
    baseUrl: "https://api.minimax.chat",
    docsUrl: "https://platform.minimaxi.com/document",
    statusQueryUrl: "https://platform.minimaxi.com/task",
    howToCheckKey: "video.howToCheck.minimax",
  },
  jimeng: {
    nameKey: "video.provider.jimeng",
    id: "jimeng",
    baseUrl: "https://jimeng.jianying.com",
    docsUrl: "https://jimeng.jianying.com",
    howToCheckKey: "video.howToCheck.jimeng",
  },
  vidu: {
    nameKey: "video.provider.vidu",
    id: "vidu",
    baseUrl: "https://api.vidu.cn",
    docsUrl: "https://docs.vidu.cn",
    howToCheckKey: "video.howToCheck.vidu",
  },
  luma: {
    nameKey: "video.provider.luma",
    id: "luma",
    baseUrl: "https://api.lumalabs.ai",
    docsUrl: "https://docs.lumalabs.ai",
    howToCheckKey: "video.howToCheck.luma",
  },
  runway: {
    nameKey: "video.provider.runway",
    id: "runway",
    baseUrl: "https://api.runwayml.com",
    docsUrl: "https://docs.runwayml.com",
    howToCheckKey: "video.howToCheck.runway",
  },
};

export function getProviderInfoByProviderId(providerId: string): ProviderConfig | undefined {
  return PROVIDERS[providerId];
}

export function buildTrackingInfoByProviderId(
  taskId: string,
  apiUrl?: string,
  providerId?: string,
  model?: string,
): TrackingInfo {
  const provider = providerId ? PROVIDERS[providerId] : undefined;
  return {
    providerName: provider ? t(provider.nameKey) : undefined,
    model,
    apiUrl,
    queryEndpoint: provider?.statusQueryUrl
      ? `${provider.statusQueryUrl}?taskId=${taskId}`
      : undefined,
    howToCheck: provider ? t(provider.howToCheckKey) : t("video.howToCheckFallback"),
    apiDocUrl: provider?.docsUrl,
  };
}

export async function copyTrackingInfoToClipboard(
  trackingInfo: TrackingInfo,
): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const lines: string[] = [
      `${t("task.providerLabel")}: ${trackingInfo.providerName || t("common.unknown")}`,
      `${t("task.modelLabelText")}: ${trackingInfo.model || t("common.unknown")}`,
      `${t("task.apiUrlLabel")}: ${trackingInfo.apiUrl || t("common.notRecorded")}`,
      `${t("task.queryEndpoint")}: ${trackingInfo.queryEndpoint || t("common.notRecorded")}`,
      "",
      `${t("task.queryMethodLabel")}:\n${trackingInfo.howToCheck}`,
    ];
    if (trackingInfo.apiDocUrl) {
      lines.push("", `${t("task.apiDocLabel")}: ${trackingInfo.apiDocUrl}`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
  });
}

export function openTaskQueryLink(trackingInfo: TrackingInfo): boolean {
  if (trackingInfo.queryEndpoint) {
    window.open(trackingInfo.queryEndpoint, "_blank");
    return true;
  }
  if (trackingInfo.apiDocUrl) {
    window.open(trackingInfo.apiDocUrl, "_blank");
    return true;
  }
  return false;
}
