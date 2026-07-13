<!-- AI: Before modifying this module, read contract.json for invariants -->
# Prompt Module

## 模块概述

提示词生成与管理模块，负责角色/场景/分镜/视频提示词的构建、基础关键词常量维护、提示词优化及服务端分析提示词生成。本模块为纯函数模块，所有生成函数均为同步纯函数，无副作用。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `base` | [base/](./base/) | 关键词常量映射（风格/场景/氛围/灯光/镜头）、描述构建工具函数 |
| `character` | [character/](./character/) | 角色图片提示词、角色详细描述指令、简单角色提示词生成 |
| `scene` | [scene/](./scene/) | 场景图片提示词、简单场景提示词、场景提示词优化 |
| `beat-image` | [beat-image/](./beat-image/) | 分镜图片提示词、简单分镜图片提示词生成 |
| `video` | [video/](./video/) | 专业/增强/快速/单分镜视频提示词生成 |
| `server-prompts` | [server-prompts/](./server-prompts/) | 首帧/尾帧提示词、角色/场景分析提示词（服务端 API 用） |
| `builder` | [builder/](./builder/) | PromptBuilder 类、故事计划提示词、快速模式提示词、模型选项配置 |
| `presentation` | [presentation/](./presentation/) | 模型选择器、配置检查横幅 |
| `templates` | [templates/](./templates/) | 提示词模板库（内置 + 用户自定义）、负面提示词智能生成、LLM 提示词优化 |

---

## 公共 API

### base 子域

| API | 签名 | 说明 |
|-----|------|------|
| `QUALITY_TAGS_IMAGE` | `string` | 图片质量标签常量 |
| `QUALITY_TAGS_VIDEO` | `string` | 视频质量标签常量 |
| `STYLE_KEYWORDS` | `Record<string, string \| string[]>` | 风格关键词映射 |
| `SCENE_TYPE_KEYWORDS` | `Record<string, string \| string[]>` | 场景类型关键词映射 |
| `MOOD_KEYWORDS` | `Record<string, string \| string[]>` | 氛围关键词映射 |
| `LIGHTING_KEYWORDS` | `Record<string, string \| string[]>` | 光照关键词映射 |
| `CAMERA_ANGLE_KEYWORDS` | `Record<string, string \| string[]>` | 镜头角度关键词映射 |
| `CAMERA_MOVEMENT_KEYWORDS` | `Record<string, string \| string[]>` | 镜头运动关键词映射 |
| `joinParts` | `(...parts: (string \| undefined \| null)[]) → string` | 拼接提示词片段，过滤空值 |
| `buildCharacterFullDesc` | `(character: Character) → string` | 构建角色完整描述 |
| `buildSceneAtmosphereDesc` | `(scene: Scene) → string` | 构建场景氛围描述 |
| `buildSceneVisualDesc` | `(scene: Scene) → string` | 构建场景视觉描述 |

### character 子域

| API | 签名 | 说明 |
|-----|------|------|
| `generateCharacterImagePrompt` | `(character: Character, style?: string) → string` | 角色图片提示词 |
| `generateCharacterDetailedPromptInstruction` | `(character: Character) → string` | 角色详细提示词指令 |
| `generateSimpleCharacterImagePrompt` | `(character: Character) → string` | 简单角色图片提示词 |

### scene 子域

| API | 签名 | 说明 |
|-----|------|------|
| `generateSceneImagePrompt` | `(scene: Scene, style?: string) → string` | 场景图片提示词 |
| `generateSimpleSceneImagePrompt` | `(scene: Scene) → string` | 简单场景图片提示词 |
| `generateScenePromptOptimization` | `(scene: Scene) → string` | 场景提示词优化 |

### beat-image 子域

| API | 签名 | 说明 |
|-----|------|------|
| `generateBeatImagePrompt` | `(beat: StoryBeat, ...) → string` | 分镜图片提示词 |
| `generateSimpleBeatImagePrompt` | `(beat: StoryBeat) → string` | 简单分镜图片提示词 |

### video 子域

| API | 签名 | 说明 |
|-----|------|------|
| `generateProfessionalVideoPrompt` | `(beat: StoryBeat, ...) → string` | 专业视频提示词 |
| `generateEnhancedVideoPrompt` | `(beat: StoryBeat, ...) → string` | 增强视频提示词 |
| `generateQuickVideoPrompt` | `(beat: StoryBeat, ...) → string` | 快速视频提示词 |
| `generateSingleBeatPrompt` | `(beat: StoryBeat, ...) → string` | 单分镜提示词 |

