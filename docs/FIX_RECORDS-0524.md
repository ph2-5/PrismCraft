# AI Animation Studio - 修复记录

## Critical 级修复

### C-1 storage/core — registerColumns 旧列名不匹配

**问题**：`registerColumns` 注册旧列名（`appearance_json`、`tags_json`、`personality_json`、`traits_json`、`colors_json`、`elements_json`、`camera_json`、`generation_params` 等），DB schema 使用新列名（`appearance`、`generation`、`config`、`meta`、`atmosphere`）。`parseRecordWithTable` 按注册的列名做 JSON 解析，旧列名在 DB 中不存在，JSON 列数据返回为字符串而非对象。

**影响**：角色/场景/节拍的 JSON 容器字段（外观、生成配置、摄像机参数等）在前端解析为字符串而非对象，导致访问 `record.appearance.hairColor` 等属性时 undefined。

**修复**：修改 `src/infrastructure/storage/core.ts`，将所有旧列名注册替换为 DB schema 中的新列名：

- `characters`: 移除 `appearance_json`/`personality_json`/`traits_json`/`tags_json`/`outfits_json`/`accessories_json`/`generation_params`，添加 `appearance`/`generation`/`config`/`meta`
- `scenes`: 移除 `tags_json`/`colors_json`/`elements_json`/`camera_json`/`element_bindings_json`/`generation_params`，添加 `appearance`/`atmosphere`/`generation`/`config`
- `story_beats`: 移除 `generation_params`/`character_outfits_json`/`enhanced_generation`/`shots_json`，添加 `camera`/`generation`/`meta`
- `stories`: 移除 `character_ids`，添加 `keyframe_chain_valid`
- `story_elements`: 移除 `character_config_json`/`scene_config_json`/`reference_image_quality_json`/`bindings`/`bindings_json`/`metadata`/`parameters`，保留 `binding_config`
- `character_outfits`: 移除 `character_outfits`/`character_outfits_json`

---

### C-2 storage/stories — bound_beat_id 列不存在

**问题**：SQL 引用 `bound_beat_id` 列，该列在 DB schema 的 `story_beats` 表中不存在。

**影响**：故事保存含节拍时事务回滚，节拍数据丢失。

**修复**：修改 `src/infrastructure/storage/stories.ts`，将 `bound_beat_id` 替换为 `WHERE bound_to_type = 'beat' AND bound_to_id IN (...)`。

---

### C-3 storage/characters — character_ids 列名错误

**问题**：SQL 引用 `character_ids` 列，DB schema 中为 `character_ids_json`。

**影响**：角色删除时 beat 清理失败，已删除角色的 ID 残留在节拍中。

**修复**：修改 `src/infrastructure/storage/characters.ts` 和 `src/modules/persistence/services/transactional-delete.ts`，将 `character_ids` 替换为 `character_ids_json`。

---

### C-4 shared/BeforeUnloadGuard — 未阻止页面关闭

**问题**：`handleBeforeUnload` 仅 `return` 不调用 `e.preventDefault()`，浏览器不会弹出离开确认。

**影响**：用户关闭窗口/刷新页面时未保存数据直接丢失，无任何提示。

**修复**：修改 `src/shared/presentation/BeforeUnloadGuard.tsx`：

```typescript
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = '';
};
```

---

### C-5 video/task-management — 轮询引擎永久停止

**问题**：轮询引擎 `pollingState.isPollingScheduled` 标志在某些错误路径下未正确重置，导致轮询在第一个周期后永久停止。

**影响**：视频任务状态永远停留在 pending/generating，用户无法获取生成结果。

**修复**：修改 `src/modules/video/task-management/hooks/internals/polling-engine.ts`：

1. 将 `isPollingScheduled` 重置逻辑移到 `finally` 块，使用 `shouldReschedule` 标志确保正确重置
2. 添加 AbortController 集成，轮询引擎持有 AbortController 实例，组件卸载时调用 abort() 取消所有进行中的请求，共 6 个 abort 检查点

---

### C-6 infrastructure/database — repository 层使用旧平面列名

**问题**：`character-repository.ts`、`scene-repository.ts`、`story-repository.ts` 仍使用旧平面列名（如 `avatar_path`、`thumbnail_path`、`shot_type`、`camera_angle` 等），与 DB schema 的 JSON 容器列不兼容。

