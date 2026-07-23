<!-- AI: Before modifying this module, read contract.json for invariants -->
# partial-edit 子域（Task 2A.22） ✅

> **状态图例**：✅ 已完成并可用 · 🧪 测试中 · 🚧 开发中 · 📐 规划中/待实现

## 职责

视频生成完成后的局部重绘编辑：用户在视频预览组件上用画笔/矩形/多边形标记区域，AI 仅重绘该区域，保持其他部分一致。新增 VideoTask 子类型 `partial_redraw`，与普通视频生成流程隔离。

## 文件结构

```
src/modules/video/partial-edit/
├── index.ts                          → Barrel
├── MODULE.md                         → 本文件
├── contract.json                     → 模块契约
├── domain/
│   ├── edit-schema.ts                → PartialEditRequest 类型 + 校验
│   └── mask-types.ts                 → MaskShape / MaskConfig / 校验 / 工厂函数
├── services/
│   ├── mask-encoder.ts               → MaskConfig → base64 PNG
│   ├── partial-edit-service.ts       → 编排：校验 → 编码 → 调 API → 创建 Task → 存 Asset
│   └── prompt-builder.ts             → 局部重绘 prompt 模板（保留背景指令）
└── presentation/
    ├── PartialEditPanel.tsx          → 主面板（视频 + 工具栏）
    ├── VideoMaskCanvas.tsx           → 视频上叠加 mask 画布
    ├── MaskToolbar.tsx               → 画笔/橡皮/矩形/多边形工具
    ├── EditPromptInput.tsx           → 重绘指令输入
    └── EditHistoryList.tsx           → 该视频的多次重绘历史
```

## 公共 API

### ✅ Domain 层

```typescript
// mask-types.ts
type MaskShape = RectangleShape | PolygonShape | BrushShape
interface MaskConfig { shapes: MaskShape[]; videoTimestamp: number; inverse?: boolean }
interface MaskBounds { x: number; y: number; width: number; height: number }

function createEmptyMaskConfig(videoTimestamp?: number): MaskConfig
function isValidMaskShape(shape: MaskShape): boolean
function isValidMaskConfig(mask: MaskConfig): boolean
function computeMaskBounds(mask: MaskConfig): MaskBounds | null
function createRectangle(x, y, width, height): RectangleShape
function createPolygon(points): PolygonShape
function createBrush(paths): BrushShape
function addShape(mask, shape): MaskConfig
function popShape(mask): MaskConfig
function clearShapes(mask): MaskConfig
function toggleInverse(mask): MaskConfig

// edit-schema.ts
interface PartialEditRequest {
  sourceVideoAssetId: string
  mask: MaskConfig
  editPrompt: string
  preserveUnmasked: true
  providerId?: string
  modelId?: string
  duration?: number
  storyId?: string
  beatId?: string
}
interface PartialEditResult { taskId: string; assetId?: string; sourceVideoAssetId: string; createdAt: string }

function createPartialEditRequest(input): PartialEditRequest
function validatePartialEditRequest(req): PartialEditValidationError[]
function isValidPartialEditRequest(req): boolean
```

### ✅ Services 层

```typescript
// mask-encoder.ts
async function encodeMask(mask: MaskConfig, options?: MaskEncodeOptions): Promise<Result<MaskEncodeSuccess, MaskEncodeError>>
function encodeMaskSync(mask: MaskConfig, options?: MaskEncodeOptions): Result<MaskEncodeSuccess, MaskEncodeError>
function estimateBase64Size(base64: string): number
function isMaskSizeValid(base64: string, maxBytes?: number): boolean

// prompt-builder.ts
function buildPartialEditPrompt(userPrompt: string, options?: PromptBuilderOptions): string
function buildSimplePrompt(userPrompt: string, options?): string
function detectLanguage(text: string): "zh" | "en"
function isEmptyPrompt(prompt: string): boolean
function isPromptTooLong(prompt: string, maxLength?: number): boolean
function truncatePrompt(prompt: string, maxLength?: number): string
function containsSensitiveContent(prompt: string): boolean
function estimateTokenCount(prompt: string): number

// partial-edit-service.ts
async function startPartialEditTask(request: PartialEditRequest, videoTaskStore): Promise<PartialEditServiceResult>
async function savePartialEditAsset(task: VideoTask): Promise<{ ok: true; assetId: string } | { ok: false; error: PartialEditServiceError }>
async function listPartialEditHistory(sourceVideoAssetId: string): Promise<GenerationAsset[]>
```

### ✅ Presentation 层

