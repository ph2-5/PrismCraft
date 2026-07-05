<!-- AI: Before modifying this module, read contract.json for invariants -->
# Novel Module

> **来源**：v5.1 开发计划新增 — Phase 2A 故事创作流水线载体。
> **设计文档**：[docs/story-pipeline-design.md](../../../docs/story-pipeline-design.md) + [docs/development-plan.md Phase 2A](../../../docs/development-plan.md#phase-2a一键成片管道--角色一致性强化)

## 模块概述

故事创作流水线模块，承载从小说/剧本/大纲导入到分镜生成的完整工作流。与现有 `story` 模块（分镜管理）**完全分隔**：

- `novel` 模块：小说导入 → 章节分割 → 叙事 beats 分析 → 节奏规划 → 角色/场景提取 → 变体推荐 → Prompt 合成 → 调用 `story` 模块生成分镜
- `story` 模块：分镜 CRUD、关键帧/视频生成、批量编排（**保持不变**）

**核心设计理念**：渐进式编辑，而非全自动黑盒。每个步骤用户可干预，已有角色/场景自动复用，只编辑新的。

**交接点**：novel 模块完成 Segment 层级后，调用 `story` 模块的 `storyService.create` + `planStoryWithAI` 生成分镜 beats。novel 模块**不直接管理** StoryBeat。

---

## 子域结构

| 子域 | 路径 | 职责 | 对应 Task |
|------|------|------|----------|
| `domain` | [domain/](./domain/) | PipelineConfig、PipelineStage、Project、Chapter、Segment 等类型定义 | 2A.1 |
| `import` | [import/](./import/) | 文本导入、章节分割、Pipeline 状态机 | 2A.0, 2A.3 |
| `structure` | [structure/](./structure/) | 故事结构分析（叙事 beats） | 2A.13 |
| `pacing` | [pacing/](./pacing/) | 节奏规划引擎 | 2A.14 |
| `overview` | [overview/](./overview/) | 故事概览视图（图表） | 2A.15 |
| `onboarding` | [onboarding/](./onboarding/) | 新手引导 + 三档模式 | 2A.16 |
| `match` | [match/](./match/) | 角色/场景去重匹配（三级匹配） | 2A.2 |
| `extract` | [extract/](./extract/) | 角色/场景提取（AI Agent 工具） | 2A.4 |
| `importance` | [importance/](./importance/) | 多维重要性排序 | 2A.5 |
| `variants` | [variants/](./variants/) | 角色/场景变体推荐 | 2A.7, 2A.10 |
| `prompt` | [prompt/](./prompt/) | 分层式 Prompt 合成 | 2A.9 |
| `integration` | [integration/](./integration/) | 功能联动与过期标记机制 | 2A.17 |
| `presentation` | [presentation/](./presentation/) | StoryPipelineShell 三栏布局 | 2A.6 |
| `tools` | [tools/](./tools/) | Novel Agent 工具集（注册到 toolRunner） | 2A.2 |

---

## 公共 API

> ⚠️ 本模块处于 Phase 2A 开发中，公共 API 暂未完全确定。以下为预期 API 草案。

### domain 子域

| API | 签名 | 说明 |
|-----|------|------|
| `NovelSegment` | TypeScript interface | 文本片段 |
| `ExtractedCharacter` | TypeScript interface | 提取的角色 |
| `ExtractedScene` | TypeScript interface | 提取的场景 |
| `ShotBreakdown` | TypeScript interface | 分镜拆解 |
| `PipelineStage` | TypeScript type | 流水线阶段枚举 |
| `AIAssistLevel` | TypeScript type | AI 辅助程度三档模式（quick/standard/professional） |
| `PipelineConfig` | TypeScript interface | 流水线配置 |
| `PipelineState` | TypeScript interface | 流水线运行时状态 |
| `NovelProject` | TypeScript interface | 小说导入项目（持久化到 DB） |
| `SegmentPrompt` | TypeScript interface | 片段合成 Prompt |
| `GenerationResult` | TypeScript interface | 生成结果 |

### import 子域（待实现，Task 2A.0 / 2A.3）

> 以下 API 为预期草案，尚未在 index.ts 中导出。实现后取消 index.ts 中的注释并补充到此表格。

预期 API：
- STAGE_ORDER — 流水线阶段顺序
- VALID_TRANSITIONS — 合法状态转换表
- getStagesForMode — 三档模式 → 阶段子集
- canTransition — 状态转换检查
- transition — 执行状态转换

### integration 子域（待实现，Task 2A.17）

> 以下 API 为预期草案，尚未在 index.ts 中导出。实现后取消 index.ts 中的注释并补充到此表格。

预期 API：
- stalenessTracker — 过期标记追踪器单例
- triggerDispatcher — 触发分发器单例

---

## 依赖关系

| 依赖 | 用途 |
|------|------|
| `@/domain/schemas/character` | `CharacterAppearance` 类型 |
| `@/domain/schemas/story` | `StoryBeat` 类型（生成分镜时） |
| `@/domain/types` | `Result` 类型 |
| `@/infrastructure/di` | DI 容器 |
| `@/shared/event-bus` | 事件总线（联动机制） |
| `@/modules/story` | 调用 `storyService.create` + `planStoryWithAI` 生成分镜 |
| `@/modules/character` | 写入提取的角色 |
| `@/modules/scene` | 写入提取的场景 |
| `@/shared-logic/prompt` | 分层式 Prompt 合成（Task 2A.9） |

### 跨模块引用规则

- ✅ `novel` 可单向引用 `story` / `character` / `scene`（生成分镜、写入实体）
- ❌ `story` / `character` / `scene` **不得**反向引用 `novel`（避免循环依赖）
- ✅ `novel` 通过 `eventBus` 通知 `story` 模块刷新 beats 列表

---

## 边界约束

1. **路由分隔**：`/story` 路由属于 novel 模块，`/storyboard` 属于 story 模块
2. **不直接管理 StoryBeat**：novel 模块只负责生成到 Segment 层级，分镜生成委托 `story` 模块
3. **零依赖原则**：`domain/` 子域只定义纯类型，不导入 `@/modules/*` 或 `@/infrastructure/*`
4. **跨模块通过事件总线**：联动机制使用 `eventBus`，不直接调用其他模块的方法
5. **三档模式**：`PipelineConfig.aiAssistLevel` 决定 `STAGE_ORDER` 子集（`getStagesForMode` 函数）
6. **过期标记**：上游 stage 产出变化时，必须通过 `stalenessTracker` 标记下游 stage 为 stale（Task 2A.17）

---

## 不变量

- **INV-1**：`PipelineState.stage` 从 `project_init` → `done` 单向流动（不可回退，但子步骤可重做）
- **INV-2**：`PipelineState.step` 在 stage 内从 1 递增，跨 stage 时重置为 1
- **INV-3**：stage 流转顺序为 `project_init → content_import → [structure_analysis] → [pacing_planning] → character_manage → scene_manage → review → storyboard → generation → done`
- **INV-4**：`structure_analysis` 和 `pacing_planning` 在 quick/standard 模式可跳过，professional 模式必须经过
- **INV-5**：`aiAssistLevel` 决定 `STAGE_ORDER` 子集（`getStagesForMode` 函数）
- **INV-6**：上游 stage 产出变化时，必须通过 `stalenessTracker` 标记下游 stage 为 stale
- **INV-7**：`ExtractedCharacter.status` 为 `matched` 时必须设置 `matchedCharacterId`
- **INV-8**：角色/场景采用三级匹配（精确→模糊→向量），降低重复创建
- **INV-9**：场景变体用 8 维参数向量描述（timeOfDay/weather/lighting/mood/crowdLevel/cameraAngle/season/colorPalette）
- **INV-10**：Prompt 自动合成：片段描述 + 角色变体 promptFragment + 场景变体 promptFragment → 完整 Prompt
- **INV-11**：`NovelProject` 持久化到 SQLite，每个项目独立的 `PipelineState`

---

## AI 维护指南

### 修改前必读顺序

1. 本文件（MODULE.md）— 模块概览与公共 API
2. 子域 `contract.json` — 不变量与依赖
3. [docs/development-plan.md Phase 2A 实施架构](../../../docs/development-plan.md#phase-2a-实施架构v51-新增) — Task 归属与实施顺序
4. [docs/story-pipeline-design.md](../../../docs/story-pipeline-design.md) — 设计理念与流程

### 新增公共 API 时

1. 在子域 `index.ts` 中导出
2. 在模块 `index.ts` 中重新导出
3. 更新本文件「公共 API」部分
4. 更新子域 `contract.json` 的 `publicAPI` 字段
5. 运行 `node scripts/check-module-api-consistency.mjs` 验证

### 回归守卫提醒

- 联动机制必须通过 `stalenessTracker`，不得直接调用下游 Task 的 recompute 方法
- 模式切换时必须调用 `stalenessTracker.clearAll()` 清除所有过期标记

### 测试

- 测试文件位于各子域的 `__tests__/` 目录
- 运行：`npx vitest run src/modules/novel`
- 新增服务必须编写单元测试，覆盖率 ≥ 90%（Task 2A.17 要求）
