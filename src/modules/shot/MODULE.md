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
| `shot-instruction` | shot-instruction/ | 分镜指令解析与提示词构建：将结构化的分镜指令（镜头类型、运动、角度）转换为 AI 可用的提示词文本；含场景变体 → 镜头推荐（Task 2B.12） |
| `shot-reference` | shot-reference/ | 分镜引用管理：管理分镜之间的引用关系（链式引用、自定义引用），验证引用有效性，解析引用目标 |
| `reference-check` | reference-check/ | 元素引用检查：检查角色、场景、元素是否被故事/分镜引用，用于删除前的安全校验 |
| `shot-editor` | shot-editor/ | 分镜编辑器布局组件（Task 2B.11）：三栏布局 + 时间轴 |
| `shot-comparison` | shot-comparison/ | 分镜对比视图（Task 4.4）：并排展示同分镜的多个生成版本，含 prompt diff |
| `sub-shot` | sub-shot/ | 单分镜多镜头 SubShot（Task 4.10）：子镜头 CRUD 与列表 UI |

---

## 公共 API（index.ts）

### 一致性检查子域
- `performConfigCheck` — 执行生成配置完整性检查（参考图/特征标签是否就绪，返回配置就绪度评分）
- `checkVisualConsistency` — 评估分镜生成结果的视觉一致性评分（VLM 路径，调用视觉模型对生成图与元素描述打分）
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

### 镜头推荐子域（Task 2B.12：场景变体 → 镜头语言联动）
- `recommendShotBySceneVariant` — 根据场景变体（mood / pacing / scale）推荐镜头参数，返回 ShotRecommendation（推荐实现位于 @/shared-logic/shot/mood-shot-mapping）
- `recommendationToShotInstruction` — 将推荐结果转换为 ShotInstructionTemplate（可直接应用到 StoryBeat.shotInstruction）
- `recommendShotInstruction` — 便捷封装：从场景变体直接得到可应用的 ShotInstructionTemplate（等价于 recommendationToShotInstruction(recommendShotBySceneVariant(variant))）
- `getRecommendationLabels` — 获取推荐值的中文标签（用于 UI 显示，返回含 shotSizeLabel / cameraMovementLabel / cameraAngleLabel 的对象）
- Types: `ShotRecommendation` — 推荐结果（含 recommendedShotSize / recommendedCameraMovement / recommendedCameraAngle）
- Types: `SceneVariantInput` — 场景变体输入（mood / pacing / scale）

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

### 分镜编辑器布局子域（Task 2B.11）
- `ShotEditorLayout` — 三栏布局容器（左：提示词编辑 / 中：元素绑定 / 右：预览 / 底：时间轴）
- `PromptEditorColumn` — 左栏：提示词编辑列组件
- `ElementBindingColumn` — 中栏：元素绑定列组件
- `PreviewColumn` — 右栏：预览列组件
- `ShotTimeline` — 底部：分镜时间轴组件

### 分镜对比视图子域（Task 4.4）
- `ShotCompareView` — 顶层对比视图容器（左右并排展示同分镜的多个生成版本，管理同步播放）
  - Props: ShotCompareViewProps（shotId / versions / onSelect / onArchive）
- `ComparePanel` — 单个对比面板（左/右侧）
  - Props: ComparePanelProps（side / version / isSelected / onSelect / onArchive / videoRef? / playSignal?）
- `diffText` — 将两段文本按行对比，返回 DiffLine[]（type: "same" | "left" | "right"）
- `countDifferences` — 统计差异行数量
- Types: `ShotVersion` — 分镜的一个生成版本（versionId / taskId / type / url / prompt / parameters / createdAt / isArchived? / label?）
- Types: `ShotVersionType` — 版本类型联合（"video" | "keyframe"）
- Types: `ShotVersionParameters` — 版本生成参数（model? / duration? / resolution? / style? / providerId? / providerModelId?）
- Types: `DiffLine` — Diff 行（text / type / leftLine? / rightLine?）
- Types: `ShotCompareViewProps`, `ComparePanelProps`

### 单分镜多镜头 SubShot 子域（Task 4.10）
- `listSubShots` — 列出某分镜下的所有子镜头
- `createSubShot` — 创建子镜头（自动生成 subshot- 前缀 ID + 时间戳 + 随机数，自动追加序号到末尾）
- `updateSubShot` — 更新子镜头
- `deleteSubShot` — 删除单个子镜头
- `deleteSubShotsByBeatId` — 按分镜 ID 批量删除子镜头
- `moveSubShot` — 移动子镜头顺序，返回重排后的列表
- `reorderSubShots` — 按 id 顺序重排子镜头
- `useSubShots` — 子镜头列表状态管理 Hook（含 subShots / loading / error / refresh / addSubShot / editSubShot / removeSubShot / moveUp / moveDown）
- `SubShotList` — 子镜头列表 UI 组件
- Types: `UseSubShotsResult` — Hook 返回值类型

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

### INV-10: SubShot 子实体管理（Task 4.10）
- `SubShot.storyBeatId` 必须指向已存在的 StoryBeat
- `SubShot.sequence` 在同一 StoryBeat 下必须唯一且连续（0-based）
- 删除 StoryBeat 时应级联删除其所有 SubShot（由 DB 外键 `ON DELETE CASCADE` 处理）
- `SubShot.duration` 范围 1-30 秒
- `moveSubShot` 后自动重新编号 sequence
- `createSubShot` 自动生成 `subshot-` 前缀 ID（时间戳 + 随机数），新子镜头追加到末尾（sequence = max + 1）

### INV-11: 镜头推荐只读性（Task 2B.12）
`recommendShotBySceneVariant` / `recommendShotInstruction` 为纯函数，仅根据 `SceneVariantInput` 返回推荐的镜头参数，不修改任何状态；推荐实现位于 `@/shared-logic/shot/mood-shot-mapping`，shot 模块仅做再导出与 `ShotInstructionTemplate` 适配

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/shot.md](../../../.ai/modules/shot.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误处理使用：`@/shared/error-handler`
