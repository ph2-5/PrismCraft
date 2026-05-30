# Bug 审计报告

> 审计日期：2026-05-26
> 方法论：定向 Bug 审计方法论（三阶段工作流）
> 审计范围：全量审计（故事模块 + 视频任务模块）

---

## 一、审计概览

| 指标 | 数值 |
|------|------|
| 场景推演 | 8 个场景 |
| 待验证 | 6 个（2 个在阶段一排除） |
| 已证实 Bug | 5 个 |
| 已排除 | 1 个 |
| P1 Bug | 2 个 |
| P2 Bug | 3 个 |

---

## 二、已证实 Bug 详情

### Bug #1：视频生成中切换故事，URL 丢失（P1）

**用户场景**：用户在故事A提交了视频生成任务，切换到故事B查看，等故事A的视频生成完成后切回故事A，发现视频URL没有更新。

**触发路径**：
1. 用户在故事A点击"生成视频" → `use-video-task-manager.ts` 创建 VideoTask
2. 用户切换到故事B → `page.tsx:performSwitchStory(s)` 加载故事B的 beats
3. 视频生成完成 → `StoryProvider.tsx` 的 `updateVideoUrls` useEffect 触发
4. `beatsRef.current` 此时指向故事B的 beats → `buildVideoUrlUpdates` 将故事A的视频URL更新到故事B的 beats
5. 用户切回故事A → beats 从 `story.stories` 数组重新加载，但该数组中的故事A beats 从未被更新

