# Phase 3-4：架构升级 + Agent 完整版

> **所属文档**：[development-plan.md 主文档](../development-plan.md)
> **涵盖范围**：Phase 3（架构升级）+ Phase 4（Agent 完整版 + 后处理工具链）
> **注**：Phase 3-4 Agent 完整版已实现（v1.2.0），本文档为设计阶段计划，实际实现请参见代码

---

## Phase 3：架构升级（测试 + 覆盖率）

> **依赖**：Phase 1 + Phase 2A/B 核心功能完成。

**本 Phase 完成后**：
- Storybook 可视化组件库可用
- Stryker mutation coverage > 85%
- 全项目覆盖率 > 80%
- 所有依赖精确锁定
- CI/CD 配置精简（tsconfig/ESLint 合并）

### Task 3.1：Storybook + Stryker + 覆盖率 + 锁依赖 + 配置精简

**📋 前置阅读**：
- `vite.config.ts` — Vite 配置
- `vitest.config.ts` — Vitest 阈值配置
- `tsconfig.json`, `tsconfig.test.json`, `electron/tsconfig.json` — tsconfig 现状

**📝 产出文件**：
- `.storybook/main.ts` — 新建
- `.storybook/preview.ts` — 新建
- `stryker.config.json` — 新建
- `vitest.config.ts` — 修改（阈值调整为 >80%）
- `package.json` — 修改（新增 scripts）
- tsconfig 合并

**🤖 执行指令**：

1. `npm install --save-dev @storybook/react @storybook/addon-essentials @storybook/builder-vite @stryker-mutator/core @stryker-mutator/vitest-runner`
2. 创建 `.storybook/` 目录，配置 Vite builder
3. 为首批 5 个核心 UI 组件写 Story（AgentPanel, ToolCallCard, AgentChat, SegmentList, EntityReviewPanel）
4. 配置 Stryker mutation testing
5. vitest 阈值调整为 `branches: 80, functions: 80, lines: 80, statements: 80`，按模块逐个加入
6. 运行 `npm install --save-exact` 锁定版本，检查 `check-native-modules.mjs`
7. 合并 tsconfig（如果 `tsconfig.test.json` 可通过 `references` 合并到 `tsconfig.json`）

**✅ Done 标准**：
- `npx storybook dev` 启动成功，5个Story正常渲染
- `npx stryker run` 无报错
- `npm run test:coverage` > 80% overall
- `node scripts/check-native-modules.mjs` 通过
- `npm run typecheck && npm run typecheck:electron && npm run typecheck:test` 全部通过

### Task 3.2：模型能力自适应优化（架构一致性 + 职责分层）

> **背景**：当前模型能力自适应完成度 80/100。核心机制完整，但存在双重能力系统不一致、过滤逻辑分散、Dead Code、默认值偏激进等问题。本 Task 目标是兑现"上层无需关心模型差异"的设计承诺。
>
> **依赖**：无（可独立于 Task 3.1 执行）
> **预估工期**：3-4 天

#### 问题诊断

| 维度 | 问题 | 影响 |
|------|------|------|
| 架构一致性 | 渲染层 `getModelCapabilities` 与主进程 `plugin.videoCapabilities` 无同步机制 | 理论上可能渲染层生成 lastFramePrompt 被主进程丢弃，浪费 token |
| 职责分层 | 过滤逻辑分散在 story-pipeline / useVideoGenerator / api-gateway 三处 | 违背"上层无需关心"承诺，新增调用方需重复实现过滤 |
| Dead Code | `adjustReferenceImages` / `getMaxReferences` / `getSupportedImageSizes` 三个导出函数仅测试调用 | 维护负担，给人"已实现"错觉实际未生效 |
| 默认值策略 | 未知模型默认支持所有能力（激进） | 浪费生成内容，依赖主进程兜底 |
| 代码质量 | 前缀匹配冗余检查、缺端到端一致性测试 | 可读性、可靠性 |

#### 📋 前置阅读

- `src/infrastructure/ai-providers/model-capabilities-utils.ts` — 核心实现（四层解析 + adjustReferenceImages）
- `src/infrastructure/ai-providers/model-capabilities-types.ts` — 类型定义
- `src/infrastructure/ai-providers/model-registry.ts` — BUILTIN_MODEL_CAPABILITIES 构建
- `src/infrastructure/ai-providers/model-parameter-profile.ts` — modelProfilesCache（插件运行时配置缓存）
- `electron/src/api-gateway.ts:176-220` — 主进程请求构造引擎（兜底过滤）
- `electron/src/plugins/base-provider.ts` — Plugin 抽象的 getModelCapabilities 接口
- `src/modules/video/generation/hooks/useVideoGenerator.ts:99-101` — 渲染层 strategy 调用
- `src/modules/video/generation/services/video-service.ts` — 纯传输层（不做能力适配）
- `src/modules/video/generation/services/beat-video-generator.ts:60-68` — 渲染层 strategy 调用
- `src/modules/story/generation/services/story-generation-pipeline.ts:110-112` — 渲染层 supportsLastFrame 调用

#### 📝 产出文件

**新建**：
- `src/infrastructure/ai-providers/__tests__/capability-consistency.test.ts` — 端到端一致性测试

**修改**：
- `electron/src/plugins/user-plugin-adapter.ts` — plugin 加载时推送 videoCapabilities 到 modelProfilesCache
- `electron/src/plugins/code-plugin-adapter.ts` — 同上
- `electron/src/api-gateway.ts` — 新增二次验证 + warning 日志
- `src/infrastructure/ai-providers/model-capabilities-utils.ts` — 默认值调整 + 冗余清理 + 新增 unknownModelStrategy
- `src/infrastructure/ai-providers/model-capabilities-types.ts` — 新增 UnknownModelStrategy 类型
- `src/modules/video/generation/services/video-service.ts` — 新增 getEffectiveVideoParams 函数
- `src/modules/video/generation/hooks/useVideoGenerator.ts` — 删除手动 strategy 判断，改用 video-service
- `src/modules/video/generation/services/beat-video-generator.ts` — 同上
- `src/modules/story/generation/services/story-generation-pipeline.ts` — 改用 getEffectiveVideoParams

#### 🤖 执行指令

##### Step 1：能力系统统一（架构一致性）

**目标**：消除渲染层与主进程的双系统不一致风险。

