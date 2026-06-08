import { API_SERVER_PORT, ELECTRON_APP_HEADERS } from "@/config/constants";
import { t } from "@/shared/constants";

export interface PluginInfo {
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  capabilities: {
    video: boolean;
    image: boolean;
    text: boolean;
    vision: boolean;
  };
  videoCapabilities: {
    supportsLastFrame: boolean;
    supportsReferenceVideo: boolean;
    supportsMimicryLevel: boolean;
    defaultModel: string;
    maxDuration: number;
  };
  imageCapabilities: {
    supportsReferenceImage: boolean;
    defaultModel: string;
  };
}

export interface UserPluginFile {
  id: string;
  fileName: string;
  filePath: string;
  displayName: string;
  version: string;
  valid: boolean;
  errors: string[];
}

export interface PluginListData {
  plugins: PluginInfo[];
  userPluginFiles: UserPluginFile[];
}

export function getApiBase(): string {
  return `http://localhost:${API_SERVER_PORT}/api`;
}

export async function fetchPlugins(): Promise<PluginListData> {
  const res = await fetch(`${getApiBase()}/plugins/list`, {
    headers: { ...ELECTRON_APP_HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.loadListFailed"));
  return data.data;
}

export async function addPlugin(config: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${getApiBase()}/plugins/add`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.addPluginFailed"));
}

export async function deletePlugin(pluginId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/plugins/delete`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ pluginId }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.deletePluginFailed"));
}

export async function reloadPlugins(): Promise<{ loaded: number; errors: string[] }> {
  const res = await fetch(`${getApiBase()}/plugins/reload`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.reloadPluginFailed"));
  return data.data;
}

export async function reloadCodePlugins(): Promise<{ loaded: number; errors: string[] }> {
  const res = await fetch(`${getApiBase()}/plugins/reload-code`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.codePluginReloadFailed"));
  return data.data;
}

export async function validatePluginConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }> {
  const res = await fetch(`${getApiBase()}/plugins/validate`, {
    method: "POST",
    headers: { ...ELECTRON_APP_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.validateFailed"));
  return data.data;
}

export async function fetchPluginSchema(): Promise<Record<string, unknown>> {
  const res = await fetch(`${getApiBase()}/plugins/schema`, {
    headers: { ...ELECTRON_APP_HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.loadSchemaFailed"));
  return data.data;
}

export async function fetchPluginSpecification(): Promise<string> {
  const res = await fetch(`${getApiBase()}/plugins/specification`, {
    headers: { ...ELECTRON_APP_HEADERS },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || t("plugin.loadSpecDocFailed"));
  return data.data.content;
}