**影响**：通过 repository 层的 CRUD 操作写入错误列名，数据丢失或查询返回空值。

**修复**：

- `character-repository.ts`：读取侧使用 `parseRecord(row, "characters")` 后提取嵌套字段；写入侧将字段组装为 JSON 容器对象，用 `JSON.stringify()` 序列化；更新侧采用 read-merge-writeback 模式
- `scene-repository.ts`：同上，适配 `appearance`/`atmosphere`/`generation`/`config` 容器
- `story-repository.ts`：同上，适配 `camera`/`generation`/`meta` 容器，修复 `character_ids` → `character_ids_json`

---

## High 级修复

### H-1 api-gateway — 插件异常未捕获

**问题**：`generateKeyframe`、`generateFramePair`、`generateVideo` 中插件 `buildXxxRequest` 抛异常时未 try-catch，导致 API Server 返回 500 无错误信息。

**影响**：用户看到"服务器错误"而非具体的"该提供商不支持XX"提示。

**修复**：

1. 修改 `electron/src/api-gateway.ts`，为 `buildVideoRequest`、`buildImageRequest` 调用添加 try-catch
2. catch 返回 `{ok: false, success: false, error: {code: "PLUGIN_ERROR", message: ...}, httpStatus: 500}`
3. 新增 `StructuredError` 接口和 `ApiResult` 类型（`electron/src/types/api.ts`）
4. 修改 `electron/src/storyboard-generation.ts`，新增 `formatApiError()` 辅助函数，更新 `ApiGateway` 接口 `error` 字段为 `ApiError` 类型
5. 修改 `electron/src/story-service.ts`，`TextGenerationResult.error` 从 `string` 更新为 `string | { code: string; message: string }`，修复 `throw new Error()` 对 StructuredError 的处理
6. 修改 `electron/src/visual-consistency-check.ts`，更新 `ApiGateway` 接口 `error` 字段类型

---

### H-2 story/generation — 生成 Hooks 未取消请求

**问题**：`useKeyframeGenerator`、`useFramePairGenerator`、`useVideoGenerator` 的 useEffect cleanup 中未调用 AbortController.abort()。

**影响**：组件卸载后生成请求继续执行，结果写入已卸载组件的 state，可能触发 React 警告或内存泄漏。

**修复**：

1. 修改 `src/modules/story/generation/hooks/useAIGeneratorBase.ts`：
   - 新增 `activeControllersRef`（Map<string, AbortController>）追踪活跃请求
   - useEffect cleanup 中 abort 所有活跃控制器
   - 新增 `abortGeneration(beatId?)` 方法
   - `withGenerationState` 传递 `signal: AbortSignal` 给内部函数
   - 同一 beatId 再次触发时自动 abort 旧请求
2. 修改 `useKeyframeGenerator.ts`、`useFramePairGenerator.ts`、`useVideoGenerator.ts`：接收 `signal` 参数，在 API 调用后检查 `signal.aborted`

---

### H-3 character/hooks — 角色删除无确认

**问题**：角色无引用时直接删除无确认对话框。

**影响**：误触删除按钮即永久丢失角色数据（虽有软删除，但 UI 无恢复入口）。

**修复**：修改 `src/modules/character/hooks/use-character-crud.ts`，添加 `confirm()` 对话框（使用 `import { confirm } from "@/shared/utils/confirm"`，`variant: "danger"`）。

---

### H-4 scene/hooks — 场景保存无防重入

**问题**：场景保存缺少 `isSaving` 防重入保护。

**影响**：快速双击保存按钮可能创建重复场景。

**修复**：

1. 修改 `src/modules/scene/hooks/use-scene-crud.ts`：添加 `isSaving` state，`if (isSaving) return` 守卫，`setIsSaving(true/false)` 在 finally 中重置
2. 修改 `src/app/scenes/page.tsx`：保存按钮添加 `disabled={isSaving}` 和 Loader2 图标

---

### H-5 video/cache — 缓存失败无重试

**问题**：`cacheVideoBlob` 失败后仅标记 `cacheFailed: true`，无重试机制。

**影响**：网络抖动导致缓存失败后，用户始终使用远端 URL 播放，体验差且 URL 可能过期。

