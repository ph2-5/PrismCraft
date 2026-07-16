# Agent Tools Shot Module

> 分镜生成工具集，从 `agent` 模块拆分而来。

<!-- AI: Before modifying this module, read contract.json for invariants -->

## 模块概览

| 项目 | 内容 |
|------|------|
| 模块路径 | `src/modules/agent-tools-shot/` |
| 来源 | 从 `src/modules/agent/tools/` 拆分 |
| 工具数量 | 5 个 |
| 依赖方向 | `@/domain/*`, `@/shared/*`, `@/infrastructure/di` |

## 背景

agent 模块拆分阶段：将分镜生成相关工具从 agent/tools 中独立出来，形成分镜工具集模块。

核心改造点：
- 通过 DI container 访问 `videoTaskStorage`
- 动态导入 storyboard/character/scene 服务

## 子域表

| 子域 | 文件 | 工具 | 说明 |
|------|------|------|------|
| shot-tools | shot-tools.ts | 5 | 分镜生成（generate_beat_keyframe / generate_beat_frame_pair / generate_beat_video / batch_generate / regenerate_beat） |

## Public API

通过 `@/modules/agent-tools-shot` 导入。

### 工具实现
- `generateBeatKeyframeTool` — 生成分镜关键帧工具（generate_beat_keyframe）
- `generateBeatFramePairTool` — 生成分镜帧对工具（generate_beat_frame_pair）
- `generateBeatVideoTool` — 生成分镜视频工具（generate_beat_video）
- `batchGenerateTool` — 批量生成工具（batch_generate）
- `regenerateBeatTool` — 重新生成分镜工具（regenerate_beat）

### 工具聚合数组
- `shotTools` — 5 个分镜工具的聚合数组
- `allShotTools` — 全量工具聚合（与 shotTools 等价，便于统一注册）

### 类型签名

```typescript
// shot-tools（5 个）
export {
  generateBeatKeyframeTool,
  generateBeatFramePairTool,
  generateBeatVideoTool,
  batchGenerateTool,
  regenerateBeatTool,
  shotTools,
} from "./shot-tools";

// 工具聚合数组
export { allShotTools } from "./index";
```

## 边界约束

- ✅ 允许导入：`@/domain/*`, `@/shared/*`, `@/infrastructure/di`
- ✅ 允许导入：同级模块内的相对路径（`./shot-tools`）
- ❌ 禁止导入：`@/modules/agent/*`（通过 DI container 异步获取 agent 服务）
- ❌ 禁止导入：`@/modules/*/*/*`（深路径）
- ❌ 禁止导入：`@/infrastructure/*`（除 `@/infrastructure/di`）
