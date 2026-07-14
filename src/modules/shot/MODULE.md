<!-- AI: Before modifying this module, read contract.json for invariants -->
# Shot Module

## 模块概述

分镜系统：负责分镜的视觉一致性检查、元素绑定、特征提取与锚定、镜头指令转换、分镜生成管道、引用引擎和引用检查。为 story 模块和 API 路由提供分镜相关的核心能力。

---

## 子域结构

| 子域 | 路径 | 描述 |
|------|------|------|
| `consistency-check` | consistency-check/ | 视觉一致性检查与配置校验：检查分镜生成配置是否完整，验证特征锚定配置有效性，评估生成结果的一致性评分 |
| `element-binding` | element-binding/ | 分镜元素绑定管理：管理分镜与角色、场景等 StoryElement 的绑定关系，提供元素库访问和绑定状态管理 |
| `feature-extraction` | feature-extraction/ | 特征提取与锚定服务：从角色/场景提取特征标签，验证参考图质量，构建特征锚定配置，提供混合模式策略 |
| `shot-generation` | shot-generation/ | 分镜生成管道：编排分镜的完整生成流程（参数校验 → Few-Shot 提示构建 → 故事计划生成 → 结果验证） |
| `shot-instruction` | shot-instruction/ | 分镜指令解析与提示词构建：将结构化的分镜指令（镜头类型、运动、角度）转换为 AI 可用的提示词文本 |
| `shot-reference` | shot-reference/ | 分镜引用管理：管理分镜之间的引用关系（链式引用、自定义引用），验证引用有效性，解析引用目标 |
| `reference-check` | reference-check/ | 元素引用检查：检查角色、场景、元素是否被故事/分镜引用，用于删除前的安全校验 |

---

## 公共 API（index.ts）

### 一致性检查子域
- `performConsistencyCheck` — 执行视觉一致性检查（含配置校验 + 一致性评分）
- `checkVisualConsistency` — 评估分镜生成结果的视觉一致性评分
- `performConfigCheck` — 执行生成配置检查
- `validateFeatureAnchoringConfig` — 验证特征锚定配置有效性
- `validateNoFrameBinding` — 验证无帧绑定参数
- `parseConsistencyAnalysisFromStructured` — 从结构化输出解析一致性分析结果
- Type: `ConsistencyCheckInput`

### 元素引用检查子域
- `checkCharacterReferences` — 检查角色是否被故事/分镜引用
- `checkSceneReferences` — 检查场景是否被故事/分镜引用
- `checkElementReferences` — 检查元素是否被故事/分镜引用
- Types: `ReferenceInfo`, `DeleteCheckResult`

### 镜头指令子域
- `SHOT_SIZE_OPTIONS` — 镜头尺寸选项常量
- `CAMERA_MOVEMENT_OPTIONS` — 镜头运动选项常量
- `CAMERA_ANGLE_OPTIONS` — 镜头角度选项常量
- `buildPromptLayers` — 构建分层提示词（params 含 `language?: "en" | "zh" | "auto"`）

### 元素绑定子域
- `elementManager` — 元素管理器实例

### 特征提取子域
- `validateReferenceImageQuality` — 引用图片质量验证
- `buildFeatureAnchoringConfig` — 构建特征锚定配置（含 `language?: FeatureLanguage` 参数）
- `extractCharacterFeatures` — 从角色提取特征标签（含 `language?: FeatureLanguage` 参数）
- `buildFeatureTags` — 构建特征标签（含 `language?: FeatureLanguage` 参数）
- `buildFeatureAnchor` — 构建特征锚点（含 `language?: FeatureLanguage` 参数）
- Type: `FeatureLanguage` — `"en" | "zh"`，特征提取输出语言

### 引用引擎子域
- `referenceEngine` — 引用引擎实例