**修复**：修改 `src/modules/video/task-management/hooks/internals/polling-engine.ts`，添加视频缓存重试机制（3 次重试，间隔 1s、2s、4s）。

---

### H-6 infrastructure/database — repository 列定义不一致

**问题**：三个 repository 文件使用 drizzle-orm 的关系映射，但列定义与 DB schema 的 JSON 容器模式不一致。

**影响**：repository 层和 storage 层对同一张表有两种不兼容的读写路径。

**修复**：由 C-6 修复覆盖。

---

## Medium 级修复

### M-1 scene/presentation — 保存按钮无 loading 状态

**问题**：场景保存按钮无 loading 状态，与角色页面体验不一致。

**修复**：由 H-4 修复覆盖，保存按钮添加 `disabled={isSaving}` 和 Loader2 图标。

---

### M-3 video/task-management — sendBeacon 不可靠

**问题**：`navigator.sendBeacon` 在 beforeunload 中发送任务状态，但某些浏览器限制 beacon 请求体大小。

**修复**：

1. 修改 `src/modules/video/task-management/hooks/use-video-task-manager.ts`：替换 `navigator.sendBeacon` 为同步 `XMLHttpRequest`，POST 到 `http://localhost:30100/video-tasks/bulk-save`
2. 修改 `electron/src/api-server.ts`：新增 `video-tasks/bulk-save` 端点，使用 `db.transaction()` 批量写入
3. 注册 recovery 和 cache 回调以解耦循环依赖

---

### M-4 security/ssrf-guard — DNS 缓存 TTL 过长

**问题**：DNS 缓存 TTL 60 秒，超过后仍需重新解析，存在 DNS 重绑定时间窗口。

**修复**：修改 `electron/src/security/ssrf-guard/ssrf-guard.ts`：

1. DNS 缓存 TTL 从 60000ms 降低到 10000ms
2. 修复 IPv6 ULA 检测：`/^fc00:/i` → 精确 `isIpv6Ula()` 方法（bitwise AND `0xfe00`）
3. 修复 IPv6 Link-Local 检测：`/^fe80:/i` → 精确 `isIpv6LinkLocal()` 方法（bitwise AND `0xffc0`）

---

### M-5 security/key-storage — 密钥派生可预测

**问题**：PlaintextFallback 密钥从 hostname+platform+arch+homedir 派生，可预测。

**修复**：修改 `electron/src/security/key-storage/strategies/plaintext-fallback.strategy.ts`：

1. 新增 `getMachineId()` 方法，3 层回退：node-machine-id → 持久化 UUID 文件 → userData 路径 SHA-256 哈希
2. `deriveKey()` 增加 `machineId` 作为额外因子
3. 密钥派生前缀从 `aas-fallback-v1` 升级到 `aas-fallback-v2`

---

### M-6 storage/core — registerColumns 新旧列名并存

**问题**：`registerColumns` 同时注册旧列名和新列名（如 `tags` + `tags_json`、`outfits` + `outfits_json`），增加维护混乱。

**修复**：由 C-1 修复覆盖。

---

### M-7 modules/video — 三角循环依赖

**问题**：video 模块内部存在三角循环依赖：task-management → cache → recovery → task-management。

**修复**：

1. 提取共享域类型到 `src/modules/video/domain/`（`task-machine.ts`、`task-schema.ts`、`task-events.ts`、`policies/`）
2. `task-management/domain/index.ts` 改为从 `@/modules/video/domain` re-export
3. `video-cache.ts` 新增 `registerRecoveryFn()` 回调注入，移除对 recovery 模块的直接导入
4. `video-recovery-service.ts` 新增 `registerCacheVideoBlobFn()` 回调注入，移除对 cache 和 TaskMachine 的直接导入

---

## Low 级修复

### L-1 全局 — 静默 catch 块

**问题**：约 100+ 处 catch 块仅做 `console.debug` 或空操作，未使用 errorLogger。

**影响**：生产环境错误无法追踪。

**修复**：约 50 处核心路径的空 catch 和 `console.debug` 已替换为 `errorLogger.warn/error`，涉及 27 个文件：

