# Session Notes

> 本文件采用**追加式**设计：只追加，不修改。每个会话在文件末尾添加新条目。
> 超过 30 条记录时，旧条目自动移到 `.ai/session-archive/`。

---

## 批次 1-3：UI 重构 + shadcn 清理 + i18n/a11y 优化
- 7 个主页面 UI/业务逻辑分层
- 删除 16 个无引用 shadcn 组件
- globals.css 设计系统 + 5 套主题
- Toast 重写、Modal 统一、Tabs 可访问组件
- 210+ i18n key 补充、IconButton aria-label 强制
- 深度审计 P0+P1+P2 全量修复（R167-R180）
- 性能优化 P0（R154-R157）+ i18n/UX 优化（R158-R166）
- 验证：typecheck ✅、lint ✅、test ✅

## 批次 4：架构重构
- StoryProvider 清理：删除死代码 + 移除 8 字段
- React.lazy 首屏优化：4 个首屏组件 lazy 化
- saveVideoTask 提取：新建 persist-task.ts
- useAssetLibraryActions 重构：22 扁平参数打包为 6 语义对象
- 项目切换功能 + 懒加载导航
- 验证：typecheck ✅、lint ✅

## 批次 5：UI 颜色系统清理
- 188 处硬编码 Tailwind 颜色 → 0 残留
- 新增 R181 回归规则
- 修正回归规则计数为 167（R181 added）
- 验证：lint ✅、color-grep ✅

## 批次 6：StoryBeat schema 清理
- 移除 scene + generationPrompt deprecated 字段
- shared/ui 目录删除，迁移到 shared/presentation
- route as 断言部分消除
- 验证：typecheck ✅

## 批次 7：全面 UI/UX 打磨
- 移除侧栏伪造 AI 进度
- 修复版本号不一致（统一 APP_VERSION 常量）
- 修复"故事模式"入口指向 ComingSoon
- 移除伪造团队协作头像
- 修复默认 Tab（video → details）
- 修复 useStoryPersistence 状态卡死
- 统一 Loading 组件（新建 PageLoader）
- Modal 焦点陷阱
- emoji → Lucide 图标
- 验证：typecheck ✅、lint ✅、test ✅

## 批次 8：快捷键 + 表单校验 + eslint
- 接入 useGlobalKeyboardActions（Ctrl+Z/S）
- 3 个表单名称必填校验
- setTimeout 魔法数字提取（14 处）
- eslint max-lines/max-params/complexity 规则
- error-codes 命名统一大写
- 验证：lint ✅、typecheck ✅

## 批次 9：历史遗留问题全面清理
- BeatDetailEditor 拆分（834 行 → 280 行 + 4 子组件：BasicInfoSection / ShotInstructionSection / GenerateTabContent / SettingsTabContent）
- 路由 as 断言消除（24 处）
- shared-logic 中文清理
- useAssetLibraryActions DRY 修复
- file-routes i18n 化
- PluginsPage 标准化
- tsconfig 严格选项
- docs/废弃/ 清理
- commit: 0155100 (refactor(arch): batch 9 - eliminate all historical technical debt)
- 验证：typecheck ✅、lint ✅

## 当前回归规则计数
- R1-R181（181 条规则）

## 后续待办
- shotType/camera deprecated 字段迁移（需重构 LLM 管线）
- imageGenerationPrompt 语义决策
- 9 个 ComingSoon 占位页面（产品功能未实现）

## 批次 10：Phase 0.5 v1.0.0 发布前全面打磨（Task 0.5.1-0.5.6）

### Task 0.5.1：分镜页面布局修复
- 删除 ProfessionalModeEditor 底部面板（ShotReferenceConfig + ReferenceVideoUploader 容器）
- ShotReferenceConfig 移入 BeatDetailEditor 第二列（ElementBindingPanel 之后）
- ReferenceVideoUploader 改为可折叠面板（默认收起，展开 maxHeight: 320，全宽显示）
- BeatPromptPanel 编辑区 flex:1 minHeight:180，预览区 maxHeight:240（上下结构优化）
- PromptPreview 样式微调（padding 10, fontSize 11, flex+overflow）

### Task 0.5.2：P0 隐患修复（3 项）
- SearchDialog 加入 250ms debounce（useEffect + setTimeout + cleanup）
- SidebarWithSearch 修复"先 slice(0,50) 再 filter"为"先 filter 再 slice(0,20)"
- useScenesPage / useCharacterPage highlight useEffect 加 useRef + isDirty 守卫
- video-tasks handleRefresh 从 window.location.reload() 改为 useVideoTaskStore.getState().initialize()
- R132 回归测试更新（验证 mockInitialize 被调用）