1. 在 `user-plugin-adapter.ts` 和 `code-plugin-adapter.ts` 的 plugin 加载流程中，把 `plugin.getVideoCapabilities()` 的结果推送到 `modelProfilesCache`：
   ```typescript
   // electron/src/plugins/user-plugin-adapter.ts
   import { setModelProfile } from "@/shared/model-capabilities";

   async function onLoad(plugin: UserPlugin) {
     // ... 现有加载逻辑
     const videoCaps = plugin.getVideoCapabilities?.() ?? null;
     if (videoCaps) {
       setModelProfile(plugin.id, { capabilities: videoCaps, source: "plugin" });
     }
   }
   ```

2. 在 `model-parameter-profile.ts` 中导出 `setModelProfile` 函数：
   ```typescript
   export function setModelProfile(modelId: string, profile: ModelProfile): void {
     modelProfilesCache[modelId] = profile.capabilities;
   }
   ```

3. 主进程通过 HTTP `/plugins/list` 暴露的 `modelProfilesCache` 即为 plugin 真实能力，渲染层 `getModelCapabilities` 第 1 层（plugin config）与主进程一致。

**验证**：`getModelCapabilities("kling-v2-master")` 返回值应与 `plugin.videoCapabilities` 一致。

##### Step 2：过滤逻辑下沉到 video-service（职责分层 + Dead Code 激活）

**目标**：让 story-pipeline 和 useVideoGenerator 不再需要主动查询 strategy。

1. 在 `video-service.ts` 新增 `getEffectiveVideoParams` 函数：
   ```typescript
   // src/modules/video/generation/services/video-service.ts
   import { adjustReferenceImages, getModelCapabilities } from "@/shared/model-capabilities";

   export interface VideoGenerationParams {
     modelId: string;
     prompt: string;
     firstFrameUrl?: string;
     lastFrameUrl?: string;
     characterRefs?: ReferenceImageItem[];
     sceneRef?: string;
     imageSize?: string;
   }

   export function getEffectiveVideoParams(params: VideoGenerationParams): VideoGenerationParams {
     const caps = getModelCapabilities(params.modelId);
     const adjusted = adjustReferenceImages(params.characterRefs ?? [], caps, "video");

     return {
       ...params,
       lastFrameUrl: caps.supportsLastFrame ? params.lastFrameUrl : undefined,
       characterRefs: adjusted.length > 0 ? adjusted : undefined,
       sceneRef: caps.supportsSceneRef ? params.sceneRef : undefined,
       imageSize: resolveImageSize(params.modelId, params.imageSize),
     };
   }
   ```

2. 修改 `video-service.ts` 的 `generateVideo` 函数，在内部调用 `getEffectiveVideoParams`：
   ```typescript
   export async function generateVideo(params: VideoGenerationParams) {
     const effective = getEffectiveVideoParams(params);
     // 使用 effective 发送请求
   }
   ```

3. 修改 `useVideoGenerator.ts`，删除手动 strategy 判断：
   ```typescript
   // 旧代码（删除）
   const strategy = getVideoGenerationStrategy(modelId);
   const effectiveCharacterRefs = strategy && !strategy.useCharacterRef
     ? undefined
     : (characterRefs.length > 0 ? characterRefs : undefined);
   const effectiveSceneRef = strategy && !strategy.useSceneRef ? undefined : sceneRef;

   // 新代码（简化）
   const effectiveParams = getEffectiveVideoParams({ modelId, prompt, firstFrameUrl, lastFrameUrl, characterRefs, sceneRef });
   await generateVideo(effectiveParams);
   ```

4. 修改 `beat-video-generator.ts`，同样删除手动 strategy 判断。

5. 修改 `story-generation-pipeline.ts`，改用 `getEffectiveVideoParams` 判断是否生成 lastFramePrompt：
   ```typescript
   // 旧代码
   const modelSupportsLastFrame = opts.videoModelId ? supportsLastFrame(opts.videoModelId) : true;
   if (!modelSupportsLastFrame) {
     for (const beat of beats) {
       if (beat.lastFramePrompt) beat.lastFramePrompt = undefined;
     }
   }

   // 新代码
   const effectiveParams = getEffectiveVideoParams({
     modelId: opts.videoModelId ?? "",
     prompt: "",
     lastFrameUrl: "probe", // 探测用
   });
   const modelSupportsLastFrame = effectiveParams.lastFrameUrl !== undefined;
   if (!modelSupportsLastFrame) {
     for (const beat of beats) {
       if (beat.lastFramePrompt) beat.lastFramePrompt = undefined;
     }
   }
   ```

**验证**：
- `adjustReferenceImages` 在生产代码中被调用（Dead Code 激活）
- `useVideoGenerator` 不再 import `getVideoGenerationStrategy`
- `story-generation-pipeline` 不再 import `supportsLastFrame`

##### Step 3：保守默认值策略调整（默认值策略）

**目标**：未知模型走更保守的默认值，避免浪费生成内容。

1. 在 `model-capabilities-types.ts` 新增类型：
   ```typescript
   export type UnknownModelStrategy = "conservative" | "aggressive";
   ```

2. 在 `model-capabilities-utils.ts` 修改默认值逻辑：
   ```typescript
   let unknownModelStrategy: UnknownModelStrategy = "conservative";

   export function setUnknownModelStrategy(strategy: UnknownModelStrategy) {
     unknownModelStrategy = strategy;
   }

   // 第 4 层：保守默认值
   const conservativeDefaults: ModelCapabilities = {
     maxReferences: 1,
     maxResolution: 1024,
     maxSizeMB: 5,
     supportsLastFrame: false,
     supportsCharacterRef: false,
     supportsSceneRef: false,
     // ... 其他字段保持
   };

   const aggressiveDefaults: ModelCapabilities = {
     maxReferences: 4,
     maxResolution: 2048,
     maxSizeMB: 10,
     supportsLastFrame: true,
     supportsCharacterRef: true,
     supportsSceneRef: true,
     // ... 旧行为
   };

   return unknownModelStrategy === "conservative" ? conservativeDefaults : aggressiveDefaults;
   ```

3. 在设置页提供 `unknownModelStrategy` 配置项（默认 conservative）。

**验证**：未知模型 `getModelCapabilities("unknown-model")` 返回 `supportsLastFrame: false`。

##### Step 4：api-gateway 防御性二次验证（防御性编程）

**目标**：主进程在 plugin 兜底之外，额外验证能力一致性。

