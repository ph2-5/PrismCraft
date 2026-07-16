# Agent Tools Generation 模块 - AI 维护指南

## 子域风险等级

| 子域 | 风险 | 原因 |
|------|------|------|
| generation | 🔴 高 | 9 个 AI 生成工具（图像/文本/音乐/配音/语音合成/音频转录）、长耗时（5min 超时）、调用 imageProvider/textProvider |
| image-edit | 🔴 高 | 10 个图像编辑工具（裁剪/合并/合成/去背景/滤镜/调色/修补/文字叠加/缩放）、文件 I/O 频繁 |
| barrel | 🟢 低 | 仅 index.ts 聚合导出 |

## 子域依赖图

```
generation-tools.ts（9 个）
  ← @/domain/types/agent-tools、@/shared/constants/tool-timeouts
  ← @/infrastructure/di（container.imageProvider / characterStorage 等）
  ← @/domain/schemas、@/shared/file-http（writeFile / getCacheDirectory）
  ← @/modules/character, @/modules/scene（动态导入）
image-edit-tools.ts（10 个）
  ← 同上
  ↑
index.ts（barrel）
  ↑
@/modules/agent/tools/index.ts（通过 toolRegistry 注册）
```

- 两个工具文件彼此独立，均为叶子工具集，无 agent/services 依赖
- 文件操作通过 `@/shared/file-http` 统一层
- 生成类工具超时分级（5min）

## 公共 API

### Generation Tools（9 个）
- `generateCharacterImageTool` / `generateSceneImageTool` / `generatePropImageTool`
- `analyzeImageTool` / `generateTextTool`
- `generateMusicTool` / `generateVoiceoverTool` / `textToSpeechTool` / `transcribeAudioTool`
- `generationTools` — 所有生成工具数组

### Image Edit Tools（10 个）
- `editImageTool` / `cropImageTool` / `mergeImagesTool` / `compositeImageTool`
- `removeBackgroundTool` / `applyFilterTool` / `adjustColorsTool` / `inpaintTool`
- `addTextOverlayTool` / `resizeImageTool`
- `imageEditTools` — 所有图像编辑工具数组

## 常见修改场景

### 1. 新增 AI 生成工具
- 修改文件：`generation-tools.ts`，在 `index.ts` 追加 export
- 检查不变量：工具命名唯一、所有工具声明 `dangerLevel`、生成类工具超时 5min、文件操作通过 `@/shared/file-http`、provider 通过 DI container 获取
- 测试：`npx vitest run src/modules/agent-tools-generation/__tests__/generation-tools.test.ts`

### 2. 修改图像编辑工具
- 修改文件：`image-edit-tools.ts`
- 检查不变量：文件操作通过 `@/shared/file-http` 统一层、临时文件存放于 cacheDirectory
- 测试：`npx vitest run src/modules/agent-tools-generation/__tests__/image-edit-tools.test.ts`

### 3. 修改生成结果存储路径
- 修改文件：`generation-tools.ts` 或 `image-edit-tools.ts`
- 检查不变量：生成结果通过 `writeFile` 持久化到 cacheDirectory
- 测试：`npx vitest run src/modules/agent-tools-generation/__tests__/`

## 边界约束

- **依赖方向**：可导入 `@/domain/*`、`@/shared/*`（file-http、constants）、`@/infrastructure/di`、`@/modules/character`、`@/modules/scene`（动态导入）
- **禁止导入**：`@/modules/agent/*`（agent 依赖本模块工具数组，避免循环）、`@/infrastructure/*`（除 DI）、`@/modules/*/*/*`（深路径）
- **禁止**：直接调用 `electronAPI.*`（文件操作必须走 `@/shared/file-http`）
- **必须**：工具类型从 `@/domain/types/agent-tools` 导入
- **必须**：文件操作通过 `@/shared/file-http` 统一层

## 测试验证

- 测试命令：`npx vitest run src/modules/agent-tools-generation`
- 关键测试文件：
  - `__tests__/generation-tools.test.ts` — AI 生成工具
  - `__tests__/image-edit-tools.test.ts` — 图像编辑工具
