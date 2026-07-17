# Novel 模块 - AI 维护指南

> **当前状态**：Task 2A.1 已完成（domain 层基础类型）。后续 Task 2A.2-2A.19 + 2A.20-2A.23 将逐步构建完整模块。

## 模块概述

小说导入管道（Novel Import Pipeline）承载"一键成片"的核心流水线，从小说文本导入到视频生成完成。三档渐进式复杂度：

- **quick** (3步)：项目初始化 → 内容导入 → 剧本化 → 生成 → 完成
- **standard** (6步)：增加角色管理 + 场景管理
- **professional** (8步)：增加故事结构分析 + 节奏规划

## 子域风险等级

| 子域 | 风险 | 原因 | 状态 |
|------|------|------|------|
| domain | 🟢 低 | 仅类型定义（Task 2A.1），零外部依赖（仅依赖 @/domain/schemas/character） | ✅ 已完成 |
| tools | 🟡 中 | Novel Agent 工具（Task 2A.2，6个工具），调用 container.textProvider，JSON 解析容错 | ⏳ 待实施 |
| hooks | 🟡 中 | 管道状态管理 hooks（Task 2A.3-2A.9），Zustand store + 流转逻辑 | ⏳ 待实施 |
| presentation | 🟡 中 | 管道 UI（Task 2A.6 步骤指示器 + 上下文 AI 副驾驶） | ⏳ 待实施 |
| services | 🟡 中 | 故事结构分析（2A.13）+ 节奏规划（2A.14）+ 连续性账本（2A.18） | ⏳ 待实施 |

## 子域依赖图

```
domain/types.ts（Task 2A.1，零外部依赖）
  ↑
tools/*（Task 2A.2，调用 container.textProvider）
  ↑
hooks/*（Task 2A.3-2A.9，Zustand store + 流转）
  ↑
presentation/*（Task 2A.6，UI 组件）
  ↑
services/*（Task 2A.13/2A.14/2A.18，分析与规划）

跨模块依赖：
- @/modules/character（角色 CRUD）
- @/modules/scene（场景 CRUD）
- @/modules/storyboard（分镜管理）
- @/infrastructure/di（container.textProvider / videoProvider）
```

## 公共 API（当前）

### domain/types.ts 导出（15 个类型）

**基础实体类型**：
- `NovelSegment` — 小说分段（基础单元）
- `ExtractedCharacter` — 从小说提取的角色（未持久化）
- `ExtractedScene` — 从小说提取的场景（未持久化）
- `ShotBreakdown` — 分镜拆解（含 v5.4 QC 预留字段位）

**管道状态机类型**：
- `PipelineStage` — 管道阶段（10 个 stage，单向流动）
- `PipelineConfig` — 管道配置（含 v5.1 aiAssistLevel 三档模式）

**管道辅助类型**：
- `Segment` — 管道中的片段（NovelSegment 扩展）
- `CharacterVariant` / `SceneVariant` — 角色变体 / 场景变体（8 维参数向量）
- `CharacterInPipeline` / `SceneInPipeline` — 管道中的角色 / 场景（含变体）
- `SegmentPrompt` — 单片段合成 Prompt（v5.1 分层式：core + enhanced + style）
- `GenerationResult` — 单片段生成结果

**管道状态 & 项目持久化**：
- `PipelineState` — 管道状态（持久化到 SQLite）
- `NovelProject` — 小说导入项目

## 关键不变量（contract.json）

1. `PipelineState.stage` 单向流动：`project_init → done`（不可回退，子步骤可重做）
2. `PipelineState.step` 在 stage 内从 1 递增，跨 stage 时重置为 1
3. v5.1: `structure_analysis` / `pacing_planning` 在 quick/standard 可跳过，professional 必经
4. v5.1: `aiAssistLevel` 决定 `STAGE_ORDER` 子集（`getStagesForMode` 函数）
5. v5.1: 上游 stage 产出变化时，必须通过 `stalenessTracker` 标记下游为 stale（Task 2A.17）
6. `ExtractedCharacter.status === "matched"` 时必须设置 `matchedCharacterId`
7. `ExtractedScene.status === "matched"` 时必须设置 `matchedSceneId`
8. 角色/场景采用三级匹配（精确→模糊→向量）
9. 变体用 8 维参数向量描述（timeOfDay/weather/lighting/mood/crowdLevel/cameraAngle/season/colorPalette）
10. Prompt 合成升级为分层式（v5.1）：核心层 + 增强层 + 风格层

## 未来扩展预留

| Task | 字段 | 说明 |
|------|------|------|
| Task 2A.6 | `Segment.shots?: ShotBreakdown[]` | 剧本化阶段填充 |
| Task 2A.17 | `Segment.staleness?: "fresh" \| "stale" \| "dirty"` | 过期标记机制 |
| Task 2A.23 | `ShotBreakdown.shotStrategy?` / `ShotBreakdown.qcReport?` | 一致性 QC 闭环（v5.4，类型定义见 domain/qc-schema.ts） |
| Phase 4.6 | CharacterVariant / SceneVariant | 接入故事时间线变体系统 |

## 与其他模块的协作

- **@/modules/character**：角色 CRUD（match-entities 工具匹配现有角色库）
- **@/modules/scene**：场景 CRUD（match-entities 工具匹配现有场景库）
- **@/modules/storyboard**：分镜管理（剧本化阶段产出 ShotBreakdown → StoryBeat）
- **@/modules/agent-tools-workflow/subworkflow-novel-tools.ts**：已有 `auto_create_from_novel` 工具，是 pipeline 的简化版（一键模式）
- **@/infrastructure/di**：`container.textProvider`（AI 文本生成）、`container.videoProvider`（视频生成）

## 实施进度（Phase 2A）

- [x] Task 2A.1：Domain 类型定义 ✅
- [ ] Task 2A.2：Novel Agent 工具 6个
- [ ] Task 2A.3-2A.9：管道状态管理 + UI
- [ ] Task 2A.10-2A.12：角色变体 + Element Binding + 一致性强化
- [ ] Task 2A.13-2A.16：故事结构分析 + 节奏规划 + 概览视图 + 三档模式
- [ ] Task 2A.17-2A.19：功能联动 + 连续性账本 + 工作流增强
- [ ] Task 2A.20-2A.23（v5.4）：Seedance 2.5 + 3D 白盒 + 局部重绘 + 一致性 QC
