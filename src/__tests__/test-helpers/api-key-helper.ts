export function getTestApiKey(providerId: string): string | null {
  const envVarName = `TEST_API_KEY_${providerId.toUpperCase()}`;
  return process.env[envVarName] || null;
}

export function getTestBaseUrl(providerId: string): string | null {
  const envVarName = `TEST_BASE_URL_${providerId.toUpperCase()}`;
  return process.env[envVarName] || null;
}

export function hasApiKey(providerId: string): boolean {
  return getTestApiKey(providerId) !== null;
}

export function getAvailableTestProviders(): string[] {
  const providers = [
    "zhipu",
    "kuaishou",
    "pixverse",
    "seedance",
    "volcengine",
    "anthropic",
    "openai",
  ];
  return providers.filter((p) => hasApiKey(p));
}

export function requireApiKey(
  providerId: string
): { apiKey: string; baseUrl?: string } {
  const apiKey = getTestApiKey(providerId);
  if (!apiKey) {
    throw new Error(
      `需要配置 TEST_API_KEY_${providerId.toUpperCase()} 环境变量来运行此测试`
    );
  }
  return {
    apiKey,
    baseUrl: getTestBaseUrl(providerId) || undefined,
  };
}
