# Prompt Module

## 职责

提示词生成与管理：角色/场景/分镜/视频提示词构建、基础关键词常量、提示词优化

---

## 子域结构

本模块采用子域架构，包含 7 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `base` | [base/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/base/) | 关键词常量、描述构建工具 |
| `character` | [character/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/character/) | 角色提示词生成 |
| `scene` | [scene/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/scene/) | 场景提示词生成 |
| `beat-image` | [beat-image/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/beat-image/) | 分镜图片提示词生成 |
| `video` | [video/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/video/) | 视频提示词生成 |
| `server-prompts` | [server-prompts/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/server-prompts/) | 服务器端提示词 |
| `builder` | [builder/](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/prompt/builder/) | PromptBuilder 类、故事计划、快速模式 |

---

## 公共 API（index.ts）

### Base 子域
- `QUALITY_TAGS_IMAGE` — 图片质量标签
- `QUALITY_TAGS_VIDEO` — 视频质量标签
- `STYLE_KEYWORDS` — 风格关键词映射
- `SCENE_TYPE_KEYWORDS` — 场景类型关键词映射
- `MOOD_KEYWORDS` — 氛围关键词映射
- `LIGHTING_KEYWORDS` — 光照关键词映射
- `CAMERA_ANGLE_KEYWORDS` — 镜头角度关键词映射
- `CAMERA_MOVEMENT_KEYWORDS` — 镜头运动关键词映射
- `joinParts` — 拼接提示词片段
- `buildCharacterFullDesc` — 构建角色完整描述
- `buildSceneAtmosphereDesc` — 构建场景氛围描述
- `buildSceneVisualDesc` — 构建场景视觉描述

### Character 子域
- `generateCharacterImagePrompt` — 角色图片提示词
- `generateCharacterDetailedPromptInstruction` — 角色详细提示词指令
- `generateSimpleCharacterImagePrompt` — 简单角色图片提示词

### Scene 子域
- `generateSceneImagePrompt` — 场景图片提示词
- `generateSimpleSceneImagePrompt` — 简单场景图片提示词
- `generateScenePromptOptimization` — 场景提示词优化

### Beat-image 子域
- `generateBeatImagePrompt` — 分镜图片提示词
- `generateSimpleBeatImagePrompt` — 简单分镜图片提示词

### Video 子域
- `generateProfessionalVideoPrompt` — 专业视频提示词
- `generateEnhancedVideoPrompt` — 增强视频提示词
- `generateQuickVideoPrompt` — 快速视频提示词
- `generateSingleBeatPrompt` — 单分镜提示词

### Server-prompts 子域
- `generateFirstFramePrompt` — 首帧提示词
- `generateLastFramePrompt` — 尾帧提示词
- `generateCharacterAnalysisPrompt` — 角色分析提示词
- `generateSceneAnalysisPrompt` — 场景分析提示词

### Builder 子域
- `promptBuilder` — 提示词构建器单例
- `generateStoryPlanPrompt` — 故事计划提示词
- `generateQuickModeVideoPrompt` — 快速模式视频提示词
- `AVAILABLE_STYLES` — 可用风格列表
- `DURATION_OPTIONS` — 时长选项
- `RESOLUTION_OPTIONS` — 分辨率选项
- `getDurationOptionsForModel` — 按模型获取时长选项
- `getResolutionOptionsForModel` — 按模型获取分辨率选项
- `getStyleOptionsForModel` — 按模型获取风格选项

### 展示子域
- `ModelSelector` — 模型选择器组件
- `useModelSelection` — 模型选择 Hook
- `ModelSelection` — 模型选择类型 (type)
- `ConfigCheckBanner` — 配置检查横幅组件

---

## 依赖关系

```
base (底层)
  ├─ character
  ├─ scene
  ├─ video
  └─ builder

server-prompts (独立)
beat-image (独立)
```

---

## 边界约束

⚠️ **重要约束**：
- 子域之间只能通过各自的 `index.ts` 导出的 API 通信
- `base` 子域是最底层，其他子域依赖它
- 禁止跨层级直接引用（如 builder 直接引用 character）

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/prompt.md](../../../.ai/modules/prompt.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
