import type { AIProviderPlugin, ModelParameterProfile } from "./types";
import { getLogger } from "../logging/logger";
import { loadUserPlugins, USER_PLUGINS_DIR } from "./user-plugin-loader";

const logger = getLogger("plugin-registry");

class PluginRegistry {
  private plugins: AIProviderPlugin[] = [];
  private fallbackPlugin: AIProviderPlugin | null = null;
  private userPluginIds: Set<string> = new Set();

  register(plugin: AIProviderPlugin, isUserPlugin = false): void {
    this.plugins.push(plugin);
    if (isUserPlugin) this.userPluginIds.add(plugin.id);
    logger.info(`Registered provider plugin: ${plugin.id} (${plugin.displayName})${isUserPlugin ? " [user]" : ""}`);
  }

  setFallback(plugin: AIProviderPlugin): void {
    this.fallbackPlugin = plugin;
    logger.info(`Set fallback provider plugin: ${plugin.id}`);
  }

  unregister(pluginId: string): boolean {
    const index = this.plugins.findIndex((p) => p.id === pluginId);
    if (index === -1) return false;
    this.plugins.splice(index, 1);
    this.userPluginIds.delete(pluginId);
    logger.info(`Unregistered provider plugin: ${pluginId}`);
    return true;
  }

  select(apiUrl: string, model?: string): AIProviderPlugin | undefined {
    for (const plugin of this.plugins) {
      try {
        if (plugin.match(apiUrl, model)) {
          return plugin;
        }
      } catch (e) {
        logger.warn(
          `Plugin ${plugin.id} match() threw error: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    if (this.fallbackPlugin) {
      return this.fallbackPlugin;
    }

    logger.warn(
      `No provider plugin matched for apiUrl=${apiUrl}, model=${model}`,
    );
    return undefined;
  }

  selectById(pluginId: string): AIProviderPlugin | undefined {
    return this.plugins.find((p) => p.id === pluginId);
  }

  getAll(): AIProviderPlugin[] {
    return [...this.plugins];
  }

  getBuiltInPlugins(): AIProviderPlugin[] {
    return this.plugins.filter((p) => !this.userPluginIds.has(p.id));
  }

  getUserPlugins(): AIProviderPlugin[] {
    return this.plugins.filter((p) => this.userPluginIds.has(p.id));
  }

  isUserPlugin(pluginId: string): boolean {
    return this.userPluginIds.has(pluginId);
  }

  reloadUserPlugins(): { loaded: number; errors: string[] } {
    const oldUserPlugins = this.plugins.filter((p) =>
      this.userPluginIds.has(p.id),
    );
    for (const p of oldUserPlugins) {
      const index = this.plugins.indexOf(p);
      if (index !== -1) this.plugins.splice(index, 1);
    }
    this.userPluginIds.clear();

    const errors: string[] = [];
    let loaded = 0;

    try {
      const userPlugins = loadUserPlugins();
      for (const plugin of userPlugins) {
        this.register(plugin, true);
        loaded++;
      }
    } catch (e) {
      errors.push(
        `加载用户插件失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return { loaded, errors };
  }

  getAllCapabilities(): Record<
    string,
    {
      id: string;
      displayName: string;
      isUserPlugin: boolean;
      videoCapabilities: AIProviderPlugin["videoCapabilities"];
      imageCapabilities: AIProviderPlugin["imageCapabilities"];
    }
  > {
    const result: Record<string, {
      id: string;
      displayName: string;
      isUserPlugin: boolean;
      videoCapabilities: AIProviderPlugin["videoCapabilities"];
      imageCapabilities: AIProviderPlugin["imageCapabilities"];
    }> = {};
    for (const plugin of this.plugins) {
      result[plugin.id] = {
        id: plugin.id,
        displayName: plugin.displayName,
        isUserPlugin: this.userPluginIds.has(plugin.id),
        videoCapabilities: plugin.videoCapabilities,
        imageCapabilities: plugin.imageCapabilities,
      };
    }
    return result;
  }

  getAllModelProfiles(): Record<string, ModelParameterProfile & { providerId: string; isUserPlugin: boolean }> {
    const result: Record<string, ModelParameterProfile & { providerId: string; isUserPlugin: boolean }> = {};
    for (const plugin of this.plugins) {
      const models = plugin.getAvailableModels?.() || [];
      for (const modelId of models) {
        const profile = plugin.getModelParameterProfile(modelId);
        result[modelId] = {
          ...profile,
          providerId: plugin.id,
          isUserPlugin: this.userPluginIds.has(plugin.id),
        };
      }
    }
    return result;
  }
}

export const pluginRegistry = new PluginRegistry();
export { USER_PLUGINS_DIR };