```typescript
// PartialEditPanel.tsx
interface PartialEditPanelProps {
  sourceVideoAssetId: string
  sourceVideoUrl: string
  storyId?: string
  beatId?: string
  onClose?: () => void
}
const PartialEditPanel: ComponentType<PartialEditPanelProps>

// VideoMaskCanvas.tsx
interface VideoMaskCanvasProps {
  videoUrl: string
  mask: MaskConfig
  onMaskChange: (mask: MaskConfig) => void
  width?: number
  height?: number
}
const VideoMaskCanvas: ComponentType<VideoMaskCanvasProps>

// MaskToolbar.tsx
type MaskTool = "brush" | "rectangle" | "polygon" | "eraser"
interface MaskToolbarProps {
  activeTool: MaskTool
  onToolChange: (tool: MaskTool) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  inverse: boolean
  onInverseToggle: () => void
}
const MaskToolbar: ComponentType<MaskToolbarProps>

// EditPromptInput.tsx
interface EditPromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  maxLength?: number
}
const EditPromptInput: ComponentType<EditPromptInputProps>

// EditHistoryList.tsx
interface EditHistoryListProps {
  sourceVideoAssetId: string
  onSelectAsset?: (asset: GenerationAsset) => void
  refreshTrigger?: unknown
}
const EditHistoryList: ComponentType<EditHistoryListProps>
```

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | `VideoTask`、`VideoTaskSubtype`、`MaskBounds`、`GenerationAsset` |
| `@/domain/ports` | `IVideoProvider.generatePartialEdit`、`IGenerationAssetStorage.getAssetsBySourceAssetId` |
| `@/infrastructure/di` | `container.videoProvider`、`container.generationAssetStorage` |
| `@/shared/error-logger` | `errorLogger` 错误日志 |
| `@/shared/utils/toast-bridge` | `emitToast` 非 React 环境通知 |
| `@/shared/constants` | `t` i18n |
| `../task-management` | `useVideoTaskStore`（addTask 创建任务） |

## 边界约束

1. **隔离新功能**：不改 `provider.generateVideo()`，局部重绘走专用 `generatePartialEdit` 方法
2. **taskSubtype 区分**：所有局部重绘任务必须设置 `taskSubtype='partial_redraw'`
3. **原视频不修改**：局部重绘结果作为新 Asset（type='partial_edit_video'）保存，原 Asset 保持不变
4. **mask 编码规范**：maskData 必须是 base64 PNG，白色=重绘区域，黑色=保留区域
5. **preserveUnmasked 限制**：当前仅支持 `true`，未来如需 `false`（重绘 mask 外）需扩展
6. **provider 能力探测**：调用前检查 `typeof provider.generatePartialEdit === "function"`
7. **mask 体积限制**：base64 PNG 体积必须 < 1MB（Seedance 2.5 API 限制）
8. **prompt 长度限制**：完整 prompt 不超过 2000 字符（自动截断）

## 不变量（Invariants）

### INV-1: taskSubtype 隔离
局部重绘任务必须设置 `taskSubtype='partial_redraw'`，与普通视频生成（`'normal'`）隔离。UI 通过 taskSubtype 分组显示，避免与普通任务混淆。

### INV-2: 原视频 Asset 不修改
局部重绘结果作为新 GenerationAsset（type='partial_edit_video'）保存，原 Asset 保持不变。用户可对比预览原视频 vs 重绘视频，不满意可回退。

### INV-3: sourceAssetId 关联
新 Asset 的 `sourceAssetId` 必须指向原视频 Asset ID，用于历史追溯和级联查询（通过 `getAssetsBySourceAssetId` 获取某视频的所有重绘版本）。

### INV-4: mask 编码方向
- `inverse=false`（默认）：mask 内为白色（重绘），mask 外为黑色（保留）
- `inverse=true`：mask 内为黑色（保留），mask 外为白色（重绘）

### INV-5: provider 能力探测
调用 `provider.generatePartialEdit` 前必须检查 `typeof provider.generatePartialEdit === "function"`，不支持的 provider 返回 `provider_not_supported` 错误。

### INV-6: 关联关系继承
新 Asset 继承原 Asset 的 `storyBeatId` / `characterId` / `sceneId` 等关联关系，确保局部重绘结果出现在正确的 beat/character/scene 上下文中。

### INV-7: maskBounds 持久化
VideoTask 创建时通过 `computeMaskBounds` 计算并持久化 `maskBounds`，用于快速查询 mask 范围而无需解码 base64 PNG。

## AI 维护指南

- 修改本模块前必读 `contract.json` 中的 invariants
- 新增 mask shape 类型时，需同时更新 `mask-types.ts`、`mask-encoder.ts`、`VideoMaskCanvas.tsx`
- 新增 provider 支持时，在 provider 类中实现 `generatePartialEdit` 方法（参考 Seedance 2.5 实现）
- UI 组件变更时，确保 `PartialEditPanel` 的 props 接口稳定（外部依赖此接口）