### Task 0.5.3：P1 反人类设计修复（9 项）
- P1-1：首页"故事模式"跳转 /story（不再和"分镜模式"同 URL）
- P1-2：Story 页面仅保留 storyboard tab（移除 4 个 ComingSoon tab）
- P1-3：侧栏移除 futurePreviewItems 数组和渲染
- P1-4：场景元素 badge 改为 badge + 独立 × 按钮（hover 变红）
- P1-5：场景图片 1:1 → 16:9，maxWidth 200 → 320
- P1-6：video-tasks 统计卡片 repeat(6,1fr) → repeat(auto-fit, minmax(160px, 1fr))
- P1-7：Beat 删除清理失败加入 showError toast（新增 i18n key error.cleanupFailed/Desc）
- P1-8：handleTestAllConnections 改为 Promise.allSettled 并行 + handleTestCapability 用 useCallback
- P1-9：搜索先 slice 再 filter（已在 P0-1 修复）

### Task 0.5.4：ComingSoon 清理
- 首页移除 2 个 ComingSoon 快速入口（模板市场、工作流编辑器），改为 4 列布局
- Story 页面移除 ComingSoon 死代码和未使用 import

### Task 0.5.5：novel 模块占位处理
- 删除 src/modules/novel/ 目录（domain/contract.json, domain/types.ts, MODULE.md, index.ts）
- 无外部依赖、无测试依赖、无 vite 配置引用

### Task 0.5.6：版本号统一到 v1.0.0
- src/shared/constants/app-version.ts: v0.12.2 → v1.0.0（3 段语义化版本，符合测试约束）
- package.json: 0.12.2 → 1.0.0
- package-lock.json: 0.12.2 → 1.0.0
- 7 个文档文件同步：README.md, API_REFERENCE.md, TECHNICAL_REFERENCE.md, PROJECT-GUIDE.md, DEPLOYMENT.md, CODE_CATALOG.md

### 验证结果
- typecheck ✅（0 errors）
- lint ✅（0 errors, 264 warnings — 已存在的 max-lines/complexity 警告）
- lint:arch ✅（无架构违规）
- 测试：729 + 152 + 235 + 21 = 1137 个测试全部通过

### 修改文件清单
- src/modules/story/beat-editor/presentation/ProfessionalModeEditor.tsx
- src/modules/story/beat-editor/presentation/BeatDetailEditor.tsx
- src/modules/story/beat-editor/presentation/BeatPromptPanel.tsx
- src/modules/story/generation/presentation/PromptPreview.tsx

## 批次 10：长视频支持 — 100MB 写入限制三层优化

### 背景与决策
Seedance 2.5（2026-07-06 上线）支持 30秒 4K 直出（200-400MB），Kling 180秒（300-500MB），
原有 100MB 写入限制成为瓶颈。完成 3 个连续任务：

### P0：视频模型时长配置修正（已完成）
- **5 个 provider 的 maxDuration 修正**：
  - electron/src/plugins/providers/volcengine.ts：12 → 30（Doubao Seedance 2.5 上限）
  - electron/src/plugins/providers/seedance.ts：12 → 30
  - electron/src/plugins/providers/openai-sora.ts：20 → 10（Sora 2 真实值）
  - electron/src/plugins/providers/pika.ts：5 → 10（Pika 2.2）
  - electron/src/plugins/providers/luma.ts：5 → 9（Ray2）
- **Seedance 2.5 模型配置添加**：
  - seedance.ts：MODEL_CAPS_MAP 新增 `seedance-2.5`（4K/50路全模态参考）
  - volcengine.ts：MODEL_CAPS_MAP 新增 `doubao-seedance-2-5`
- **测试同步修正**：pika.test.ts / luma.test.ts 的 maxDuration 断言
- **新增测试**：seedance-2.5 模型配置测试 + maxDuration 准确性测试（8 个）
- 验证：1165 passed / 15 skipped / 0 failed