- `src/infrastructure/storage/`：characters.ts、stories.ts、scenes.ts、video-tasks.ts、collections.ts、storyboard.ts、templates.ts、versions.ts
- `src/infrastructure/storage/video-tasks/bulk-operations.ts`
- `src/infrastructure/storage/elements/commands.ts`
- `src/infrastructure/database/`：character-repository.ts、scene-repository.ts、story-repository.ts、media-asset-repository.ts、element-repository.ts
- 其他存储和网络层文件

---

### L-3 infrastructure/network — 熔断/重试拦截器未生效

**问题**：`circuit-breaker.interceptor.ts` 和 `retry.interceptor.ts` 未在 API Client 中实际使用。

**影响**：熔断和重试能力未生效。

**修复**：修改 `src/infrastructure/api/client.ts`：

1. 修复 retry interceptor 错误包装：HTTP 错误含 `statusCode` 时正确包装为 `ApiError` 而非 `NetworkError`
2. 新增 503 状态码映射到 `mapStatusToCode`

---

### L-4 modules/sync — 同步 UI 无开发中提示

**问题**：同步功能为预留状态，但 UI 组件已暴露 SyncSettingsPanel。

**影响**：用户可能误配置同步服务器导致困惑。

**修复**：修改 `src/modules/sync/presentation/SyncSettingsPanel.tsx`，添加琥珀色警告横幅："同步功能正在开发中，当前配置可能无法正常工作"。

---

## 其他修复

### ESLint 配置修复

**问题**：ESLint 配置引用 `react-hooks/purity` 和 `react-hooks/set-state-in-effect` 规则但插件未注册；`eslint-plugin-react` 不在项目根 `node_modules` 中导致全局规则报错。

**修复**：修改 `eslint.config.mjs`：

1. 移除不存在的 `react-hooks/purity` 和 `react-hooks/set-state-in-effect` 规则
2. 将 `ignores` 配置移到数组最前面（ESLint 9 扁平配置要求）
3. 将 `react/no-unescaped-entities` 规则限制到 `src/**/*.{ts,tsx}` 文件
4. 移除 `defineConfig` 包装，直接导出配置数组

### TypeScript 编译修复

**问题**：`electron/src/api-server.ts` 第 754 行 `db.transaction(() => {...})()` 多余的 `()` 调用导致 TS2571 错误。

**修复**：移除多余的 `()` 调用（`DatabaseInterface.transaction()` 内部已执行事务函数），简化 `task` 的类型断言。

---

## 第二轮修复

### M-2 shared/hooks — 快捷键未实现

**问题**：Sidebar 快捷键面板声明了 Ctrl+Z（撤销）和 Ctrl+Shift+Z（重做），但实际未实现按键处理。

**修复**：

1. 修改 `src/shared/presentation/Sidebar.tsx`：添加 Ctrl+Z 和 Ctrl+Shift+Z 按键处理，通过 `CustomEvent("app:undo")` 和 `CustomEvent("app:redo")` 分发
2. 新建 `src/shared/hooks/use-global-keyboard-actions.ts`：统一处理 `app:save`/`app:undo`/`app:redo` 三个全局事件，无撤销功能的页面显示 Toast 提示
3. 新建 `src/modules/feedback/hooks/use-undo-history.ts`：通用撤销历史栈 hook（最大深度 50），支持 `pushState`/`undo`/`redo`/`canUndo`/`canRedo`/`clear`
4. 修改 `src/app/characters/page.tsx`、`src/app/scenes/page.tsx`、`src/app/story/page.tsx`：将 `app:save` 手动监听替换为 `useGlobalKeyboardActions`，自动获得 undo/redo 事件支持
5. 更新 `src/modules/feedback/index.ts`：导出 `useUndoHistory`

---

### L-2 全局 — as any 类型断言

**问题**：生产代码中 2 个文件使用 `as any` 类型断言绕过类型检查。

**修复**：

1. 修改 `electron/src/db-interface.ts`：在 `DatabaseInterface` 基类中添加 `checkpoint()` 和 `backup()` 方法声明
2. 修改 `electron/src/database/db-connection.ts`：将 `(db as any).checkpoint()` 替换为 `db.checkpoint()`，将 `(db as any).backup()` 替换为 `db.backup()` + `as { close: () => void } | undefined` 类型断言
3. 修改 `electron/src/handlers/database.ts`：将 `(db as any).transaction()` 替换为 `db.transaction()`，将 `(db as any).checkpoint()` 替换为 `db.checkpoint()`

