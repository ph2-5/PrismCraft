---
name: prismcraft-architecture-map
description: PrismCraft 项目架构速查与模块地图。当需要理解代码结构、判断依赖方向、定位业务模块、或评估跨层改动影响时使用。包含六层架构、43 模块约定、双网关真相、shared-logic 复用规则与构建链。
agent_created: true
---

# PrismCraft 架构速查与模块地图

## 一、六层架构（依赖方向由 lint:arch 强制）

```
app(页面) → modules(43 业务模块) → shared/shared-logic → infrastructure(DI/存储/AI)
domain(纯类型+Zod+Port) ← 所有层可依赖，domain 零依赖
```

- `domain/ports` 全是纯 interface；`shared-logic/` 零外部依赖、主/渲染进程双向复用
- 违规 import 会被 `npm run lint:arch` / CI 拦截

## 二、模块命名约定（重要，防误判）

- **单数目录**（`character`/`scene`/`shot`）= 业务逻辑模块
- **复数目录**（`characters`/`scenes`）= 页面型模块
- 二者是不同职责，不是重复

## 三、双网关真相（防重复误判）

`electron/src/route-groups/*`（HTTP 契约层，9 文件）→ **调用** `api-gateway*.ts`（能力层，8 文件 barrel）
是**分层依赖**，不是平行重叠。判定"重叠"必须看 import 引用方向，勿凭目录相似下结论。

## 四、关键模块地图

| 模块 | 职责 | 核心文件 |
|---|---|---|
| storyboard | 分镜编排（画布/时间线/生成链路） | `src/modules/storyboard/` |
| video | 任务状态机 + 轮询引擎 | `task-management/hooks/internals/polling-engine.ts` |
| shot | 参考图策略/一致性检查 | `src/modules/shot/` |
| agent | LLM 工具循环（agent-loop.ts） | `src/modules/agent/services/` |
| novel | 小说导入 10 阶段状态机 | `import/services/pipeline-machine.ts` |
| workflow | 节点化工作流（executor 注册表） | `modules/workflow/services/workflow-executor.ts` |
| sync | 多设备同步（vector clock） | `modules/sync/engine/` |
| shared-logic/director | 导演规则（纯函数） | `shared-logic/director/director-rules.ts` |
| shared-logic/quality-gate | 模型无关质检层（P0 已落地） | `shared-logic/quality-gate/` |

主进程能力层：`electron/src/api-gateway*.ts`（text/image/video/av + retry + SSRF），按 ≤500 行拆分。

## 五、核心设计模式

1. **模型能力适配**：`getVideoGenerationStrategy(modelId)` → 5 策略 + `resolveDeliveryMode` 自动升降级
2. **确定性兜底**：LLM 输出被规则（导演）、校验（shot-breakdown）、手动通道（FALLBACK_STRATEGIES）约束
3. **失败即预期**：降级链、透传兜底、重试/回退语义区分
4. **JSON container + 乐观锁**：易变字段存 JSON 列；`version` 字段防覆盖

## 六、构建链

- `npm run build:electron` → `build-electron.ps1`（**跨平台：路径用正斜杠**，mac/linux 已验证）
- Windows 打包：`build:win`（build:electron → electron-rebuild → electron-builder）
- `npm run validate` = typecheck×3 + lint + lint:arch + 契约 + 测试 + quality:badges

## 七、改动前的安全检查清单

- 改 `src/modules/*` 前查 `MODULE.md` + `contract.json`，契约变更需同步
- 改 UI 前注意：9868 测试大量 DOM 结构断言（data-testid/placeholder/类名），UI 重做=测试大面积失效
- 改主进程路由：`route-groups/*.ts` 的 `defineRoute` + Zod schema 是契约边界
- 新增跨层调用前跑 `npm run lint:arch`
- **git 安全**：本机曾发生对象库事故（lint-staged 卡死损坏 .git/objects），改动务必及时提交 + push 远程备份；commit 时若 lint-staged 卡死用 `--no-verify`（typecheck/arch 单独验证）
