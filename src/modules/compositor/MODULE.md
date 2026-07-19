# Compositor Module

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概述

全局编译器模块，提供"角色 + 道具 + 场景 → AI 图像合成"功能。三栏布局 UI（素材面板 / 画布 / P图工具），生成结果持久化到 `generation_assets` 表（type=compositor_result, sourceType=composited）。

Task 2A.9 实现。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `domain` | [domain/](./domain/) | Compositor schema 定义（输入/输出/图层/预设/状态） |
| `services` | [services/](./services/) | compositor-engine：实体加载 + prompt 拼装 + 调用图像模型 + 持久化 |
| `hooks` | [hooks/](./hooks/) | useCompositor：图层状态管理 + 生成流程编排 |
| `presentation` | [presentation/](./presentation/) | CompositorPanel：三栏布局 UI |

---

## 公共 API

### Schemas

| API | 签名 | 说明 |
|-----|------|------|
| `compositorInputSchema` | `z.ZodObject` | 编译器输入 schema（characterId 必填，propIds/sceneId/extraPrompt/provider/modelId/resolution 可选） |
| `compositorResultSchema` | `z.ZodObject` | 生成结果 schema（id/characterId/propIds/sceneId/imageUrl/prompt/createdAt） |
| `composerLayerSchema` | `z.ZodObject` | 画布图层 schema（layerId/id/type/name/emoji/x/y/scale/zIndex） |
| `composerLayerTypeSchema` | `z.ZodEnum` | 图层类型枚举 schema（character/scene/prop/text） |
| `compositorPresetSchema` | `z.ZodObject` | 预设 schema（保存常用组合） |
| `compositorStatusSchema` | `z.ZodEnum` | 生成状态枚举 schema（idle/building-prompt/generating/saving/success/error） |

### Types

| API | 签名 | 说明 |
|-----|------|------|
| `CompositorInput` | type | 编译器输入类型（compositorInputSchema 推断） |
| `CompositorResult` | type | 生成结果类型（compositorResultSchema 推断） |
| `ComposerLayer` | type | 画布图层类型（composerLayerSchema 推断） |
| `ComposerLayerType` | type | 图层类型枚举（character/scene/prop/text） |
| `CompositorPreset` | type | 预设类型（compositorPresetSchema 推断） |
| `CompositorStatus` | type | 生成状态枚举类型 |

### Services

| API | 签名 | 说明 |
|-----|------|------|
| `composeImage` | `(input, options?) → Promise<CompositorResult>` | 执行一次合成：拼装 prompt → 调用图像模型 → 持久化 |
| `buildCompositorPrompt` | `(input) → Promise<string>` | 仅拼装 prompt（不调用模型，用于预览） |
| `getCompositorErrorMessage` | `(err) → string` | 提取错误信息 |

### Hooks

| API | 签名 | 说明 |
|-----|------|------|
| `useCompositor` | `() → UseCompositorResult` | React Hook：图层/状态/生成流程管理 |
| `UseCompositorResult` | type | useCompositor 返回值类型（图层列表 + 选中状态 + 生成状态 + 操作方法） |

### Components

| API | 签名 | 说明 |
|-----|------|------|
| `CompositorPanel` | `React.FC` | 三栏布局 UI 组件 |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | Character / Scene / Prop 类型定义 |
| `@/infrastructure/di` | container.imageProvider / characterStorage / sceneStorage / propStorage |
| `@/shared-logic/prompt` | generateCompositorPrompt（复用 buildCharacterFullDesc 等） |
| `@/shared/presentation` | Tabs / SafeImage / EmptyState / IconButton |
| `@/shared/constants` | t() 国际化 |
| `@/modules/character` | useCharacters hook |
| `@/modules/scene` | useScenes hook |
| `@/modules/asset` | useProps hook + createAsset（持久化生成结果） |

---

## 边界约束

1. 禁止直接导入 `@/infrastructure/storage/*`，必须通过 DI container
2. Compositor 模块是顶层功能模块，独立于 asset 模块
3. 通过 `@/modules/asset` 的 `createAsset` 持久化生成结果，不直接写 generation_assets 表
4. prompt 拼装通过 `@/shared-logic/prompt` 的 `generateCompositorPrompt`，不在模块内重复实现
5. 角色图层和场景图层在画布内单实例（新替换旧），道具图层可多实例（按 id 去重）

---

## 不变量

- **INV-1**：`CompositorInput.characterId` 必填，是合成的主对象
- **INV-2**：生成结果必须持久化到 `generation_assets` 表（type=compositor_result, sourceType=composited），失败时记录日志但不阻塞返回
- **INV-3**：prompt 由 `generateCompositorPrompt` 自动拼装，包含角色全描述、场景氛围、道具列表、用户自定义补充、质量标签
- **INV-4**：图层在画布内通过 `layerId` 唯一标识，删除/拖拽/选择都基于 layerId
- **INV-5**：生成过程可通过 AbortSignal 取消，取消后状态回到 idle

---

## AI 维护指南

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. `contract.json` — 不变量与依赖
3. `compositor.schema.ts` — 数据类型
4. `compositor-engine.ts` — 业务编排逻辑

### 新增公共 API 时

1. 在子域文件中导出
2. 在 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新 `contract.json` 的 `publicAPI` 字段

### 回归守卫提醒

- 生成失败时不能丢失已生成的 imageUrl（持久化失败不阻塞返回）
- 取消生成必须通过 AbortController，不能强行中断 Promise
