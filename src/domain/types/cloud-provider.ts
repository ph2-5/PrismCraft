export interface CloudProviderInfo {
  name: string;
  websiteUrl?: string;
  taskUrlPattern?: (taskId: string) => string;
  queryEndpoint?: (baseUrl: string, taskId: string) => string;
  apiDocUrl?: string;
  howToCheck: string;
}
