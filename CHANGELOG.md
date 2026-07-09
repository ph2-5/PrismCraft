# 更新日志

本项目所有重要变更均会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 暂无

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