### server-prompts 子域

| API | 签名 | 说明 |
|-----|------|------|
| `generateFirstFramePrompt` | `(beat: StoryBeat, ...) → string` | 首帧提示词（API 用） |
| `generateLastFramePrompt` | `(beat: StoryBeat, ...) → string` | 尾帧提示词（API 用） |
| `generateKeyframePrompt` | `(beat: StoryBeat, ...) → string` | 关键帧提示词（API 用） |
| `generateCharacterAnalysisPrompt` | `(imageUrl: string) → string` | 角色分析提示词（API 用） |
| `generateSceneAnalysisPrompt` | `(imageUrl: string) → string` | 场景分析提示词（API 用） |

### builder 子域

| API | 签名 | 说明 |
|-----|------|------|
| `PromptBuilder` | `class` | 提示词构建器类（链式调用） |
| `promptBuilder` | PromptBuilder 实例 | 提示词构建器单例 |
| `generateStoryPlanPrompt` | `(story: Story) → string` | 故事计划提示词 |
| `generateQuickModeVideoPrompt` | `(beat: StoryBeat, ...) → string` | 快速模式视频提示词 |
| `AVAILABLE_STYLES` | `readonly string[]` | 可用风格列表 |
| `getDurationOptions` | `() → DurationOption[]` | 时长选项 |
| `getResolutionOptions` | `() → ResolutionOption[]` | 分辨率选项 |
| `getDurationOptionsForModel` | `(model: string) → DurationOption[]` | 按模型获取时长选项 |
| `getResolutionOptionsForModel` | `(model: string) → ResolutionOption[]` | 按模型获取分辨率选项 |
| `getStyleOptionsForModel` | `(model: string) → string[]` | 按模型获取风格选项 |

### presentation 子域

| API | 签名 | 说明 |
|-----|------|------|
| `ModelSelector` | `React.FC<ModelSelectorProps>` | 模型选择器组件 |
| `useModelSelection` | `() → ModelSelection` | 模型选择 Hook |
| `ModelSelection` | `type` | 模型选择类型 |

### templates 子域

#### 模板库类型
| API | 签名 | 说明 |
|-----|------|------|
| `PromptTemplateCategory` | `type` | 模板分类类型 |
| `PromptTemplateTarget` | `type` | 模板目标类型（角色/场景/视频等） |
| `PromptTemplateVariable` | `type` | 模板变量类型 |
| `PromptTemplate` | `type` | 提示词模板类型 |
| `CreatePromptTemplateInput` | `type` | 创建模板输入类型 |
| `ApplyTemplateResult` | `type` | 应用模板结果类型 |
| `NegativePromptConfig` | `type` | 负面提示词配置类型 |
| `NegativePromptScene` | `type` | 负面提示词场景类型 |
| `OptimizedPromptResult` | `type` | 优化提示词结果类型 |

#### 模板库常量与函数
| API | 签名 | 说明 |
|-----|------|------|
| `CATEGORY_LABELS` | `Record<string, string>` | 分类标签映射 |
| `TARGET_LABELS` | `Record<string, string>` | 目标标签映射 |
| `BUILTIN_TEMPLATES` | `PromptTemplate[]` | 内置模板列表 |
| `initTemplates` | `() → Promise<void>` | 初始化模板库（幂等） |
| `listPromptTemplates` | `() → PromptTemplate[]` | 列出所有模板 |
| `searchPromptTemplates` | `(query: string) → PromptTemplate[]` | 搜索模板 |
| `getPromptTemplate` | `(id: string) → PromptTemplate \| null` | 获取单个模板 |
| `createPromptTemplate` | `(input: CreatePromptTemplateInput) → PromptTemplate` | 创建模板 |
| `updatePromptTemplate` | `(id: string, patch: Partial<...>) → PromptTemplate` | 更新模板 |
| `deletePromptTemplate` | `(id: string) → boolean` | 删除模板 |
| `applyPromptTemplate` | `(id: string, vars: Record<string, string>) → ApplyTemplateResult` | 应用模板 |
| `exportPromptTemplates` | `() → string` | 导出模板为 JSON 字符串 |
| `importPromptTemplates` | `(json: string) → number` | 导入模板 |
| `getPromptTemplateStats` | `() → object` | 获取模板统计信息 |