1. 在 `api-gateway.ts` 的 `generateVideo` 处理流程中，加入二次验证：
   ```typescript
   const pluginCaps = plugin.videoCapabilities;
   const utilsCaps = getModelCapabilities(modelId); // 主进程也能调用

   if (pluginCaps.supportsLastFrame !== utilsCaps.supportsLastFrame) {
     logger.warn(
       `Capability mismatch for ${modelId}: plugin.supportsLastFrame=${pluginCaps.supportsLastFrame}, utils.supportsLastFrame=${utilsCaps.supportsLastFrame}. Using plugin value.`
     );
   }
   // 以 plugin.videoCapabilities 为准
   const effectiveLastFrame = pluginCaps.supportsLastFrame ? ... : undefined;
   ```

2. 记录不一致事件到 eventBus，供设置页展示可观测性信息。

**验证**：能力不一致时日志有 warning，且最终行为以 plugin.videoCapabilities 为准。

##### Step 5：端到端一致性测试（测试）

**目标**：验证渲染层与主进程返回值一致。

1. 新建 `src/infrastructure/ai-providers/__tests__/capability-consistency.test.ts`：
   ```typescript
   describe("Capability consistency between renderer and main", () => {
     const testModels = [
       "kling-v2-master", "kling-v1-6", "doubao-seedance-1-0",
       "veo-3-05", "runway-gen3", "cogvideox-5b",
       "pika-v2", "minimax-video", "unknown-model",
     ];

     for (const modelId of testModels) {
       it(`${modelId}: getModelCapabilities should match plugin.videoCapabilities after sync`, async () => {
         // 模拟 plugin 加载
         await loadPluginProfile(modelId);
         const utilsCaps = getModelCapabilities(modelId);
         const pluginCaps = await getPluginCapabilities(modelId);
         expect(utilsCaps).toEqual(pluginCaps);
       });
     }
   });
   ```

2. 覆盖 6 种参考图模式（`native_field` / `multimodal` / `ref_field` / `text_append` / `bake_into_first` / `none`）。

**验证**：所有测试用例通过，覆盖 9 个真实模型 + 1 个未知模型。

##### Step 6：代码清理（代码质量）

1. 删除 `model-capabilities-utils.ts:42-44` 的冗余 `modelId === key` 检查（第 2 层已做）。
2. 确认 `getMaxReferences` 和 `getSupportedImageSizes` 在 Step 2 后是否有调用方：
   - 如果 `getEffectiveVideoParams` 内部使用了，则 Dead Code 已激活
   - 如果仍未使用，删除这些函数（避免误导）

**验证**：
- `grep "modelId === key" model-capabilities-utils.ts` 返回 0 结果
- `grep "adjustReferenceImages" src/ --include="*.ts" --include="*.tsx"` 在生产代码中有调用方

#### ✅ Done 标准

**功能验证**：
- `npm run typecheck && npm run typecheck:electron && npm run typecheck:test` 全部通过
- `npm run test` 全部通过（含新增一致性测试）
- `npm run lint` 无新增 warning
- `npm run lint:arch` 无架构违规

**Dead Code 清理验证**：
- `adjustReferenceImages` 在生产代码中至少有 1 个调用方（video-service.ts）
- `getMaxReferences` / `getSupportedImageSizes` 要么有调用方，要么已删除

**职责分层验证**：
- `useVideoGenerator.ts` 不再 import `getVideoGenerationStrategy`
- `beat-video-generator.ts` 不再 import `getVideoGenerationStrategy`
- `story-generation-pipeline.ts` 不再 import `supportsLastFrame`

**架构一致性验证**：
- 新增的一致性测试覆盖 9 个真实模型 + 1 个未知模型
- 渲染层 `getModelCapabilities` 与 `plugin.videoCapabilities` 在 plugin 加载后一致

**默认值策略验证**：
- 未知模型 `getModelCapabilities("unknown-model")` 返回 `supportsLastFrame: false`（conservative 模式）
- 设置页可切换 `unknownModelStrategy` 为 aggressive（旧行为）

#### 风险与回滚

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Step 2 改动 video-service 影响所有视频生成 | 高 | 分阶段：先添加 `getEffectiveVideoParams` 并在 video-service 内部调用，验证无问题后再让上层删除手动过滤 |
| Step 3 保守默认值导致未知模型无法使用 lastFrame | 中 | 提供 `unknownModelStrategy` 配置项，用户可切换为 aggressive |
| Step 1 plugin 推送机制有 bug 导致缓存不一致 | 中 | Step 4 的 api-gateway 二次验证会发现并 warning |
| Step 2 story-pipeline 改用 getEffectiveVideoParams 后行为变化 | 中 | 保留 `supportsLastFrame` 函数导出，仅 story-pipeline 内部改用新接口 |

#### 验收检查清单

- [ ] Step 1: 能力系统统一 — plugin 加载后 modelProfilesCache 与 plugin.videoCapabilities 同步
- [ ] Step 2: 过滤逻辑下沉 — video-service 提供 getEffectiveVideoParams，上层不再手动过滤
- [ ] Step 3: 保守默认值 — 未知模型默认不支持 lastFrame/characterRefs/sceneRef
- [ ] Step 4: api-gateway 二次验证 — 能力不一致时 warning，以 plugin 为准
- [ ] Step 5: 一致性测试 — 9 个真实模型 + 1 个未知模型覆盖
- [ ] Step 6: 代码清理 — 冗余检查删除，Dead Code 激活或删除

---

## Phase 4：Agent 完整版 + 后处理工具链（P1）

> **依赖**：所有 Phase 1-3 完成。
> **状态**：✅ 已实现（v1.2.0，实际 130+ 工具，18 域）；✅ 安全审查完成（v1.2.3，P0+P1 全部修复）

**本 Phase 完成后**：
- Agent 含 18 个额外工具（10 生成类 + 8 素材/知识库类），加上 Phase 1 的 8 个基础工具，共计 26 个工具
- AI 助手从"系统管理员"升级为"全流程创作助手"：API 配置、创作决策、故障诊断、素材搜索、图片编辑、视频剪辑全覆盖
- 视频片段合成功能（FFmpeg 拼接 + 转场）
- 分镜对比视图（并列对比同一分镜的多个版本）
- 简单图片编辑（裁剪/调色/标注）
- 素材搜索（全局搜索角色/场景/道具/素材）
- Prompt 配方库 + Few-Shot 动态选择（根据项目类型自动匹配示例）
- 跨分镜一致性自动修复（检测到漂移后自动同步 featureTags）
- 整体 UI 体验打磨

