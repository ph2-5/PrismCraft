# 更新日志

本项目所有重要变更均会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 暂无

## [1.2.3] - 2026-07-12

### Security

- **Agent 全面安全审查与修复（P0 + P1）**：
  - **P0-1 插件 builtin-mirror 绕过确认**：`adaptTool()` 强制继承目标工具的 `dangerLevel` 和 `requiresConfirmation`，忽略插件声明的权限标记
  - **P0-2 Agent 可篡改审计日志**：新增 `isProtectedAgentPath()` 拒绝操作 `/agent/audit/`、`/agent/sessions/`、`/agent/tool-plugins/` 内部目录
  - **P0-3 子 Agent 超时形同虚设**：`timeoutController.signal` 正确传递给 `AgentLoop.callbacks.signal`，60 秒超时后立即中止 LLM 调用
  - **P0-4 delete_memory 无确认**：标记 `dangerLevel: destructive` + `requiresConfirmation: true`
  - **P0-5 merge_videos/compose_final_video 禁用确认**：改为 `dangerLevel: limited`
  - **P0-6 全局 catch-all 暴露异常**：新增 `sanitizeErrorMessage()` 脱敏 API key/Authorization header，截断 >500 字符消息
  - **P0-7 config/generation 错误透传**：不再透传原始 `result.message`，仅返回通用失败提示
  - **P0-8 批量操作无限制**：`maxItems` + 运行时 `Array.length` 双重校验（batch_create_video_tasks 最多 10、batch_generate 最多 20 等）
- **P1-a 审计日志读取接线**：barrel export（queryAuditLogs/getAuditStats/clearAuditLogs/clearAllAuditLogs）+ AuditLogPanel UI 面板（统计概览/Top 5 工具/筛选/列表/清除）
- **P1-b specialist 字段填充**：`AgentLoopConfig` 新增 `specialistName` 字段，子 Agent 工具调用的审计日志 `specialist` 字段填充专家名
- **P1-c 128 个工具 dangerLevel 标记补全**：所有工具按三级分类（safe 只读/limited 有副作用/destructive 不可逆）
- **P1-d 输入验证完善**：22 个工具文件的 JSON Schema 参数添加 maxLength/minimum/maximum 约束，LLM 在生成参数时即可看到限制

### Changed

- AgentPage 工具栏新增 ScrollText 图标按钮打开审计日志面板，面板切换重构为 `showOnly()` 辅助函数
- AgentSettingsPanel/SearchConfigSection 等面板的互斥切换逻辑统一化

### Documentation

- 更新 SECURITY.md：新增 7 个安全机制章节（权限分层/审计日志/错误脱敏/路径白名单/批量限制/输入验证/子 Agent 控制）
- 更新 src/modules/agent/MODULE.md：新增审计日志 API、三级权限分层、安全约束完整说明
- 更新 .ai/modules/agent.md：新增审计日志/dangerLevel/输入验证修改场景，补充边界约束

## [1.2.2] - 2026-07-11

### Fixed

- **SSRF 防护 DNS 回退修复**：`ssrf-guard` 的 `validateDns` 在 `dns.resolve4`/`dns.resolve6`（c-ares 库）返回空结果时，回退到 `dns.lookup`（系统 DNS via `getaddrinfo`），与 `fetch`/`http.request` 使用的解析方式一致。修复了在某些系统 DNS 配置下（c-ares 返回 `ECONNREFUSED`）所有公网 API 请求被误拦截为 "Cannot access private/internal URLs" 的问题。DNS rebinding 防护仍然有效——回退路径同样检查私有 IP (`d1814ae` 后修复)
- 重构 `validateDns` 提取 `checkIpsAndCache` / `handleDnsFailure` 辅助方法，消除 3 处重复的私有 IP 检查与缓存逻辑

### Changed

- Agent 架构深化完成（P0-P5 + UI 集成 + E2E 测试），17 个 commits 累计：
  - P0：LLMMessage 类型提升至 domain 层，`ITextProvider` 新增 `generateChat` 方法
  - P1：Provider 接口改为 messages 数组，自适应双路径（原生 function calling 优先）
  - P2：Agent 服务 DI 化（Port 接口 + 构造函数注入）
  - P3：精确 Token 估算（CJK 1.5 token/char，ASCII 0.25 token/char）+ ContextBudget 分配
  - P4：多 Agent 编排（`delegate_to_specialist` + 专家 Agent 管理面板）
  - P5：断点恢复（AgentLoop 状态持久化 + 重启恢复 + 中断会话恢复横幅）
  - E2E：12 场景覆盖 P0-P5 全链路（MockTextProvider + 真实 DeepSeek 冒烟验证）