#### 负面提示词智能生成
| API | 签名 | 说明 |
|-----|------|------|
| `getNegativePrompt` | `(scene?: NegativePromptScene) → string` | 获取负面提示词 |
| `enhanceNegativePromptWithLLM` | `(prompt: string) → Promise<string>` | 用 LLM 增强负面提示词 |
| `getNegativePromptConfig` | `() → NegativePromptConfig` | 获取负面提示词配置 |
| `saveNegativePromptConfig` | `(config: NegativePromptConfig) → void` | 保存负面提示词配置 |
| `getSmartNegativePrompt` | `(scene?: NegativePromptScene) → Promise<string>` | 获取智能负面提示词 |

#### LLM 提示词自动优化
| API | 签名 | 说明 |
|-----|------|------|
| `optimizeCharacterPrompt` | `(prompt: string) → Promise<OptimizedPromptResult>` | 优化角色提示词 |
| `optimizeVideoPrompt` | `(prompt: string) → Promise<OptimizedPromptResult>` | 优化视频提示词 |
| `optimizePrompt` | `(prompt: string, type: string) → Promise<OptimizedPromptResult>` | 通用提示词优化 |
| `getCharacterStyles` | `() → string[]` | 获取角色风格列表 |
| `getVideoStyles` | `() → string[]` | 获取视频风格列表 |

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | Character, Scene, StoryBeat, StoryElement 等类型定义 |
| `@/domain/types` | Result 类型（builder 子域使用） |
| `@/infrastructure/di` | DI 容器（presentation 子域获取模型配置） |
| `@/shared/*` | 共享工具函数 |

### 子域内部依赖图

```
base ← @/domain/schemas（底层，无子域依赖）
  │
  ├─→ character ← base, @/domain/schemas
  ├─→ scene ← base, @/domain/schemas
  ├─→ video ← base, @/domain/schemas
  ├─→ builder ← base, @/domain/schemas
  │
  ├─→ server-prompts ← @/domain/schemas（独立，不依赖 base）
  └─→ beat-image ← @/domain/schemas（独立，不依赖 base）
```

---

## 边界约束

1. 子域之间只能通过各自的 `index.ts` 导出的 API 通信
2. `base` 子域是最底层，其他子域可依赖它，但 `base` 不依赖任何子域
3. `server-prompts` 和 `beat-image` 是独立子域，不依赖 `base` 也不被其他子域依赖
4. 禁止跨层级直接引用（如 builder 直接引用 character 的内部文件）
5. 禁止导入路径：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
6. 类型必须从 `@/domain/schemas` 导入

---

## 不变量

- **INV-1**：所有提示词生成函数必须为纯函数，无副作用，相同输入产生相同输出
- **INV-2**：关键词映射使用 `Record<string, string | string[]>` 类型，键名为英文标识符，值为中文或英文关键词
- **INV-3**：描述构建函数返回格式化字符串，缺失字段使用默认值填充，不抛出错误
- **INV-4**：`base` 子域是最底层，不依赖其他子域
- **INV-5**：角色提示词必须包含外观描述、风格标签、质量标签三个维度
- **INV-6**：场景提示词必须包含场景类型、氛围、视觉描述、灯光四个维度
- **INV-7**：视频提示词必须包含质量标签、风格描述、动作描述三个维度
- **INV-8**：`server-prompts` 子域独立于 `base`，不依赖提示词构建基础设施
- **INV-9**：`beat-image` 子域独立于 `base`
- **INV-10**：`PromptBuilder` 支持链式调用，构建结果必须是完整的、可直接使用的提示词字符串

---

## AI 维护指南

详细 AI 重构规范请参见：[.ai/modules/prompt.md](../../../.ai/modules/prompt.md)

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. 子域 `contract.json` — 不变量与依赖
3. [.ai/modules/prompt.md](../../../.ai/modules/prompt.md) — 详细修改规则
4. `index.ts` — 实际桶导出

### 新增公共 API 时

1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 修改子域内部实现时

1. 检查 `contract.json` 的 `invariants`，确保不违反不变量
2. 不改变公共 API 签名则无需更新文档
3. 运行 `npx eslint .` 和 `node scripts/check-architecture.mjs` 验证

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/prompt`
- 新增服务必须编写单元测试
