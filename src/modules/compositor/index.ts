/**
 * Task 2A.9 — Compositor Module Public API
 *
 * 全局编译器：组合 角色 + 道具 + 场景 → AI 图像合成
 *
 * 公共 API：
 *   - Schema/Type: CompositorInput/CompositorResult/ComposerLayer/CompositorPreset/CompositorStatus
 *   - Service: composeImage/buildCompositorPrompt/getCompositorErrorMessage
 *   - Hook: useCompositor
 *   - Component: CompositorPanel
 */

// Domain schemas
export {
  compositorInputSchema,
  compositorResultSchema,
  composerLayerSchema,
  composerLayerTypeSchema,
  compositorPresetSchema,
  compositorStatusSchema,
} from "./domain/compositor.schema";
export type {
  CompositorInput,
  CompositorResult,
  ComposerLayer,
  ComposerLayerType,
  CompositorPreset,
  CompositorStatus,
} from "./domain/compositor.schema";

// Services
export {
  composeImage,
  buildCompositorPrompt,
  getCompositorErrorMessage,
} from "./services/compositor-engine";

// Hooks
export { useCompositor } from "./hooks/use-compositor";
export type { UseCompositorResult } from "./hooks/use-compositor";

// Components
export { CompositorPanel } from "./presentation/compositor-panel";

// Module manifest
import "./contract.json";