---

### L-5 electron/preload — IPC 全局速率限制

**问题**：IPC 速率限制仅按通道维度计数，攻击者可通过快速切换不同通道绕过单通道限制。

**修复**：修改 `electron/src/preload.ts`：

1. 新增 `GLOBAL_RATE_LIMIT`（600 次/分钟）和 `globalCallTimestamps` 全局时间戳数组
2. 在 `createSecureIpcInvoker` 中先检查全局速率限制，再检查通道限制
3. 成功通过限制后同时记录全局时间戳
4. 全局时间戳超过 `maxCalls * 2` 时自动清理
5. 清理定时器中同步清理全局时间戳

---

## 第三轮修复（2026-05-21）：6 阶段全面修复

> 范围：全项目 bug 检查、逻辑隐患分析、反人类设计修复

### 总览

| 阶段 | 子域 | 严重问题数 | 状态 |
|------|------|-----------|------|
| 1 | 删除废功能 | 3 | ✅ 完成 |
| 2 | Integrity 完整性 | 8 | ✅ 完成 |
| 3 | Security 安全 | 5 | ✅ 完成 |
| 4 | Persistence 持久化 | 7 | ✅ 完成 |
| 5 | Feedback 反馈 | 4 | ✅ 完成 |
| 6 | Experience 体验 | 5 | ✅ 完成 |
| 7 | 构建修复 | 2 | ✅ 完成 |

### 阶段1：删除废功能

| 文件 | 原因 |
|------|------|
| `src/app/settings/personal/page.tsx` | 6 个 Tab 中 3 个废功能，合并到 /settings |
| `src/shared/presentation/GlobalSettings.tsx` | 3 个设置项中 2 个完全不生效 |
| `src/infrastructure/secure-storage.ts` | 自造 AES-256-GCM 伪安全，等于没加密 |

### 阶段2：Integrity 完整性

| 新建文件 | 内容 |
|----------|------|
| `integrity/services/sql-sanitizer.ts` | `sanitizeIdentifier()` + `sanitizeTable()` + `buildSafeInsert/Update/Delete()` |
| `integrity/services/schema-registry.ts` | `registerColumn()` / `registerColumns()` / `getColumnKind()` 等 |
| `integrity/hooks/use-stable-deps.ts` | `useStableDeps(obj)` — JSON 序列化对比 |
| `integrity/index.ts` | 桶导出文件 |

### 阶段3：Security 安全

| 新建文件 | 内容 |
|----------|------|
| `electron/src/handlers/secure-config.ts` | 5 个 IPC handler，使用 `keyStorage` 单例 |
| `security/hooks/use-secure-config.ts` | `useSecureConfig()` hook |
| `security/index.ts` | 桶导出文件 |

### 阶段4：Persistence 持久化

| 新建文件 | 内容 |
|----------|------|
| `persistence/hooks/use-persistence-guard.ts` | 保存互斥锁 + pending 积压处理 |
| `persistence/services/transactional-delete.ts` | 级联删除+文件清理 |
| `persistence/hooks/use-auto-save.ts` | 可配置间隔 + 互斥锁 |
| `persistence/index.ts` | 桶导出文件 |

### 阶段5：Feedback 反馈

| 新建文件 | 内容 |
|----------|------|
| `feedback/hooks/use-dirty-tracker.ts` | `useDirtyTracker(current, saved)` |
| `feedback/hooks/use-undo-action.ts` | `useUndoAction()` |
| `feedback/presentation/DirtyIndicator.tsx` | 脏标记组件 |
| `feedback/index.ts` | 桶导出文件 |

### 阶段6：Experience 体验

- 设置页重写为 4 Tab 结构
- ThemeSwitcher 收起模式
- 场景页 shadcn Select 替换原生 select
- AssetPicker 添加确认步骤

### 阶段7：构建修复

- `use-stable-deps.ts` 的 `"use client"` 污染问题
- `package.json` 截断导致打包失败（从 git 恢复）
- 打包验证通过，生成 NSIS 安装包 + 便携版