### Task 4.S：Agent 全面安全审查与修复（v1.2.3 新增）

> **状态**：✅ 已完成（2026-07-12）
> **背景**：用户报告 5 个严重安全问题后，要求全面排查其他类似隐患

**修复内容**：

#### P0 级修复（8 项）
- **P0-1 插件 builtin-mirror 绕过确认**：`adaptTool()` 强制继承目标工具权限标记
- **P0-2 Agent 可篡改审计日志**：`isProtectedAgentPath()` 保护内部目录
- **P0-3 子 Agent 60s 超时形同虚设**：`timeoutController.signal` 正确传递
- **P0-4 delete_memory 无确认**：标记 destructive + requiresConfirmation
- **P0-5 merge_videos/compose_final_video 禁用确认**：改为 limited
- **P0-6 全局 catch-all 暴露异常**：`sanitizeErrorMessage()` 脱敏
- **P0-7 config/generation 错误透传**：不透传原始 result.message
- **P0-8 批量操作无限制**：maxItems + 运行时校验

#### P1 级修复（5 项）
- **P1-a 审计日志读取接线**：barrel export + AuditLogPanel UI 面板
- **P1-b specialist 字段填充**：AgentLoopConfig.specialistName 传递
- **P1-c 128 个工具 dangerLevel 补全**：三级分类（safe/limited/destructive）
- **P1-d 输入验证完善**：22 个文件 JSON Schema 添加 maxLength/minimum/maximum
- **P1-e 验证**：typecheck 0 errors，ESLint 0 errors，测试 933/939 通过（6 失败为前序遗留）

**详细文档**：参见 [SECURITY.md](../../SECURITY.md) 第 6-12 章节

### Task 4.1：增强 Agent 工具 — 生成类

**📋 前置阅读**：
- `electron/src/agent/tools/index.ts` — 注册模式
- `electron/src/agent/types.ts` — `ToolDef`, `ToolResult`
- `electron/src/agent/tools/search-characters.ts` — 参考实现模式

**📝 产出文件**：以下 10 个工具文件（均新建在 `electron/src/agent/tools/`）

| 工具 | 描述 | 输入 | 输出 |
|------|------|------|------|
| `create_character` | 创建角色并保存 | name, gender, style, description | characterId | **Yes** |
| `update_character` | 更新角色 | characterId, fields | success |
| `create_scene` | 创建场景 | name, type, description | sceneId |
| `create_story` | 新建故事 | title, description, genre | storyId |
| `list_video_models` | 列出可用的视频生成模型 | providerId? | models[] |
| `start_video_generation` | 提交视频生成任务 | prompt, modelId, duration, resolution | taskId |
| `check_task_status` | 查询任务状态 | taskId | status, progress |
| `retry_task` | 重试失败任务 | taskId | success |
| `cancel_task` | 取消任务 | taskId | success |
| `get_task_video` | 获取已完成任务的视频URL | taskId | videoUrl |

**🤖 执行指令**：每个工具按 Task 1.6/1.7 的 pattern 实现（ToolDef 对象 + handler 函数 + logger）。在 `tools/index.ts` 中新增 `registerGenerationTools()`，在 `main.ts` 初始化中调用。

**✅ Done 标准**：10个工具注册成功，handler 可独立调用。

---

### Task 4.2：增强 Agent 工具 — 素材 + 知识库

**📋 前置阅读**：
- `electron/src/agent/tools/index.ts`
- `src/infrastructure/storage/` — 素材存储结构

**📝 产出文件**：以下 8 个工具文件（均新建在 `electron/src/agent/tools/`）

| 工具 | 描述 | 需确认 |
|------|------|--------|
| `list_assets` | 列出素材库文件（分页、类型筛选） | No |
| `delete_asset` | 删除素材 | Yes |
| `get_story_stats` | 故事统计（分镜数、角色数、完成率） | No |
| `export_story` | 导出故事为 JSON | No |
| `import_story` | 从 JSON 导入故事 | Yes |
| `get_model_parameters` | 获取模型的推荐参数 | No |
| `list_templates` | 列出可用模板 | No |
| `apply_template` | 应用模板到故事 | Yes |

**🤖 执行指令**：同 Task 4.1 pattern。在 `tools/index.ts` 中新增 `registerAssetTools()`（8个工具）。

**✅ Done 标准**：agent tools 共计 26 个（Phase 1 基础 8 + Task 4.1 生成类 10 + Task 4.2 素材类 8），覆盖全应用功能。

---

### Task 4.3：视频片段合成

**📋 前置阅读**：
- `electron/src/services/video/` — 现有多机位布局
- 确认 FFmpeg 是否已集成到项目

**📝 产出文件**：
- `electron/src/services/video/video-composer.ts` — 新建
- `src/app/video-compose/page.tsx` — 新建
- `src/router.tsx` — 修改（新增 `/video-compose` 路由）

**🤖 执行指令**：
1. 通过 FFmpeg 合成多个视频片段为一个完整视频
2. 支持拖拽排序片段
3. 支持设置转场效果（fade/dissolve/wipe）
4. 导出为 MP4

**✅ Done 标准**：
- 选择 2+ 个视频片段 → 点击合成 → 输出 MP4 文件
- 拖拽改变片段顺序 → 重新渲染

---

### Task 4.4：分镜对比视图

**📋 前置阅读**：
- `src/modules/shot/` — 分镜模块结构
- `src/modules/story/beat-editor/` — 分镜编辑器布局
- `src/infrastructure/storage/video-tasks/` — 视频任务存储（获取多个版本的视频URL）

**📝 产出文件**：
- `src/modules/shot/shot-comparison/ShotCompareView.tsx` — 新建
- `src/modules/shot/shot-comparison/ComparePanel.tsx` — 新建（单侧对比面板）

**🤖 执行指令**：

核心功能：用户为同一分镜生成多个版本（视频/关键帧），需要对比选择最优版本。

**对比维度**：
1. **视频并排播放**：两版视频同步播放（点播放时两边同时播放，支持暂停/逐帧）
2. **关键帧并排**：两版关键帧图片并排显示，zoom in/out 同步
3. **提示词对比**：merged diff 显示两版提示词差异
4. **参数对比**：模型、时长、分辨率、风格等参数对比表

**交互流程**：
1. 用户在分镜编辑页选择"对比视图"
2. 左侧列表显示该分镜的所有生成版本（× 个版本）
3. 勾选 2 个版本 → 进入分屏对比
4. 对比面板显示：
   - 上半部分：视频/关键帧并排（可同步播放控制）
   - 下半部分：提示词 diff + 参数对比表
