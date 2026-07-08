# 更新日志

本项目所有重要变更均会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本管理遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

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

### Documentation

- 补写 R138-R150 回归规则文档 (`cdc2f90`)

### Security

- 清理公开仓库风险（P0） (`ffadd1e`)

## [1.2.0] - 2026-07-04

### Added

- **AI Agent 助手完整版**：支持流式输出，配套文档全面更新 (`911d587`)

## [1.1.1]

### Added

- Phase 0 收尾：扩展 CSS Token 体系，新增微渐变背景 (`62ae833`)

[Unreleased]: https://github.com/ph2-5/PrismCraft/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.2.0
[1.1.1]: https://github.com/ph2-5/PrismCraft/releases/tag/v1.1.1
