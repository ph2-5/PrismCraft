export type {
  AIProviderPlugin,
  ImageSizeOption,
  ModelCapabilities,
  VideoCapabilities,
  ImageCapabilities,
  ImageTransportMode,
  ImagePurpose,
  VideoBuildContext,
  ImageBuildContext,
  TextBuildContext,
  VisionBuildContext,
  VideoRequestResult,
  ImageRequestResult,
  TextRequestResult,
  VisionRequestResult,
  CloudProviderInfo,
} from "./types";

export { BaseAIProviderPlugin } from "./base-provider";
export { pluginRegistry, USER_PLUGINS_DIR } from "./registry";

export {
  VolcenginePlugin,
  KuaishouPlugin,
  ZhipuPlugin,
  PixversePlugin,
  SeedancePlugin,
  GooglePlugin,
  OpenAISoraPlugin,
  OpenAICompatiblePlugin,
  MiniMaxPlugin,
  AnthropicPlugin,
} from "./providers";

export {
  ensureAccessibleUrl,
  resolveLocalUrlToBase64,
  downloadAsBase64,
  stripDataUriPrefix,
  urlToPureBase64,
} from "./utils";

export type { UserPluginConfig } from "./user-plugin-schema";
export {
  validatePluginConfig,
  PLUGIN_CONFIG_SCHEMA_VERSION,
} from "./user-plugin-schema";
export {
  loadUserPlugins,
  saveUserPlugin,
  deleteUserPlugin,
  listUserPluginFiles,
} from "./user-plugin-loader";

import { pluginRegistry } from "./registry";
import { VolcenginePlugin } from "./providers/volcengine";
import { KuaishouPlugin } from "./providers/kuaishou";
import { ZhipuPlugin } from "./providers/zhipu";
import { PixversePlugin } from "./providers/pixverse";
import { SeedancePlugin } from "./providers/seedance";
import { GooglePlugin } from "./providers/google";
import { OpenAISoraPlugin } from "./providers/openai-sora";
import { OpenAICompatiblePlugin } from "./providers/openai-compatible";
import { MiniMaxPlugin } from "./providers/minimax";
import { AnthropicPlugin } from "./providers/anthropic";

function registerAllPlugins(): void {
  pluginRegistry.register(new VolcenginePlugin());
  pluginRegistry.register(new KuaishouPlugin());
  pluginRegistry.register(new ZhipuPlugin());
  pluginRegistry.register(new PixversePlugin());
  pluginRegistry.register(new SeedancePlugin());
  pluginRegistry.register(new GooglePlugin());
  pluginRegistry.register(new OpenAISoraPlugin());
  pluginRegistry.register(new MiniMaxPlugin());
  pluginRegistry.register(new AnthropicPlugin());
  pluginRegistry.setFallback(new OpenAICompatiblePlugin());

  pluginRegistry.reloadUserPlugins();
}

registerAllPlugins();
