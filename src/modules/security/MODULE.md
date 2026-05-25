# Security Module

> ⚠️ **DEPRECATED**: 此模块当前无外部消费者（0 consumers）。计划在 v2.0 合并到 `@/shared/hooks/`。在此之前保持现有导出不变。

## 职责

API Key 安全存储、敏感配置管理。

---

## 子域结构

| 子域 | 路径 | 职责 |
|------|------|------|
| `hooks` | [hooks/](./hooks/) | useSecureConfig |

---

## 公共 API (index.ts)

- `useSecureConfig` — 安全配置管理 Hook

---

## 依赖

- `electronAPI` (IPC) — secure-config:save/load/resolve/delete/has 通道

---

## 约束

- 非 Electron 环境拒绝存储 API Key（不 fallback 到 localStorage）
- API Key 通过 electron-store 加密存储，前端仅通过 IPC 访问
- `secure-config:resolve` 通道需要 SECURE 权限级别