## [1.2.1] - 2026-07-09

### Added

- Agent 助手支持切换大模型 (`52288f6`)

### Changed

- 合并重复回归规则 R7/R19、R16/R20、R14/R36，减少规则维护成本 (`f7dfa5d`)
- 引入 `MINUTE_MS` / `HOUR_MS` / `DAY_MS` 通用时间常量替换魔术数字 (`2882635`)
- 统一加载状态图标，提升视觉一致性 (`7b991e6`)
- 协议回退为 CC-BY-NC-4.0（参赛期间策略） (`70eaffc`)
- P3 硬编码颜色替换为语义 CSS 变量 / Tailwind 类 (`ceefc13`)

### Fixed

- 修复 `useVideoTasksPage` 的 `statusFilter` 不一致 bug，并扩展 R10/R156 规则覆盖 (`e54ccdb`)
- 解决 R131-R137 回归规则编号冲突 (`e03fe32`)
- 修复 P1 Bug 隐患、P1 无障碍（a11y）问题、P1 i18n 硬编码字符串以及 P2/P3 细节问题 (`d965286`)
- 修复 P0 Promise rejection 未处理问题与 P1 `setTimeout` 内存泄漏 (`694c9a1`)
- **工作流深度分析修复（25 个修复 + 5 轮代码审查）**：
  - **P0-1**：Agent 执行危险工具前未检查 `requiresConfirmation` 标志，已添加确认回调接口与执行前检查
  - **P0-2**：修复 R123 vm 沙箱 constructor 链逃逸漏洞（`{}.constructor.constructor('return process')()`）
  - **P0-3**：修复 LWW 同步对无 `updated_at` 的表 `0>=0` 恒真导致 remote 恒胜、本地修改被覆盖
  - **P1-1**：LLM 流式推理 `apiCallStream` 全链路传递 abort signal，支持用户中止推理
  - **P1-2**：智能恢复 `verifyVideoUrl` 死代码接入生产路径，视频 URL 失效可被识别
  - **P1-3**：`recoveryAttempts` 上限在所有失败路径递增（含转换失败），避免无限重试
  - **P1-4**：插件重载改为原子替换（先加新再删旧），消除重载期间 `select()` 空洞
  - **P1-5**：插件 `attemptRestart` 失败后设置 `disabled` 标志，`select()` 跳过 disabled 插件；新增不可逆 `disposed` 标志 5 处守卫，防止销毁后 spawn 孤儿进程
  - **P1-6**：多窗口同步通过 `BroadcastChannel` 跨窗口通知，窗口 A 持久化任务后窗口 B 可感知
  - **P2-1**：轮询并发上限（单轮 15 个 + 按 `lastPolledAt` 排序），100+ 任务不再卡顿数分钟
  - **P2-2**：sync 重试改为指数退避（2s→4s→8s，最多 3 次），瞬态 DB 错误后不再永久偏离
  - **P2-3**：插件 worker 60s 内存检查 + 150MB 阈值自动退出，防止长期运行内存泄漏
  - **审查修复**：5 轮代码审查修复 13 个问题，包括 dispose() 清理定时器、restarting 竞态回滚、`MANAGER_SHUT_DOWN_DURING_RESTART_BACKOFF` 错误识别、退避期间 shutdown 回归测试等

### Documentation

- 补写 R138-R150 回归规则文档 (`cdc2f90`)
- 追加工作流深度分析修复记录到 `.ai/session-notes.md`

### Security

- 清理公开仓库风险（P0） (`ffadd1e`)
- **P0-1**：Agent 工具执行前强制 `requiresConfirmation` 检查，防止未授权执行危险操作
- **P0-2**：修复 vm 沙箱 constructor 链逃逸漏洞，防止恶意插件 RCE

## [1.2.0] - 2026-07-04

### Added

- **AI Agent 助手完整版**：支持流式输出，配套文档全面更新 (`911d587`)

## [1.1.1]

### Added

- Phase 0 收尾：扩展 CSS Token 体系，新增微渐变背景 (`62ae833`)

[Unreleased]: https://github.com/ph2-5/PrismCraft/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.1
[1.2.0]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.0
[1.1.1]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.1.1