5. 用户点击"选用此版本" → 将该版本设为分镜正式版本，其余归档
6. 支持"保留两者"（将另一个版本标记为备选）

**Props 契约**：
| 组件 | Props | 说明 |
|------|-------|------|
| `ShotCompareView` | `{ shotId: string; versions: ShotVersion[]; onSelect: (versionId: string) => void; onArchive: (versionId: string) => void }` | 主对比视图 |
| `ComparePanel` | `{ side: "left"|"right"; version: ShotVersion; isSelected: boolean; onSelect: () => void }` | 单侧面板 |

**✅ Done 标准**：
- 选择 2 个版本 → 左右分屏显示 → 视频同步播放
- 提示词 diff 高亮显示差异
- 点击"选用" → 该版本设为分镜正式版本

---

### Task 4.5：简单图片编辑（Phase 4 内 Task）

> **注意**：此 Task 4.5 属于 Phase 4，与 [Phase 4.5 网页基础设施](./phase-web.md#phase-45网页基础设施) 编号相同但含义不同。引用时请加注"Phase 4 内"。

**📋 前置阅读**：`src/modules/asset/` 素材模块

**📝 产出文件**：
- `src/modules/asset/editor/services/image-editor.ts` — 新建
- `src/modules/asset/editor/presentation/image-editor-panel.tsx` — 新建
- `src/modules/asset/editor/index.ts` — 新建

**🤖 执行指令**：
1. 基础编辑：裁剪（自由比例 + 预设比例）、旋转（90°/180°/自定义）、亮度/对比度/饱和度滑块
2. 标注：在图片上添加文字、箭头、矩形框
3. 所有编辑操作在本地 Canvas 完成，不调用外部 API
4. 编辑结果可保存为新版本，不覆盖原图

**✅ Done 标准**：
- 裁剪/旋转/调色功能正常
- 标注功能正常
- 保存为新版本不覆盖原图

---

### Task 4.6：素材搜索

**📋 前置阅读**：
- `src/modules/character/`、`src/modules/scene/`、`src/modules/asset/` 各自的数据层
- Task 2A.8 道具库

**📝 产出文件**：
- `src/modules/search/services/global-search.ts` — 新建
- `src/modules/search/presentation/search-bar.tsx` — 新建
- `src/modules/search/index.ts` — 新建

**🤖 执行指令**：
1. 全局搜索框（`Ctrl+K` 快捷键），搜索范围：角色、场景、道具、素材、分镜、项目
2. 模糊搜索 + 标签搜索 + 类型筛选
3. 搜索结果卡片展示：名称 + 类型 + 缩略图 + 最近更新时间
4. 点击结果跳转到对应页面
5. Agent 工具 `search_assets` 调用此搜索接口

**✅ Done 标准**：
- Ctrl+K 唤起全局搜索
- 搜索所有类型内容
- 点击结果跳转正确
- Agent 可调用搜索工具

---

### Task 4.7：Prompt 配方库 + Few-Shot 动态选择

> **v5.3 增强**：配方库从静态数据升级为"Skill 调用"，每个配方对应一组 Skill 组合。增强详情见下方"Task 4.7 v5.3 增强"小节。

**📋 前置阅读**：
- `src/shared-logic/prompt/prompt-engine.ts` 提示词引擎
- `src/modules/prompt/` — 现有提示词模块
- `src/modules/shot/shot-generation/services/few-shot-builder.ts` Few-Shot 构建器

**📝 产出文件**：
- `src/modules/prompt/prompt-recipes/PromptRecipePanel.tsx` — 新建
- `src/modules/prompt/prompt-recipes/recipes.ts` — 新建（预设配方数据）
- `src/modules/shot/shot-generation/services/few-shot-builder.ts` — 修改

**🤖 执行指令**：
1. 配方库：预设 5 个配方（赛博朋克、日系动画、写实风景、水墨风格、电影质感），一键应用到分镜提示词。支持用户自定义配方。
2. Few-Shot 动态选择：根据项目类型（古装/现代/科幻/奇幻）自动选择对应的 Few-Shot 示例
3. 项目创建时允许用户选择项目类型，生成管道读取该设置

**✅ Done 标准**：
- 选择一个配方 → 点击"应用" → 分镜提示词更新
- 不同项目类型使用不同的 Few-Shot 示例
- 用户可自定义配方

---

#### Task 4.7 v5.3 增强：完整 Skill 体系（+3 天）

> **来源**：seedance-2.0 仓库（MIT 许可）的 14 个 Skill 体系。借鉴详情见 [seedance-integration-notes.md](../seedance-integration-notes.md)。
> **目标**：将 Task 1.4 v5.3 增强中的 4 个核心 Skill（interview/prompt/compress/troubleshoot）扩展为完整的 9 个 Skill 体系，覆盖所有视觉/镜头/音频维度。配方库从静态数据升级为"Skill 调用"。
> **依赖**：Task 1.4 v5.3 增强（4 个核心 Skill）必须先完成。

**📋 前置阅读**：
- Task 1.4 v5.3 增强产出的 `src/shared-logic/prompt/skills/`（4 个核心 Skill）
- seedance-2.0 `skills/seedance-camera/SKILL.md`、`skills/seedance-lighting/SKILL.md`、`skills/seedance-characters/SKILL.md`、`skills/seedance-style/SKILL.md`、`skills/seedance-vfx/SKILL.md`、`skills/seedance-audio/SKILL.md`

**📝 产出文件**（全部新建）：
```
src/shared-logic/prompt/skills/
├── camera-skill.ts           → 镜头/运动/景别专项（借鉴 seedance-camera）
├── lighting-skill.ts         → 光照/氛围专项（借鉴 seedance-lighting）
├── characters-skill.ts       → 角色一致性/多人 blocking（借鉴 seedance-characters）
├── style-skill.ts            → 视觉风格（无 IP 借用）（借鉴 seedance-style）
├── vfx-skill.ts              → 粒子/破坏/能量/天气（借鉴 seedance-vfx）
└── audio-skill.ts            → 对白/口型/音乐/环境（借鉴 seedance-audio）
src/shared-logic/prompt/vocabulary/
├── multilingual.ts           → 六语言电影词汇表（中/英/日/韩/西/俄）
└── model-name-map.ts         → 模型 ID 防混淆（Seedance 2.0 / V2 / Pro / fast 等区分）
src/modules/prompt/prompt-recipes/
└── recipe-skill-mapper.ts    → 配方 ↔ Skill 组合映射器
```

**🤖 执行指令**：

1. **camera-skill.ts**：镜头专项指令构建器
   - 景别：extreme_wide / wide / medium / close_up / extreme_close_up
   - 运动方式：static / pan / tilt / dolly / handheld / tracking / crane
   - 镜头参数：35mm / 85mm / 变焦 / 微距

2. **lighting-skill.ts**：光照专项指令构建器
   - 光照类型：natural / low_key / high_key / golden_hour / neon / mixed
   - 氛围关键词映射：温馨 → golden_hour，神秘 → low_key，活力 → high_key

3. **characters-skill.ts**：角色一致性指令构建器
   - 单人镜头：identity reference + 服装 + 发型 + 表情
   - 多人 blocking：站位关系 + 视线方向 + 互动动作
   - 角色冲突检测：避免同一镜头中两个角色穿相同服装

4. **style-skill.ts**：视觉风格指令构建器（无 IP 借用）
   - 风格关键词：赛博朋克 / 日系动画 / 写实 / 水墨 / 电影质感
   - 安全改写：避免直接借用 IP（"皮克斯风格" → "3D 动画渲染风格"）

5. **vfx-skill.ts**：特效指令构建器
   - 粒子：火焰 / 烟雾 / 魔法 / 雪 / 雨
   - 破坏：破碎 / 爆炸 / 崩塌
   - 能量：光束 / 闪电 / 能量场
   - 天气：晴 / 阴 / 雨 / 雪 / 雾

6. **audio-skill.ts**：音频指令构建器
   - 对白：语气 / 语速 / 情绪
   - 口型：对白时间轴 + 口型同步
   - 音乐：BGM 风格 + 节奏 + 情绪
   - 环境：背景音 / 氛围音

7. **multilingual.ts**：六语言电影词汇表
   - 每个视觉概念提供 6 种语言的标准表述
   - 跨语言混合 prompt 结构支持

8. **model-name-map.ts**：模型 ID 防混淆表
   - Seedance 2.0 / Seedance V2 / Seedance Pro / doubao-seedance-2-0-260128 / doubao-seedance-2-0-fast-260128 区分
   - 各模型能力差异标注

9. **recipe-skill-mapper.ts**：配方 → Skill 组合映射
   - 赛博朋克配方 → style-skill + lighting-skill(neon) + vfx-skill(粒子)
   - 日系动画配方 → style-skill + lighting-skill(high_key) + characters-skill
   - 写实风景配方 → style-skill + lighting-skill(golden_hour) + camera-skill(wide)

10. **集成到 PromptRecipePanel**：配方应用时，调用 recipe-skill-mapper 获取 Skill 组合，每个 Skill 构建对应指令片段，拼入最终 prompt

**✅ Done 标准**：
- 6 个新 Skill（camera/lighting/characters/style/vfx/audio）各自能独立构建指令片段
- 配方应用时正确调用对应 Skill 组合（赛博朋克 → style + lighting(neon) + vfx）
- 多语言词汇表覆盖 6 种语言的核心电影术语
- 模型 ID 防混淆表能正确区分 Seedance 2.0/V2/Pro/fast
- 单元测试：每个 Skill 至少 3 个测试用例 + recipe-skill-mapper 至少 5 个测试用例
- `npm run typecheck && npm run test -- src/shared-logic/prompt` 通过

---

### Task 4.8：跨分镜一致性自动修复

**📋 前置阅读**：
- `src/modules/shot/consistency-check/services/cross-shot-consistency-service.ts` 跨分镜一致性检查
- `src/modules/shot/element-binding/` 元素绑定模块

**📝 产出文件**：
- `src/modules/shot/consistency-check/services/cross-shot-auto-fix.ts` — 新建
- `src/modules/shot/consistency-check/services/__tests__/cross-shot-auto-fix.test.ts` — 新建

**🤖 执行指令**：
1. 调用 `checkCrossShotConsistency` 检测到漂移后，自动分析漂移原因
2. 如果漂移原因一致（如所有分镜的 featureTags 都改了但 referenceImageUrl 没变），标记为"可自动修复"
3. 自动修复：将一致的 featureTags 同步到所有分镜的 elementBinding
4. 不可自动修复的情况（如 referenceImageUrl 不一致）提示用户手动确认
5. 修复后自动重新运行一致性检查，确认漂移已消除

**✅ Done 标准**：
- featureTags 漂移自动修复成功
- referenceImageUrl 漂移提示用户确认
- 修复后一致性检查通过

---

### Task 4.9：整体 UI 体验打磨

**📋 前置阅读**：全部页面

**📝 产出文件**：各页面文件（修改）

**🤖 执行指令**：
1. 逐个页面过 devtools console，`700ms` 启动内点击无报错
2. Agent 历史消息搜索和导出
3. 键盘快捷键统一（`Ctrl+K` 全局搜索，`Ctrl+/` Agent面板，`Ctrl+B` 侧边栏）
4. 响应式适配（最小窗口 1024×768 不掉组件）
5. Loading skeleton 替换所有 spinner
6. 亮暗主题切换动画
7. 所有交互反馈（按钮 hover/active、Toast 进出动画、焦点环）
8. **侧边栏 AI 状态指示器**：在 Sidebar 底部添加实时 AI 生成状态面板（参考 `design-preview.html` Line 182-188），显示当前正在进行的 AI 任务（任务名 + 进度百分比），带脉冲动画。数据源：监听 `video:task-progress` 事件 + Agent 工具执行状态。
9. **空状态组件库**（v5.2 新增，基于 Kimi UI 评价 85/100）：统一的 `<EmptyState illustration / title / hint / action />` 组件，覆盖角色/场景/分镜/任务/资产 5 个列表的空状态。复用现有 Card/Button 组件，不引入新 UI 原语。
10. **微动效规范**（v5.2 新增）：定义 4 类动效并应用到全局：`fade-in`（页面进入 200ms）、`slide-up`（列表项进入 300ms stagger）、`scale-press`（按钮按压 scale-95）、`shimmer`（骨架屏背景）。优先 CSS @keyframes 实现，必要时引入 Framer Motion。
11. **加载骨架屏**（v5.2 新增）：长列表加载时显示 Skeleton（而非空白），覆盖角色卡/分镜卡/任务卡。使用现有 `cn()` 工具，不引入 shadcn/ui 的 Skeleton。
12. **错误状态插画**（v5.2 新增）：网络错误/API 失败时显示带插画的重试卡片（而非纯文字错误）。插画使用 SVG 内联，不引入新依赖。

**✅ Done 标准**：
- 全部页面无 console error
- 所有快捷键生效
- 最小窗口 1024×768 无组件溢出
- 亮暗主题切换流畅
- 侧边栏 AI 状态指示器实时显示生成进度
- 5 个核心列表均使用 EmptyState 组件
- 4 类微动效全局生效
- 长列表加载显示 Skeleton

---

### Task 4.10：Shot/SubShot 实体（单分镜多镜头）

> **来源**：豆包评审建议 — "Shot 实体：如果以后要做单分镜多镜头（SubShot），需要这层"（详见附录 I-10）。
> **问题**：当前一个 StoryBeat 对应一个镜头。专业创作中，一个分镜（叙事节拍）可能包含多个镜头切换（如：全景建立场景 → 中景对话 → 特写反应）。
> **方案**：在 StoryBeat 下新增 SubShot 子层，支持单分镜多镜头。保留现有 StoryBeat 作为叙事单位，新增 SubShot 作为镜头单位。

**📋 前置阅读**：
- `src/domain/schemas/story.ts` — `StoryBeat` 类型
- `src/modules/story/beat-editor/` — 现有分镜编辑器
- Task 2B.11 产出的 `ShotEditorLayout.tsx`

**📝 产出文件**：
- `src/domain/schemas/shot.ts` — 新建（SubShot 类型定义）
- `electron/src/database/db-schema.ts` — 修改（新增 `sub_shots` 表）
- `electron/src/database/migrations.ts` — 修改（新增 migration）
- `src/infrastructure/storage/shot/sub-shot-storage.ts` — 新建
- `src/modules/shot/sub-shot/services/sub-shot-crud.ts` — 新建
- `src/modules/shot/sub-shot/hooks/use-sub-shots.ts` — 新建
- `src/modules/shot/sub-shot/presentation/SubShotList.tsx` — 新建
- `src/modules/shot/sub-shot/index.ts` — 新建

**🤖 执行指令**：

```typescript
// domain/schemas/shot.ts
export const subShotSchema = z.object({
  id: z.string(),
  storyBeatId: z.string(),          // 所属分镜
  sequence: z.number(),              // 镜头顺序
  shotType: z.string(),              // 镜头类型（远景/中景/近景/特写）
  cameraMovement: z.string(),        // 摄像机运动
  cameraAngle: z.string(),           // 摄像机角度
  duration: z.number().min(1).max(30),
  description: z.string(),           // 镜头描述
  prompt: z.string().optional(),     // 此镜头独立 Prompt（可选）
  imageUrl: z.string().optional(),   // 此镜头生成图
  videoUrl: z.string().optional(),   // 此镜头生成视频
  transition: z.string().optional(), // 与下一镜头的转场
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SubShot = z.infer<typeof subShotSchema>;
```

**DB 表**：

```sql
CREATE TABLE IF NOT EXISTS sub_shots (
  id TEXT PRIMARY KEY,
  story_beat_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  shot_type TEXT,
  camera_movement TEXT,
  camera_angle TEXT,
  duration REAL DEFAULT 5,
  description TEXT,
  prompt TEXT,
  image_url TEXT,
  video_url TEXT,
  transition TEXT,
  ${BASE_COLUMNS},
  FOREIGN KEY (story_beat_id) REFERENCES story_beats(id) ON DELETE CASCADE
);
```

**UI 集成**：
- 在 Task 2B.11 的 `ShotEditorLayout` 右栏（预览栏）下方新增 SubShot 列表
- 每个 SubShot 显示：序号、镜头类型、时长、缩略图
- 支持添加/删除/排序 SubShot
- 生成视频时，可选择"按 SubShot 逐个生成 → 拼接"或"按 StoryBeat 整体生成"

**✅ Done 标准**：
- 一个 StoryBeat 可包含 1-N 个 SubShot
- SubShot 可独立生成图片/视频
- 多个 SubShot 视频可通过 Task 4.3 的视频合成功能拼接
- `npm run typecheck && npm run lint` 通过

---

### Task 4.11：Asset 独立资产表

> **来源**：豆包评审建议 — "Asset 实体：生成的图片、视频，应该有独立的资产表，而不是 URL 塞在各个地方"（详见附录 I-11）。
> **问题**：当前生成的图片/视频 URL 散落在 `StoryBeat.imageUrl`、`StoryBeat.videoReferenceUrl`、`SubShot.imageUrl`、`Character.generatedImage`、`CharacterVariant.imageUrl`、`SceneVariant.imageUrl` 等多个字段。无法统一管理、搜索、去重、清理。
> **方案**：新建 `assets` 独立资产表，所有生成/上传的图片/视频统一入库管理，其他表只引用 `assetId`。

**📋 前置阅读**：
- `electron/src/database/db-schema.ts` — 现有 `media_assets` 表（用户管理的资产库）
- `electron/src/database/db-schema.ts` — `image_cache` 表（系统缓存层）
- `src/domain/schemas/story.ts` — StoryBeat 中所有 imageUrl/videoUrl 字段

**📝 产出文件**：
- `src/domain/schemas/asset.ts` — 新建（统一 Asset 类型）
- `electron/src/database/db-schema.ts` — 修改（新增 `generation_assets` 表，区别于 `media_assets`）
- `electron/src/database/migrations.ts` — 修改（新增 migration）
- `src/infrastructure/storage/asset/asset-storage.ts` — 新建
- `src/modules/asset/generation-assets/services/asset-crud.ts` — 新建
- `src/modules/asset/generation-assets/hooks/use-generation-assets.ts` — 新建
- `src/modules/asset/generation-assets/presentation/AssetGallery.tsx` — 新建（生成资产画廊）
- `src/modules/asset/generation-assets/index.ts` — 新建

**🤖 执行指令**：

```typescript
// domain/schemas/asset.ts
export const assetTypeEnum = z.enum([
  "keyframe",           // 关键帧
  "first_frame",        // 首帧
  "last_frame",         // 尾帧
  "video",              // 生成视频
  "character_image",    // 角色图
  "scene_image",        // 场景图
  "variant_image",      // 变体图
  "compositor_result",  // 编译器合成图
  "uploaded",           // 用户上传
]);

export const generationAssetSchema = z.object({
  id: z.string(),
  type: assetTypeEnum,
  sourceType: z.enum(["ai_generated", "user_uploaded", "composited"]),
  url: z.string(),                  // 远程 URL（可能过期）
  localPath: z.string().optional(), // 本地缓存路径
  thumbnailPath: z.string().optional(),
  prompt: z.string().optional(),    // 生成时使用的 prompt
  modelId: z.string().optional(),   // 生成模型
  providerId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(), // 分辨率、时长、文件大小等
  // 关联信息（任一非空）
  storyBeatId: z.string().optional(),
  subShotId: z.string().optional(),
  characterId: z.string().optional(),
  characterVariantId: z.string().optional(),
  sceneId: z.string().optional(),
  sceneVariantId: z.string().optional(),
  projectId: z.string().optional(),
  createdAt: z.string(),
});

export type GenerationAsset = z.infer<typeof generationAssetSchema>;
```

**迁移策略**（渐进式，不破坏现有数据）：

1. **阶段 1**：新建 `generation_assets` 表 + 存储层 + CRUD
2. **阶段 2**：新生成的资产同时写入 `generation_assets` 表 + 现有字段（双写期）
3. **阶段 3**：读取优先从 `generation_assets` 表读，fallback 到现有字段
4. **阶段 4**：停止双写，旧表只读
5. **阶段 5**：归档旧 MediaAsset 表

**AssetGallery 组件**：
- 统一资产浏览器：按类型/项目/时间/模型筛选
- 缩略图网格 + 详情面板
- 支持搜索、批量删除、重新下载
- 显示资产被引用的位置（哪些 StoryBeat/SubShot/Character 在用）

**✅ Done 标准**：
- 新生成的图片/视频自动写入 `generation_assets` 表
- AssetGallery 可浏览所有生成资产
- 按类型/项目筛选正常
- 引用关系正确显示
- 批量删除未被引用的资产功能可用
- `npm run typecheck && npm run lint` 通过

---

### Task 4.12：IP 安全改写 + 误报修复（v5.3 新增，+4 天）

> **来源**：seedance-2.0 仓库（MIT 许可）的 `skills/seedance-copyright/SKILL.md` + `skills/seedance-filter/SKILL.md` 安全改写与误报修复机制。借鉴详情见 [seedance-integration-notes.md](../seedance-integration-notes.md)。
> **目标**：将 Task 1.4 v5.3 增强中的 ip-rewriter + antislop 完善为生产级安全系统。核心原则是"安全改写而非拒绝"——保留用户创意功能，替换不安全元素。同时支持跨分镜 IP 一致性（所有分镜的 IP 改写结果保持一致）和误报修复（澄清 benign context）。
> **依赖**：Task 1.4 v5.3 增强（ip-rewriter + antislop 基础版本）+ Task 4.8（跨分镜一致性自动修复）。

**📋 前置阅读**：
- Task 1.4 v5.3 增强产出的 `src/shared-logic/prompt/safety/ip-rewriter.ts` + `antislop.ts`
- Task 4.8 产出的 `src/modules/shot/consistency-check/services/cross-shot-auto-fix.ts`
- seedance-2.0 `skills/seedance-copyright/SKILL.md`、`skills/seedance-filter/SKILL.md`

**📝 产出文件**（部分新建，部分完善）：
```
src/shared-logic/prompt/safety/
├── ip-rewriter.ts                       → 完善：从基础版本升级为生产级
├── filter-repair.ts                     → 新建：误报修复（澄清 benign context）
├── ip-rewriter.test.ts                  → 新建：完整测试
└── filter-repair.test.ts                → 新建：完整测试
src/modules/shot/consistency-check/services/
└── cross-shot-safety-check.ts           → 新建：跨分镜 IP 改写一致性检查
src/modules/shot/consistency-check/services/__tests__/
└── cross-shot-safety-check.test.ts      → 新建：测试
```

**🤖 执行指令**：

1. **完善 ip-rewriter.ts**（从基础版本升级）：
   - 名人检测：扩展名人数据库（演员/歌手/政治家/运动员）
   - IP 检测：电影/动漫/游戏/品牌商标关键词
   - 安全改写规则：
     - "像钢铁侠" → "机械战甲超级英雄"（保留创意功能）
     - "皮克斯风格" → "3D 动画渲染风格"（保留视觉风格）
     - "漫威式" → "超级英雄电影式"（保留类型特征）
   - 改写置信度评分：高置信度（>0.9）自动改写，低置信度提示用户确认

2. **filter-repair.ts**（误报修复）：
   - 检测被误判为敏感的内容：
     - 医疗：手术 / 受伤 / 急救（应允许，非暴力）
     - 教育：历史事件 / 战争描述（应允许，非宣扬）
     - 新闻：灾难报道 / 社会事件（应允许，非渲染）
   - 修复策略：为被误判内容添加 benign context 注释
     - "手术" → "手术（医疗教育场景，非暴力内容）"
     - "战争" → "战争（历史教育描述，非宣扬）"

3. **cross-shot-safety-check.ts**（跨分镜 IP 一致性）：
   - 扫描所有分镜的 prompt
   - 检测同一 IP 在不同分镜的改写结果是否一致
   - 不一致时（如第 1 分镜"钢铁侠"改写为"机械战甲"，第 3 分镜改写为"科技英雄"）→ 警告并统一
   - 集成到 Task 4.8 的跨分镜一致性自动修复流程

4. **集成到生成管道**：
   - prompt 生成后，先经过 ip-rewriter → antislop → filter-repair → cross-shot-safety-check
   - 任一步骤发现问题都记录到生成日志
   - 用户可在"安全改写"面板查看所有改写记录

**✅ Done 标准**：
- "拍一个像钢铁侠的角色" → 改写为"机械战甲超级英雄"，保留创意功能
- "皮克斯风格动画" → 改写为"3D 动画渲染风格"
- 误报修复：医疗/教育/新闻类内容不被误判为敏感
- 跨分镜 IP 一致性：所有分镜的 IP 改写结果保持一致
- 改写置信度评分正常工作（高置信度自动改写，低置信度提示确认）
- 安全改写面板展示所有改写记录
- 单元测试：ip-rewriter 至少 15 个测试用例（3 类 IP × 5 场景）+ filter-repair 至少 10 个测试用例（5 类 benign context × 2 用例）+ cross-shot-safety-check 至少 8 个测试用例
- `npm run typecheck && npm run test -- src/shared-logic/prompt/safety src/modules/shot/consistency-check` 通过

---