**关键证据**：
- [page.tsx:184-192](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/app/story/page.tsx#L184-L192)：`performSwitchStory(s)` 使用 `s.beats` 来自启动时加载的 `story.stories` 数组
- [StoryProvider.tsx:292-351](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/app/story/StoryProvider.tsx#L292-L351)：`updateVideoUrls` useEffect 读取 `beatsRef.current`，不验证故事归属

**修复方向**：`updateVideoUrls` useEffect 中，在 `buildVideoUrlUpdates` 后过滤掉不属于当前故事的更新，或将视频URL更新直接写入数据库而非仅更新内存中的 beats。

---

### Bug #3：清除完成任务先清内存后异步删数据库（P1）

**用户场景**：用户点击"清除已完成任务"，应用立即从列表中移除了这些任务，但如果异步数据库删除失败，重启应用后这些任务会重新出现。

**触发路径**：
1. 用户点击"清除已完成任务" → `use-video-task-manager.ts:clearCompletedTasks` 调用
2. `setAllTasks(tasks.filter(...))` 立即从内存中移除已完成任务
3. `await deleteVideoTasksByStatus("completed")` 异步删除数据库记录
4. 如果步骤3失败 → 内存中已移除但数据库中仍存在 → 重启后任务重现

**关键证据**：
- [use-video-task-manager.ts:358-365](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/video/task-management/hooks/use-video-task-manager.ts#L358-L365)：先 `setAllTasks` 后 `await deleteVideoTasksByStatus`

**修复方向**：调换顺序，先 `await deleteVideoTasksByStatus` 成功后再 `setAllTasks`。

---

### Bug #4：删除 Beat 不清理 VideoTask 和缓存（P2）

**用户场景**：用户删除一个 beat，beat 从界面上消失了，但关联的视频生成任务仍在后台运行，缓存文件也未被清理。

**触发路径**：
1. 用户在 beat 上点击删除 → `useStoryState.ts:deleteBeat` 调用
2. `setBeats(beats.filter(b => b.id !== beatId))` 从内存中移除
3. 重新编号剩余 beats
4. 无任何 VideoTask 清理、缓存清理逻辑

**关键证据**：
- [useStoryState.ts:101-107](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/beat-editor/hooks/useStoryState.ts#L101-L107)：`deleteBeat` 仅 filter + 重新编号

**修复方向**：在 `deleteBeat` 中增加对关联 VideoTask 的取消和删除，以及缓存清理。

---

### Bug #7：AbortController 无法阻止已发送请求（P2）

**用户场景**：用户对一个 beat 连续点击"生成关键帧"，第一次请求已发送到 AI 服务端，第二次点击 abort 了第一次的 controller，但 AI 服务端已经收到请求并开始处理，最终产生两次计费。

**触发路径**：
1. 用户第一次点击 → `useAIGeneratorBase.ts:withGenerationState` 创建 AbortController
2. 用户第二次点击 → 检测到已有 controller → `controller.abort()` → 创建新 controller
3. 第一次请求的 HTTP 请求已发出 → abort 只阻止了响应读取 → AI 服务端仍处理并计费

**关键证据**：
- [useAIGeneratorBase.ts:124-135](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/generation/hooks/useAIGeneratorBase.ts#L124-L135)：检测到已有 controller 时 abort 旧 controller

**修复方向**：使用 Promise 去重模式替代 abort 模式——如果已有进行中的请求，直接返回该 Promise 而非 abort 后重新发起。

---

### Bug #8：删除故事不清理关联 VideoTask 和缓存（P2）

**用户场景**：用户删除一个故事，故事从列表中消失了，但关联的所有视频生成任务仍在后台运行，缓存文件也未被清理。

**触发路径**：
1. 用户点击删除故事 → `useStorySaver.ts:performDeleteStory` 调用
2. `storyService.delete(id)` → 仅保存版本备份 + `storyStorage.deleteStory(id)`
3. 从 React 状态中移除故事
4. 无 VideoTask 清理、缓存清理逻辑

**关键证据**：
- [useStorySaver.ts:90-105](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/planning/hooks/useStorySaver.ts#L90-L105)：`performDeleteStory` 仅调用 `storyService.delete` + 从状态移除
- [story-service.ts:55-67](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/modules/story/planning/services/story-service.ts#L55-L67)：`delete` 方法不清理关联资源

**修复方向**：在 `performDeleteStory` 或 `storyService.delete` 中增加对故事下所有 beat 关联的 VideoTask 取消/删除和缓存清理。

---

## 三、已排除场景

### 场景2：保存中关闭应用，数据丢失 — 已排除

**排除原因**：better-sqlite3 是同步数据库，IPC handler 中的 `db:run` 和 `db:transaction` 都是同步执行。当渲染进程发起 `db:run` IPC 调用时，主进程在 handler 返回前已完成写入。即使用户在保存期间关闭窗口，只要 IPC 调用已经发出，写入操作会在主进程 handler 中同步完成。

**反证证据**：
- [database.ts:243-258](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/handlers/database.ts#L243-L258)：`db:run` handler 同步执行 SQL
- [database.ts:261-299](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/handlers/database.ts#L261-L299)：`db:transaction` handler 同步执行事务
- [cleanup.ts:19-26](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/lifecycle/cleanup.ts#L19-L26)：关闭顺序先窗口后数据库

---

## 四、规则固化（回归防护）

> ⚠️ 这些规则是回归防护，不是发现工具。下一轮审计必须从使用场景重新出发。

### 可编码规则（已写入 `scripts/check-architecture.mjs`）

| 规则 | 检测方法 | 对应场景 |
|------|---------|---------|
| 内存先于持久化更新 | 扫描 async 函数中 setState 在 await DB 操作之前出现的模式 | Bug #3 |
| 删除无级联清理 | 扫描 delete/remove 函数体中无 VideoTask/cache 清理调用的模式 | Bug #4, #8 |

### CR 检查清单

- [ ] **R1**：异步操作中，setState 是否在 await 持久化操作之后？
- [ ] **R2**：删除实体（故事/beat/角色）时，是否级联清理了关联的 VideoTask 和缓存？
- [ ] **R3**：跨上下文的状态更新（如视频完成回调更新 beats），是否验证了实体归属？
- [ ] **R4**：重复请求是否使用 Promise 去重而非 AbortController abort？

### 架构规则（已写入 `project_rules.md`）

- **R1: Persist Before State Update** — 先持久化再更新内存状态
- **R2: Delete Must Cascade** — 删除实体必须级联清理关联资源
- **R3: Cross-Context State Updates Must Verify Ownership** — 跨上下文状态更新必须验证归属
- **R4: Deduplication Over Abort for In-Flight Requests** — 用 Promise 去重替代 abort

---

## 五、修复优先级建议

| 优先级 | Bug | 修复复杂度 | 影响范围 | 状态 |
|--------|-----|-----------|---------|------|
| P1 | #3 清除任务顺序 | 低（调换两行代码） | video-task-management | ✅ 已修复（2026-05-26 前） |
| P1 | #1 跨故事URL丢失 | 中（需修改 useEffect 逻辑） | StoryProvider + page | ✅ 已修复（2026-05-30） |
| P2 | #4 删除beat无级联 | 中（需增加清理调用） | StoryProvider + video store | ✅ 已修复（2026-05-30） |
| P2 | #8 删除故事无级联 | 中（需增加清理调用） | useStorySaver + video store | ✅ 已修复（2026-05-30） |
| P2 | #7 abort改去重 | 中（需重构请求模式） | useAIGeneratorBase | ✅ 已修复（2026-05-26 前） |

### 2026-05-30 修复摘要

- **Bug #1**：切换故事时通过 `switchToStory` 从数据库重载 beats；视频 URL 持久化后调用 `syncStoriesWithVideoUrls` 同步 `stories` 内存缓存。
- **Bug #4/#8**：新增 `removeTasksByBeatId` / `removeTasksByStoryId`，取消进行中的任务、清理 DB 与 Zustand 内存；删除 beat 时额外清理 `image_cache`。
