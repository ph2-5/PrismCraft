# PrismCraft — 完整 API 参考手册

> 版本: 1.1.0 | 更新日期: 2026-07-07 | 架构: Electron + Vite + React + DDD

---

## 文档结构

本手册分为四个部分，按架构层级组织：

| 部分 | 文件 | 覆盖范围 | 预估导出数 |
|------|------|---------|-----------|
| 第一部分 | [API_REFERENCE_PART1.md](./API_REFERENCE_PART1.md) | 领域层 + 共享逻辑层 | ~250 |
| 第二部分 | [API_REFERENCE_PART2.md](./API_REFERENCE_PART2.md) | 9 个业务模块 | ~277 |
| 第三部分 | [API_REFERENCE_PART3.md](./API_REFERENCE_PART3.md) | 共享层 + 基础设施层 | ~450 |
| 第四部分 | [API_REFERENCE_PART4.md](./API_REFERENCE_PART4.md) | 应用层 + Electron 主进程 | ~210 |
| **合计** | | | **~1187** |

---

## 架构分层与依赖方向

```
app → modules → domain
              → shared-logic
              → shared
              → infrastructure/di (via container only)
infrastructure → domain, shared
shared-logic → NOTHING (pure logic, zero external dependencies)
shared → domain, infrastructure (proxy exports only)
domain → NOTHING (pure types)
```

> **注**: 文件操作应通过 `shared/file-http` 双轨层（HTTP+IPC），而非直接调用 `electronAPI`。该层自动探测 HTTP 可用性并回退到 IPC，提供 7 个公开函数：`writeFile`, `readFile`, `getFileInfo`, `getCacheDirectory`, `getDiskSpace`, `fileExists`, `deleteFile`。

---

## 快速查找索引

### 按功能查找

| 功能 | 所在部分 | 关键模块/文件 |
|------|---------|-------------|
| 故事创作与分镜规划 | 第二部分 | story/planning, story/generation |
| AI 图片生成 | 第三部分 | infrastructure/ai-providers/image |
| AI 视频生成 | 第三部分 | infrastructure/ai-providers/video |
| 视频任务管理 (CQRS) | 第二部分 | video/task-management |
| 角色管理 | 第二部分 | character |
| 场景管理 | 第二部分 | scene |
| 分镜系统 | 第二部分 | shot |
| 提示词生成 | 第二部分 | prompt |
| 数据同步 | 第二部分 | sync |
| 资产库 | 第二部分 | asset |
| 持久化守护 | 第二部分 | persistence |
| DI 容器 | 第三部分 | infrastructure/di |
| 存储 (SQLite) | 第三部分 | infrastructure/storage |
| 网络层 (熔断/重试) | 第三部分 | infrastructure/network |
| 插件系统 | 第四部分 | electron/plugins |
| API 路由与 Schema | 第四部分 | electron/api |
| IPC 安全桥接 | 第四部分 | electron/preload |
| 文件操作统一层 (HTTP+IPC 双轨) | 第三部分 | shared/file-http |
| 错误处理 | 第一部分 | domain/types/result |
| 事件总线 | 第三部分 | shared/event-bus |
| 国际化 | 第三部分 | shared/constants |

### 按类型查找

| 类型 | 所在部分 | 关键文件 |
|------|---------|---------|
| Zod Schema | 第一部分 | domain/schemas/* |
| 端口接口 | 第一部分 | domain/ports/* |
| Result 类型 | 第一部分 | domain/types/result.ts |
| React Hooks | 第二部分 | 各模块 hooks/ |
| React 组件 | 第二/三/四部分 | 各模块 presentation/, shared/presentation/ |
| Zustand Store | 第二部分 | video/task-management, shared/app-store |
| 纯函数 (shared-logic) | 第一部分 | shared-logic/* |
| API 请求 Schema | 第四部分 | electron/api/schemas.ts |
| IPC 类型 | 第四部分 | electron/preload.ts, shared/types/ipc.ts |
| 双轨通信工具 (HTTP+IPC) | 第三部分 | shared/file-http/index.ts |

---

## 导出统计

| 层 | 文件数 | 导出数 | 主要导出类型 |
|----|--------|--------|------------|
| domain | ~25 | ~250 | Schema, 接口, 类型, 纯函数 |
| shared-logic | ~11 | ~50 | 纯函数 |
| modules | ~180 | ~277 | Hooks, 组件, 服务, 类型 |
| shared | ~70 | ~200 | 工具函数, Hooks, UI 组件, 代理导出 |
| infrastructure | ~80 | ~250 | 服务类, 工具函数, 存储模块 |
| app | ~60 | ~60 | 页面组件, Hooks |
| electron/src | ~110 | ~150 | API 路由, 插件, 处理器, 类型 |
