<!-- AI: Before modifying this module, read contract.json for invariants -->

# Agent Tools - Generation Module

> AI 生成与图像编辑工具模块 — 从 agent/tools/ 拆分而来（阶段3-2）。

## 模块概览

- **定位**：从 agent 模块拆分出的独立工具集模块，包含 AI 生成工具与图像编辑工具
- **核心**：19 个工具实现（9 个 generation + 10 个 image-edit），通过 `toolRegistry` 注册到 agent
- **依赖**：仅依赖 `@/domain/types/agent-tools`、`@/shared/constants/tool-timeouts`、`@/infrastructure/di`、`@/domain/schemas`、`@/shared/file-http`

## 背景

这些工具均为叶子工具集，无 `agent/services` 依赖，因此可独立成模块。从 `@/modules/agent/tools/` 拆分后，agent 模块通过 `@/modules/agent-tools-generation` 导入工具数组并注册。

## 子域

| 子域 | 路径 | 职责 |
|------|------|------|
| generation | `generation-tools.ts` | AI 生成工具（角色/场景/道具图像、文本、音乐、配音、语音合成、音频转录） |
| image-edit | `image-edit-tools.ts` | 图像编辑工具（编辑、裁剪、合并、合成、去背景、滤镜、调色、修补、文字叠加、缩放） |

## Public API

### Generation Tools（9 个）

- `generateCharacterImageTool` — 生成角色图像
- `generateSceneImageTool` — 生成场景图像
- `generatePropImageTool` — 生成道具图像
- `analyzeImageTool` — 分析图像
- `generateTextTool` — 生成文本
- `generateMusicTool` — 生成音乐
- `generateVoiceoverTool` — 生成配音
- `textToSpeechTool` — 文字转语音
- `transcribeAudioTool` — 音频转录
- `generationTools` — 所有生成工具数组

### Image Edit Tools（10 个）

- `editImageTool` — 编辑图像
- `cropImageTool` — 裁剪图像
- `mergeImagesTool` — 合并图像
- `compositeImageTool` — 合成图像
- `removeBackgroundTool` — 去背景
- `applyFilterTool` — 应用滤镜
- `adjustColorsTool` — 调整颜色
- `inpaintTool` — 修补图像
- `addTextOverlayTool` — 添加文字叠加
- `resizeImageTool` — 缩放图像
- `imageEditTools` — 所有图像编辑工具数组

## 边界约束

- **禁止**：本模块导入 `@/modules/agent/*`（agent 模块依赖本模块的工具数组，避免循环）
- **禁止**：本模块导入 `@/infrastructure/*`（除 `@/infrastructure/di` 用于 container）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：文件操作通过 `@/shared/file-http` 统一层

## 依赖方向

```
agent-tools-generation → @/domain/types/agent-tools（类型）
                       → @/shared/constants/tool-timeouts
                       → @/infrastructure/di（container.imageProvider / characterStorage 等）
                       → @/domain/schemas（Character / Scene 类型）
                       → @/shared/file-http（writeFile / getCacheDirectory）
                       → @/modules/character, @/modules/scene（动态导入）
```