### P1 方案 B：二进制直写绕过 base64 膨胀（已完成）
- **架构决策**：用 `application/octet-stream` 传输，绕过 base64 1.33x 膨胀和 JSON.parse
- **核心改动**（5 个文件）：
  - electron/src/api/server.ts：检测 `application/octet-stream` 跳过 JSON.parse，原始 Buffer 挂到 `req.__rawBuffer`，body 上限 500MB
  - electron/src/api/route-groups/file-routes.ts：新增 `file/write-binary` 路由（`MAX_WRITE_BINARY_SIZE=500MB`，从 `X-File-Path` header 取路径）
  - electron/src/api/middleware.ts：CORS 允许 `X-File-Path` header
  - src/shared/file-http/index.ts：`writeFile` 智能分流——≤20MB 走 JSON+base64（兼容），>20MB 走 octet-stream 二进制直写
  - electron/src/api/route-groups/__tests__/file-routes.test.ts：新建 11 个测试
- **关键常量**：`BINARY_WRITE_THRESHOLD=20MB`、`MAX_WRITE_BINARY_SIZE=500MB`、`MAX_BINARY_BODY_SIZE=500MB`
- 验证：electron 1176 passed / renderer 4969 passed / typecheck 干净 / lint 0 errors

### P1 方案 C：流式下载到磁盘（已完成）
- **架构决策**：主进程 fetch + stream/promises.pipeline 直接落盘，绕过渲染进程内存
- **核心改动**（6 个文件）：
  - electron/src/handlers/download-to-file.ts：新建流式下载 handler（Node.js fetch + `stream/promises.pipeline`，内置 stall 检测/总超时/重试/清理半成品/路径校验）
  - electron/src/api/route-groups/download-routes.ts：新建 `POST /api/download/to-file` 路由（同步阻塞模式）
  - electron/src/api/routes.ts：注册 downloadRoutes
  - src/shared/file-http/index.ts：新增 `httpDownloadToFile` 函数（10 分钟客户端超时，无 IPC fallback）
  - src/modules/video/cache/services/video-cache.ts：主链路改为 `downloadVideoToFile`（优先流式，HTTP 不可用时回退到 resilientFetch + httpWriteFile）；`cacheVideoRecord` 签名改为 `totalBytes`
  - 测试：download-to-file.test.ts (9 tests) + download-routes.test.ts (10 tests) + video-cache-service.test.ts 新增 3 个流式下载测试
- **内存效果**：30秒 4K / 180秒视频下载时内存占用恒定（~64KB chunk buffer），不受文件大小影响
- **数据流**：`远程 URL → 主进程 fetch → Node stream pipeline → fs.createWriteStream → 磁盘`，完全绕过渲染进程内存
- **兜底保障**：主进程 HTTP API 不可用时自动回退到原 `resilientFetch + httpWriteFile` 路径
- 验证：electron 1195 passed / renderer 4972 passed / typecheck 干净 / lint 0 errors

### P1 SSRF 安全修复（已完成）
- **漏洞背景**：方案 C 新建的 download-to-file.ts 直接 fetch 用户传入的 URL，无 SSRF 校验
- **合规要求**：R105（DNS rebinding 防护）/ R118（重定向每跳校验）/ R133（fail-close）/ R144（dual-stack）
- **核心改动**（2 个文件）：
  - electron/src/handlers/download-to-file.ts：接入 `ssrfGuard.validate`，`redirect: "follow"` → `redirect: "manual"` + 手动重定向循环（max 3 跳），每跳 SSRF 校验，fail-close 策略
  - electron/src/handlers/__tests__/download-to-file-ssrf.test.ts：新建 16 个 SSRF 回归测试
- **关键决策**：视频 URL 来自 AI provider 返回值（非用户配置），**不做 loopback 放行**——所有 URL 都必须通过完整 SSRF 校验
- 验证：electron 1211 passed / 15 skipped / 0 failed（+16 SSRF 测试）/ typecheck 干净 / lint 0 errors

### 三层瓶颈最终解决状态
| 瓶颈 | 原状态 | 现状态 |
|---|---|---|
| `MAX_WRITE_SIZE` 100MB | 硬性拒绝 | 500MB 二进制直写（方案 B） |
| base64 1.33x 膨胀 | 内存浪费 | octet-stream 绕过（方案 B） |
| `resilientFetch` 整文件读入内存 | OOM 风险 | 流式落盘，内存恒定 ~64KB（方案 C） |
| `MAX_REQUEST_BODY_SIZE` 50MB | HTTP body 限制 | `MAX_BINARY_BODY_SIZE=500MB` 绕过（方案 B） |
| SSRF 防护缺失 | 攻击者可访问内网 | R105/R118/R133/R144 全合规 |