### 分镜生成子域
- `validateShotParams` — 校验分镜生成参数
- `validateStoryBeatOutput` — 校验分镜输出
- `validateStoryPlanOutput` — 校验故事计划输出
- `generateFallbackParams` — 生成降级参数
- `formatValidationResult` — 格式化校验结果
- `generateStoryPlanWithValidation` — 带校验的故事计划生成管道
- Types: `ValidationResult`, `ShotParamsType`

---

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas` | ShotSystem 类型、StoryBeat、StoryElement 等 |
| `@/domain/types` | Result 类型 |
| `@/domain/utils/shot-prompt` | 分镜提示词工具 |
| `@/domain/services/reference-check` | 引用检查服务 |
| `@/infrastructure/di` | 依赖注入容器（elementManager, referenceEngine） |
| `@/infrastructure/ai-providers` | AI 提供商接口 |

---

## 边界约束

1. **子域隔离**：子域之间只能通过各自的 `index.ts` 导出的 API 通信
2. **禁止直接引用其他子域的内部文件**（如 `../element-binding/element-manager.ts`）
3. **所有跨子域引用必须通过 `../subdomain` 导入**
4. **禁止导入路径**：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`
5. **类型必须从 `@/domain/schemas` 导入**
6. **国际化模型支持**：`promptLanguage` 参数贯穿生成管道（`buildStoryPlanPrompt` → `enrichPromptWithFewShot` → `buildPromptLayers`），`FeatureLanguage` 贯穿特征提取链（`extractCharacterFeatures` → `buildFeatureTags` → `buildFeatureAnchor` → `buildFeatureAnchoringConfig`）。当 `promptLanguage` 为 `"auto"` 时，由 `generateStoryPlanWithValidation` 根据 `videoModelId` 通过 `getVideoGenerationStrategy` 解析为 `"en"` 或 `"zh"`

---

## 不变量

### INV-1: 一致性检查独立性
`checkVisualConsistency` 评估分镜生成结果的视觉一致性评分，`performConfigCheck` 和 `validateFeatureAnchoringConfig` 确保生成配置完整且有效

### INV-2: 元素绑定隔离
`elementManager` 管理分镜与 StoryElement 的绑定关系，`useElementBinding` 提供元素库访问和绑定状态管理

### INV-3: 特征锚定流程
`extractCharacterFeatures` 和 `buildFeatureTags` 从角色/场景提取特征标签；`buildFeatureAnchoringConfig` 构建特征锚定配置，`validateFeatureAnchoring` 验证配置有效性；`getBlendMode` 和 `buildBlendPrompt` 提供混合模式策略

### INV-4: 生成管道顺序
分镜生成管道按 参数校验 → Few-Shot 提示构建 → 故事计划生成 → 结果验证 的顺序编排

### INV-5: 镜头参数常量化
镜头参数选项使用常量数组定义（SHOT_SIZE_OPTIONS, CAMERA_MOVEMENT_OPTIONS, CAMERA_ANGLE_OPTIONS）

### INV-6: 引用有效性
`referenceEngine` 负责管理分镜间的链式引用和自定义引用关系，`validateReference` 和 `getTargetShot` 确保引用目标的有效性

### INV-7: 删除前安全校验
`checkCharacterReferences`、`checkSceneReferences`、`checkElementReferences` 用于删除前的安全校验，防止误删被引用的元素

### INV-8: 禁止跨模块依赖
所有子域禁止直接导入 story 和 video 模块

### INV-9: 语言参数一致性
生成管道中的 `language`/`promptLanguage` 参数必须在调用链中一致传递：`generateStoryPlanWithValidation` 解析 `promptLanguage` 后，将解析结果传递给 `buildStoryPlanPrompt`、`enrichPromptWithFewShot`、`buildPromptLayers`；特征提取链中的 `language` 参数必须从调用方一致传递到 `extractCharacterFeatures`、`buildFeatureTags`、`buildFeatureAnchor`、`buildFeatureAnchoringConfig`

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/shot.md](../../../.ai/modules/shot.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误处理使用：`@/shared/error-handler`
