# PrismCraft

> 本地优先的 AI 动画创作桌面应用，覆盖故事构思 → 角色设计 → 场景搭建 → 分镜编排 → AI 视频生成 → 导出成品的完整工作流。

[![Version](https://img.shields.io/badge/version-1.3.0-blue)](package.json)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)
[![Commercial License](https://img.shields.io/badge/commercial-license%20available-orange)](COMMERCIAL_LICENSE.md)
[![Tests](https://img.shields.io/badge/tests-6026%2B-brightgreen)](docs/DEVELOPMENT.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![Updated](https://img.shields.io/badge/updated-2026--07--14-green)]()

## 核心特性

- **本地优先**：所有数据存储在本地 SQLite 数据库，数据所有权归用户，无需联网即可管理项目
- **多模型统一接入**：原生集成 13+ 家 AI 视频/图像提供商（Kling、Pika、Runway、MiniMax、OpenAI、Luma 等），支持声明式 JSON 插件零代码扩展
- **完整工作流**：不是单一工具，是覆盖动画制作全流程的集成环境
- **元素绑定系统**：分镜与角色/场景/道具自动绑定，保持跨分镜视觉一致性
- **模型能力自适应**：自动处理首尾帧、参考图等模型差异，上层无需关心

## 快速开始

### 环境要求

- Node.js 20+
- npm 10+
- 操作系统：Windows 10+ / macOS 11+ / Linux

### 安装与运行

```bash
# 安装依赖（会自动 rebuild better-sqlite3 + 创建 @shared-logic junction）
npm install

# 启动开发模式（Vite 开发服务器）
npm run dev
```

### 构建发布包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 架构概览

项目采用 **DDD 六层架构**，依赖方向通过 ESLint 强制约束：

```
app/            → 页面组件和布局
  ↓
modules/        → 11 个业务模块（story/video/shot/character/scene/...）
  ↓
domain/         → 纯类型层，零依赖（Zod schemas + Port 接口）
shared-logic/   → 零外部依赖纯逻辑（可在主进程和渲染进程双向复用）
shared/         → 跨模块通用层（UI 组件、工具函数、常量）
infrastructure/ → 基础设施层（DI 容器、存储、AI 提供商）
electron/src/   → Electron 主进程（HTTP API + 数据库 + 插件 + 安全）
```

**关键设计**：
- **DI 容器**：模块通过 Port 接口解耦基础设施实现，支持测试替换
- **契约驱动**：每个子域有 `MODULE.md` + `contract.json` 定义 `publicAPI` 与 `invariants`
- **类型安全边界**：`defineRoute` + Zod schema 定义 Electron HTTP API 路由
- **AI 协作友好**：`shared-logic/` 零依赖，`.trae/rules/` 提供分层规则加载和防幻觉机制

## 开发命令

```bash
# 类型检查（渲染进程 + Electron 主进程 + 测试）
npm run typecheck
npm run typecheck:electron
npm run typecheck:test

# 代码规范
npm run lint              # ESLint 检查 src/
npm run lint:electron     # ESLint 检查 electron/src/
npm run lint:arch         # 架构依赖方向检查

# 测试
npm test                  # 单元测试（Vitest）
npm run test:coverage     # 覆盖率报告
npm run test:e2e          # E2E 测试（Playwright）
npm run test:electron     # Electron 主进程测试

# 一键质量门禁
npm run validate          # typecheck×3 + lint + lint:arch + 契约校验 + 测试
npm run validate:full     # validate + 覆盖率
```

## 文档导航

| 文档 | 说明 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构设计详解 |
| [docs/PROJECT-GUIDE.md](docs/PROJECT-GUIDE.md) | 项目完整指南 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发流程与规范 |
| [docs/TECHNICAL_REFERENCE.md](docs/TECHNICAL_REFERENCE.md) | 技术参考 |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | API 参考（4 部分） |
| [docs/plugin-specification.md](docs/plugin-specification.md) | 插件开发规范 |
| [docs/ports.md](docs/ports.md) | Port 接口清单 |
| [docs/di-tokens.md](docs/di-tokens.md) | DI Token 清单 |
| [.trae/rules/quick-start.md](.trae/rules/quick-start.md) | AI 维护快速入门 |
| [README_FOR_BUYER.md](README_FOR_BUYER.md) | 面向买家/投资者的产品说明 |

## 技术栈

| 技术 | 用途 |
|------|------|
| Electron 41 | 桌面应用框架（跨平台） |
| React 19 + Vite | UI 构建与框架 |
| TypeScript 6（strict） | 开发语言，零 `any` |
| Zustand + React Query | 状态管理（客户端 + 服务端状态分离） |
| Zod 4 | Schema 校验与类型推导 |
| better-sqlite3 | 本地 SQLite 数据库（WAL 模式） |
| Tailwind CSS 4 | 原子化 CSS |
| Vitest + Playwright | 单元测试 + E2E 测试 |

## 项目结构

```
prismcraft/
├── src/                    # 渲染端源代码
│   ├── domain/             # 纯类型层（Zod schemas + Port 接口）
│   ├── shared-logic/       # 零依赖纯逻辑（shot/prompt/video/story）
│   ├── shared/             # 跨模块通用层（UI 组件、工具、常量）
│   ├── infrastructure/     # 基础设施（DI 容器、存储、AI 提供商）
│   ├── modules/            # 11 个业务模块
│   └── app/                # 页面组件和布局
├── electron/src/           # 主进程源代码
│   ├── api/                # HTTP API 路由（defineRoute + Zod）
│   ├── database/           # SQLite Schema + 迁移
│   ├── plugins/            # AI 插件系统（13 个原生 + 声明式 + 沙箱）
│   └── security/           # SSRF 防护 + 密钥存储
├── docs/                   # 技术文档
├── .trae/rules/            # AI 维护规则（分层加载 + 回归守卫）
├── .ai/                    # AI 会话状态（session-notes + work-claims）
└── scripts/                # 架构检查与构建脚本
```

## 质量指标

| 指标 | 数值 |
|------|------|
| 单元测试 | 6026+ |
| E2E 测试 | 126 个（Electron 集成 + 页面加载） |
| 类型检查 | 严格模式，0 error |
| ESLint | 0 error |
| 架构扫描 | 通过（DDD 依赖方向） |
| 回归守卫 | 151 条规则，8 大类 |
| i18n 键 | 3076+ |

## 安全设计

- **API 密钥**：通过 electron-store 加密存储
- **SQL 安全**：参数化查询 + DDL 语句拦截 + 标识符白名单校验
- **IPC 权限**：5 级权限分级，速率限制，禁止模块层直接访问数据库
- **插件沙箱**：vm 沙箱 + 原型冻结 + 逃逸检测 + 进程隔离
- **网络防护**：SSRF guard 拦截云元数据端点

## 许可（双协议 Dual Licensing）

本项目采用**双协议模式**，由 [LICENSE](./LICENSE)（AGPL-3.0-only）与 [COMMERCIAL_LICENSE.md](./COMMERCIAL_LICENSE.md) 共同约束。

### AGPL-3.0-only（开源免费）

适用于个人学习、研究、教学、开源社区贡献、非商业性学术项目。

- ✅ **使用与修改**：可在 AGPL-3.0 条款下自由使用与修改
- ✅ **共享**：可复制分发
- ⚠️ **Copyleft 强约束**：任何修改或网络服务部署**必须以 AGPL-3.0 开源全部衍生代码**
- ❌ **不适合商业闭源场景**：企业法务通常不接受 AGPL 网络服务条款

详见 [GNU AGPL-3.0 全文](https://www.gnu.org/licenses/agpl-3.0.txt)。

### Commercial License（商业授权）

适用于闭源商业产品、SaaS 部署、企业内部生产环境、二次开发销售。

提供多种授权类型以满足不同场景：个人/小团队、企业、SaaS、永久买断。**定价根据使用场景灵活议定，不公开报价。**

详见 [COMMERCIAL_LICENSE.md](./COMMERCIAL_LICENSE.md) 了解授权类型、条款与购买流程。

### 为什么选择双协议

| 维度 | CC-BY-NC（旧） | AGPL + 商业授权（新） |
|------|---------------|---------------------|
| 法律成熟度 | CC 主要为创意作品，代码用 CC 罕见 | AGPL 专为软件设计，企业法务熟悉 |
| 商业压力 | NC 直接禁止商用，无引导购买路径 | AGPL 允许试用，但商业部署必须买授权 |
| 社区口碑 | NC 阻挡开源贡献 | AGPL 是 OSI 认证的开源协议 |
| 行业先例 | 少 | MongoDB/GitLab/Elastic/Redis 等都用此模式 |

### 联系咨询

- **GitHub Issues**：[ph2-5/PrismCraft/issues](https://github.com/ph2-5/PrismCraft/issues)（推荐，公开透明）
- **Trae 社区**：[@ph2.5](https://forum.trae.cn/u/ph2.5)（私信）

> 💡 **欢迎询价**：无论预算大小，都欢迎联系讨论。可根据具体使用场景灵活定价。
> 长期合作、教育机构、开源项目可享优惠。

## 商标免责声明

本项目名称 "PrismCraft" 及相关标识仅用于软件产品识别目的。本项目与以下实体无任何关联、 endorsement 或从属关系：

- 任何其他名为 "PrismCraft" 的游戏、软件或产品
- 任何第三方公司、组织或品牌

所有提及的第三方商标、服务标记、产品名称均归各自所有者所有，本项目不主张对这些标记的任何权利。AI 提供商名称（Kling、Pika、Runway、MiniMax、OpenAI、Luma 等）均为各自公司的商标。
