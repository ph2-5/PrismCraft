import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";

export interface TrackingInfo {
  providerName?: string;
  model?: string;
  apiUrl?: string;
  queryEndpoint?: string;
  howToCheck: string;
  apiDocUrl?: string;
}

interface ProviderConfig {
  name: string;
  id: string;
  baseUrl: string;
  docsUrl?: string;
  statusQueryUrl?: string;
  howToCheck?: string;
}

const PROVIDERS: Record<string, ProviderConfig> = {
  kling: {
    name: "可灵 (Kling)",
    id: "kling",
    baseUrl: "https://api.klingai.com",
    docsUrl: "https://platform.klingai.com/docs",
    statusQueryUrl: "https://platform.klingai.com/task",
    howToCheck: "1. 登录可灵平台\n2. 进入「任务管理」页面\n3. 使用任务ID搜索",
  },
  minimax: {
    name: "MiniMax (海螺)",
    id: "minimax",
    baseUrl: "https://api.minimax.chat",
    docsUrl: "https://platform.minimaxi.com/document",
    statusQueryUrl: "https://platform.minimaxi.com/task",
    howToCheck: "1. 登录MiniMax平台\n2. 进入「任务查询」页面\n3. 输入任务ID查询",
  },
  jimeng: {
    name: "即梦 (Jimeng)",
    id: "jimeng",
    baseUrl: "https://jimeng.jianying.com",
    docsUrl: "https://jimeng.jianying.com",
    howToCheck: "1. 登录即梦平台\n2. 查看生成历史",
  },
  vidu: {
    name: "Vidu",
    id: "vidu",
    baseUrl: "https://api.vidu.cn",
    docsUrl: "https://docs.vidu.cn",
    howToCheck: "1. 登录Vidu平台\n2. 查看任务状态",
  },
  luma: {
    name: "Luma",
    id: "luma",
    baseUrl: "https://api.lumalabs.ai",
    docsUrl: "https://docs.lumalabs.ai",
    howToCheck: "1. 登录Luma平台\n2. 查看生成历史",
  },
  runway: {
    name: "Runway",
    id: "runway",
    baseUrl: "https://api.runwayml.com",
    docsUrl: "https://docs.runwayml.com",
    howToCheck: "1. 登录Runway平台\n2. 查看任务列表",
  },
};

export function getProviderInfo(providerId: string): ProviderConfig | undefined {
  return PROVIDERS[providerId];
}

export function buildTrackingInfo(
  taskId: string,
  apiUrl?: string,
  providerId?: string,
  model?: string,
): TrackingInfo {
  const provider = providerId ? PROVIDERS[providerId] : undefined;
  return {
    providerName: provider?.name,
    model,
    apiUrl,
    queryEndpoint: provider?.statusQueryUrl
      ? `${provider.statusQueryUrl}?taskId=${taskId}`
      : undefined,
    howToCheck: provider?.howToCheck || "请联系服务商获取任务状态查询方式",
    apiDocUrl: provider?.docsUrl,
  };
}

export async function copyTrackingInfoToClipboard(
  trackingInfo: TrackingInfo,
): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    const lines: string[] = [
      `服务商: ${trackingInfo.providerName || "未知"}`,
      `模型: ${trackingInfo.model || "未知"}`,
      `API地址: ${trackingInfo.apiUrl || "未记录"}`,
      `查询端点: ${trackingInfo.queryEndpoint || "未记录"}`,
      "",
      `查询方式:\n${trackingInfo.howToCheck}`,
    ];
    if (trackingInfo.apiDocUrl) {
      lines.push("", `API文档: ${trackingInfo.apiDocUrl}`);
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