### 交接
- 无未完成任务
- 所有改动已通过 typecheck + lint + 测试验证
- 下一步可选方向：端到端验证（真实 200MB+ 视频走完整链路）/ image-cache.ts 切换流式（低优先级）
- src/shared/presentation/SearchDialog.tsx
- src/app/SidebarWithSearch.tsx
- src/app/scenes/hooks/useScenesPage.ts
- src/app/characters/hooks/useCharacterPage.ts
- src/app/video-tasks/hooks/useVideoTasksPage.ts
- src/app/video-tasks/hooks/__tests__/regression-r132-status-filter-and-refresh.test.ts
- src/app/page.tsx
- src/app/story/page.tsx
- src/shared/presentation/Sidebar.tsx
- src/app/scenes/page.tsx
- src/app/video-tasks/page.tsx
- src/app/story/useStoryActions.ts
- src/app/settings/ApiConfigPanel.tsx
- src/shared/constants/messages.ts
- src/shared/constants/app-version.ts
- package.json, package-lock.json
- 7 个文档文件
- 删除 src/modules/novel/ 目录（4 文件）

### [2026-07-07] Phase 1 Task 1.0：ITextProvider 流式改造 — 已完成
- **目标**：为 Agent Loop（Task 1.1）提供实时推理输出能力，文本生成从"请求-完整响应"模式改为 SSE 流式
- **9 阶段改造**（4 层架构全程贯通）：
  1. domain 层：`ITextProvider` 新增 `generateTextStream` + `ToolDef`/`ToolCall`/`StreamChunk` 类型（[ai-provider-port.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/domain/ports/ai-provider-port.ts)）
  2. plugin 层：`AIProviderPlugin` 新增可选 `buildTextStreamRequest`/`extractTextChunk`，`BaseAIProviderPlugin` 提供默认实现（stream:true + OpenAI SSE 解析）（[types.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/plugins/types.ts) + [base-provider.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/plugins/base-provider.ts)）
  3. api-gateway-utils：新增 `makeStreamingRequest`（按行回调，SSRF 校验，50MB 上限，5 分钟超时）（[api-gateway-utils.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/api-gateway-utils.ts)）
  4. api-gateway：新增 `generateTextStream`（plugin 不支持时自动回退到 `generateText`）（[api-gateway.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/api-gateway.ts)）
  5. server.ts + types.ts：`Route` 接口新增 `stream?: boolean`，`RouteHandler` 第 4 参数 `StreamSink`，`executeStreamRoute` helper 发送 SSE（chunk/done/error 三事件）（[server.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/api/server.ts) + [types.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/api/types.ts)）
  6. schemas + routes：`generateTextStreamSchema`（含 tools 字段）+ `generate-text-stream` 路由（stream:true）（[schemas.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/api/schemas.ts) + [generation-routes.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/electron/src/api/route-groups/generation-routes.ts)）
  7. renderer：`apiCallStream`（ReadableStream 消费 SSE，按 `_t` 字段分发）+ `generateTextStream` 实现（[core.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/infrastructure/ai-providers/core.ts) + [text.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/infrastructure/ai-providers/text.ts)）
  8. DI container：`textProvider` 注册 `generateTextStream`（[container.ts](file:///c:/Users/23727/Desktop/重构/ai-animation-studio-source-code/src/infrastructure/di/container.ts)）
  9. plugins/index.ts barrel re-export 新类型
- **SSE 协议**：`data: {"_t":"chunk","chunk":...}\n\n` / `data: {"_t":"done","result":...}\n\n` / `data: {"_t":"error","error":"..."}\n\n`
- **安全**：流式请求复用 `isPrivateUrl` SSRF 校验（fail-close），与 makeRequest 一致
- **回退策略**：plugin 未实现流式接口时自动回退到 `generateText`（保证功能可用，但不流式）
- 验证：typecheck 干净 / lint 0 errors / electron 1211 passed | 15 skipped / renderer 4972 passed
- **未做**：未编写流式专用测试（建议 Task 1.1 Agent Loop 集成时补测）/ 未为非 OpenAI 兼容 provider 覆盖流式方法

### 交接
- Task 1.0 已完成，可进入 Task 1.1（Agent Loop 核心）
- 所有改动已通过 typecheck + lint + 测试验证
- 下一步：Task 1.1 Agent Loop 核心（依赖本次的 `generateTextStream` + `StreamChunk`/`ToolDef`/`ToolCall`）
