interface ProviderInfo {
  name: string;
  websiteUrl?: string;
  taskUrlPattern?: (taskId: string) => string;
  queryEndpoint?: (baseUrl: string, taskId: string) => string;
  apiDocUrl?: string;
  howToCheck?: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  "volces.com": {
    name: "火山引擎 (Doubao)",
    websiteUrl: "https://console.volcengine.com",
    taskUrlPattern: () =>
      "https://console.volcengine.com/ark/region:cn-beijing/task",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/contents/generations/tasks/${taskId}`,
    apiDocUrl: "https://www.volcengine.com/docs/82379/1115452",
    howToCheck:
      "1. 登录火山引擎控制台 2. 进入「方舟」平台 3. 在「任务中心」查看视频生成任务",
  },
  "bytepluses.com": {
    name: "BytePlus (Seedance)",
    websiteUrl: "https://console.byteplus.com",
    taskUrlPattern: () =>
      "https://console.byteplus.com/ark/region:ap-southeast-1/task",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/contents/generations/tasks/${taskId}`,
    apiDocUrl: "https://docs.byteplus.com/en/docs/seedance/",
    howToCheck:
      "1. 登录 BytePlus 控制台 2. 进入「Ark」平台 3. 在「Task Center」查看视频生成任务",
  },
  "dashscope.aliyuncs.com": {
    name: "阿里云百炼 (DashScope)",
    websiteUrl: "https://bailian.console.aliyun.com",
    taskUrlPattern: () =>
      "https://bailian.console.aliyun.com/?model=pixverse#/model-market/detail/pixverse-v6-t2v",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/services/aigc/video-generation/video-synthesis/${taskId}`,
    apiDocUrl: "https://help.aliyun.com/zh/dashscope/",
    howToCheck:
      "1. 登录阿里云百炼控制台 2. 进入视频生成服务 3. 查看任务列表或通过任务ID查询",
  },
  "klingai.com": {
    name: "可灵AI (Kling)",
    websiteUrl: "https://www.klingai.com",
    taskUrlPattern: () => "https://www.klingai.com/console/tasks",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/api/v1/video/task/${taskId}`,
    apiDocUrl: "https://docs.klingai.com",
    howToCheck: "1. 登录可灵AI官网 2. 进入控制台 3. 查看任务历史",
  },
  "bigmodel.cn": {
    name: "智谱AI (GLM)",
    websiteUrl: "https://open.bigmodel.cn",
    taskUrlPattern: () =>
      "https://open.bigmodel.cn/console/history/records",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/videos/generations/${taskId}`,
    apiDocUrl: "https://open.bigmodel.cn/dev/api",
    howToCheck: "1. 登录智谱AI开放平台 2. 进入历史记录 3. 查找对应任务",
  },
  "openai.com": {
    name: "OpenAI",
    websiteUrl: "https://platform.openai.com",
    taskUrlPattern: () => "https://platform.openai.com/playground",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/video/generations/${taskId}`,
    apiDocUrl: "https://platform.openai.com/docs/api-reference/video",
    howToCheck:
      "1. 登录 OpenAI 平台 2. 进入 API Playground 3. 查看视频生成历史",
  },
  "atlascloud.ai": {
    name: "Atlas Cloud (Seedance)",
    websiteUrl: "https://atlascloud.ai",
    taskUrlPattern: () => "https://atlascloud.ai/dashboard",
    queryEndpoint: (baseUrl, taskId) =>
      `${baseUrl}/seedance/video/${taskId}`,
    apiDocUrl: "https://docs.atlascloud.ai",
    howToCheck:
      "1. 登录 Atlas Cloud 2. 进入 Dashboard 3. 查看视频生成任务",
  },
};

export const DEFAULT_PROVIDER: ProviderInfo = {
  name: "自定义API",
  howToCheck:
    "请根据您API提供商的文档进行查询，通常需要：1. 登录API平台 2. 查找任务查询API 3. 使用任务ID进行查询",
};

export function getProviderInfoByApiUrl(apiUrl?: string): ProviderInfo {
  if (!apiUrl) return DEFAULT_PROVIDER;

  let hostname = "";
  try {
    hostname = new URL(apiUrl).hostname;
  } catch {
    const domains = Object.keys(PROVIDERS);
    for (const domain of domains) {
      if (apiUrl.includes(domain)) {
        return PROVIDERS[domain] ?? DEFAULT_PROVIDER;
      }
    }
    return DEFAULT_PROVIDER;
  }

  const domains = Object.keys(PROVIDERS);
  for (const domain of domains) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return PROVIDERS[domain] ?? DEFAULT_PROVIDER;
    }
  }

  return DEFAULT_PROVIDER;
}

export interface TrackingInfo {
  providerName: string;
  taskId: string;
  apiUrl: string;
  model: string;
  apiKeyPreview: string;
  taskUrl?: string;
  queryEndpoint?: string;
  apiDocUrl?: string;
  howToCheck?: string;
  providerWebsite?: string;
}

export function buildTrackingInfoByApiUrl(
  taskId: string,
  apiUrl?: string,
  apiKeyPreview?: string,
  model?: string,
): TrackingInfo {
  const effectiveApiUrl = apiUrl;
  const effectiveModel = model;

  const provider = getProviderInfoByApiUrl(effectiveApiUrl);

  const taskUrl = provider.taskUrlPattern?.(taskId);

  const queryEndpoint =
    provider.queryEndpoint && effectiveApiUrl
      ? provider.queryEndpoint(effectiveApiUrl, taskId)
      : undefined;

  return {
    providerName: provider.name,
    taskId,
    apiUrl: effectiveApiUrl || "",
    model: effectiveModel || "",
    apiKeyPreview: apiKeyPreview || "",
    taskUrl,
    queryEndpoint,
    apiDocUrl: provider.apiDocUrl,
    howToCheck: provider.howToCheck,
    providerWebsite: provider.websiteUrl,
  };
}
