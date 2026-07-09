import type { AIProviderPlugin, ModelParameterProfile, ProviderCapabilities, VideoCapabilities, ImageCapabilities, ApiKeyDetection, MatchPattern } from "./types";
import { getLogger } from "../logging/logger";
import { loadUserPlugins, USER_PLUGINS_DIR } from "./user-plugin-loader";
import { CODE_PLUGINS_DIR, listCodePluginFiles, scanCodePluginFile } from "./code-plugin-loader";
import { CodePluginAdapter } from "./code-plugin-adapter";
import { PluginProcessManager, registerProcessManager, unregisterProcessManager } from "./plugin-process-manager";

const logger = getLogger("plugin-registry");

export class PluginRegistry {
  private plugins: AIProviderPlugin[] = [];
  private fallbackPlugin: AIProviderPlugin | null = null;
  private userPluginIds: Set<string> = new Set();
  private codePluginIds: Set<string> = new Set();

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
    const plugin = this.plugins[index];
    this.plugins.splice(index, 1);
    // R182/H5: 删除 code plugin 时必须清理 worker 进程，否则会累积僵尸进程
    if (this.codePluginIds.has(pluginId)) {
      try {
        // P1-5 三审修复：清理 adapter 的 restartRetryTimer 和 disposed 标志，
        // 与 loadCodePlugins 保持一致
        const maybeDisposable = plugin as { dispose?: () => void };
        if (typeof maybeDisposable.dispose === "function") {
          maybeDisposable.dispose();
        }
        unregisterProcessManager(pluginId);
      } catch (e) {
        logger.warn(`Failed to unregister process manager for ${pluginId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.userPluginIds.delete(pluginId);
    this.codePluginIds.delete(pluginId);
    logger.info(`Unregistered provider plugin: ${pluginId}`);
    return true;
  }

  select(apiUrl: string, model?: string): AIProviderPlugin | undefined {
    for (const plugin of this.plugins) {
      try {
        // P1-5 审查修复：跳过 disabled 的插件，避免请求路由到已死亡的插件。
        // CodePluginAdapter 已在 match() 内部检查 disabled，但显式检查 isAvailable()
        // 更健壮——其他实现可能未在 match() 中检查可用性。
        const maybeAvailable = plugin as { isAvailable?: () => boolean };
        if (typeof maybeAvailable.isAvailable === "function" && !maybeAvailable.isAvailable()) {
          continue;
        }
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
    return this.plugins.filter(
      (p) => !this.userPluginIds.has(p.id) && !this.codePluginIds.has(p.id),
    );
  }

  getUserPlugins(): AIProviderPlugin[] {
    return this.plugins.filter((p) => this.userPluginIds.has(p.id));
  }

  isUserPlugin(pluginId: string): boolean {
    return this.userPluginIds.has(pluginId);
  }

  isCodePlugin(pluginId: string): boolean {
    return this.codePluginIds.has(pluginId);
  }

  reloadUserPlugins(): { loaded: number; errors: string[] } {
    // P1-4 修复：先加载新插件到临时数组，全部成功后再原子替换。
    // 之前先删后加，导致删除到加载完成之间 select() 找不到用户插件，请求 fallthrough。
    const errors: string[] = [];
    const newPlugins: AIProviderPlugin[] = [];
    const newUserPluginIds = new Set<string>();

    try {
      const userPlugins = loadUserPlugins();
      for (const plugin of userPlugins) {
        newPlugins.push(plugin);
        newUserPluginIds.add(plugin.id);
      }
    } catch (e) {
      errors.push(
        `加载用户插件失败: ${e instanceof Error ? e.message : String(e)}`,
      );
      // P1-4 审查修复：加载失败时保留旧插件，避免重载期间 select() 找不到用户插件。
      // 之前即使 loadUserPlugins() 抛异常（newPlugins 为空）仍执行移除旧插件逻辑，
      // 导致用户插件全部丢失。
      return { loaded: 0, errors };
    }

    // 原子替换：移除旧用户插件 + 注册新用户插件
    const oldUserPlugins = this.plugins.filter((p) =>
      this.userPluginIds.has(p.id),
    );
    for (const p of oldUserPlugins) {
      const index = this.plugins.indexOf(p);
      if (index !== -1) this.plugins.splice(index, 1);
    }
    this.userPluginIds.clear();

    for (const plugin of newPlugins) {
      this.plugins.push(plugin);
      this.userPluginIds.add(plugin.id);
      logger.info(`Registered provider plugin: ${plugin.id} (${plugin.displayName}) [user]`);
    }

    return { loaded: newPlugins.length, errors };
  }

  async loadCodePlugins(): Promise<{ loaded: number; errors: string[] }> {
    // P1-4 修复：先加载新代码插件到临时集合，全部加载完成后原子替换。
    // 之前先 unregister 所有旧插件再逐个加载新插件，导致期间 select() 找不到代码插件。
    const errors: string[] = [];
    const newEntries: Array<{ adapter: CodePluginAdapter; pluginId: string; manager: PluginProcessManager }> = [];

    const files = listCodePluginFiles();
    for (const filePath of files) {
      const fileName = filePath.split(/[/\\]/).pop() || "";

      const scanResult = scanCodePluginFile(filePath);
      if (!scanResult.valid) {
        errors.push(...scanResult.errors);
        continue;
      }

      const manager = new PluginProcessManager();

      try {
        const { pluginId, metadata } = await manager.load(filePath);

        const matchPatterns = (metadata.matchPatterns || scanResult.matchPatterns) as MatchPattern[] | undefined;

        const adapter = new CodePluginAdapter(manager, {
          capabilities: (metadata.capabilities || { video: true, image: true, text: true, vision: true }) as ProviderCapabilities,
          videoCapabilities: (metadata.videoCapabilities || {}) as VideoCapabilities,
          imageCapabilities: (metadata.imageCapabilities || {}) as ImageCapabilities,
          availableModels: (metadata.availableModels || []) as string[],
          apiKeyDetection: (metadata.apiKeyDetection || undefined) as ApiKeyDetection | undefined,
          preferLocalData: metadata.preferLocalData as boolean | undefined,
          matchPatterns,
        });

        newEntries.push({ adapter, pluginId, manager });
      } catch (e) {
        errors.push(`子进程加载 ${fileName} 失败: ${e instanceof Error ? e.message : String(e)}`);
        try { await manager.shutdown(); } catch { /* ignore */ }
      }
    }

    // 原子替换：移除旧代码插件 + 注册新代码插件
    const oldCodePlugins = this.plugins.filter((p) =>
      this.codePluginIds.has(p.id),
    );
    for (const p of oldCodePlugins) {
      const index = this.plugins.indexOf(p);
      if (index !== -1) this.plugins.splice(index, 1);
      try {
        // P1-5 审查修复：清理 adapter 的 restartRetryTimer，防止 pending 定时器
        // 触发 attemptRestart → restart → spawn 孤儿进程
        const maybeDisposable = p as { dispose?: () => void };
        if (typeof maybeDisposable.dispose === "function") {
          maybeDisposable.dispose();
        }
        unregisterProcessManager(p.id);
      } catch (e) {
        logger.warn(`Failed to unregister process manager for ${p.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.codePluginIds.clear();

    for (const { adapter, pluginId, manager } of newEntries) {
      this.plugins.push(adapter);
      this.codePluginIds.add(pluginId);
      registerProcessManager(pluginId, manager);
      logger.info(`Code plugin ${pluginId} loaded in process isolation mode`);
    }

    return { loaded: newEntries.length, errors };
  }

  getCodePlugins(): AIProviderPlugin[] {
    return this.plugins.filter((p) => this.codePluginIds.has(p.id));
  }

  getAllCapabilities(): Record<
    string,
    {
      id: string;
      displayName: string;
      isUserPlugin: boolean;
      isCodePlugin: boolean;
      capabilities: ProviderCapabilities;
      videoCapabilities: AIProviderPlugin["videoCapabilities"];
      imageCapabilities: AIProviderPlugin["imageCapabilities"];
    }
  > {
    const result: Record<string, {
      id: string;
      displayName: string;
      isUserPlugin: boolean;
      isCodePlugin: boolean;
      capabilities: ProviderCapabilities;
      videoCapabilities: AIProviderPlugin["videoCapabilities"];
      imageCapabilities: AIProviderPlugin["imageCapabilities"];
    }> = {};
    for (const plugin of this.plugins) {
      result[plugin.id] = {
        id: plugin.id,
        displayName: plugin.displayName,
        isUserPlugin: this.userPluginIds.has(plugin.id),
        isCodePlugin: this.codePluginIds.has(plugin.id),
        capabilities: plugin.capabilities,
        videoCapabilities: plugin.videoCapabilities,
        imageCapabilities: plugin.imageCapabilities,
      };
    }
    return result;
  }

  getAllModelProfiles(): Record<string, ModelParameterProfile & { providerId: string; isUserPlugin: boolean; isCodePlugin: boolean }> {
    const result: Record<string, ModelParameterProfile & { providerId: string; isUserPlugin: boolean; isCodePlugin: boolean }> = {};
    for (const plugin of this.plugins) {
      const models = plugin.getAvailableModels?.() || [];
      for (const modelId of models) {
        const profile = plugin.getModelParameterProfile(modelId);
        result[modelId] = {
          ...profile,
          providerId: plugin.id,
          isUserPlugin: this.userPluginIds.has(plugin.id),
          isCodePlugin: this.codePluginIds.has(plugin.id),
        };
      }
    }
    return result;
  }
}

export const pluginRegistry = new PluginRegistry();
export { USER_PLUGINS_DIR, CODE_PLUGINS_DIR };
