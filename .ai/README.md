# AI 维护入口

> 本目录是 AI 代码助手的维护参考。**权威规则见 `.trae/rules/` 下的分层规则文件。**

## 文档结构

```
.ai/
├── README.md              ← 本文件（入口）
├── modules/               ← 11 个模块的详细维护指南
│   ├── agent.md
│   ├── asset.md
│   ├── character.md
│   ├── persistence.md
│   ├── prompt.md
│   ├── scene.md
│   ├── shot.md
│   ├── story.md
│   ├── sync.md
│   └── video.md
```

## 修改代码前的阅读顺序

1. **`.trae/rules/quick-start.md`**（Layer 0，必读）— 核心规则、关键路径、AI 工作流
2. **任务相关 Layer 1 规则**（按需加载）：
   - 新功能开发 / 重构 → `.trae/rules/architecture-rules.md`
   - Bug 修复 → `.trae/rules/regression-guard-automation.md` + 相关 `regression/` 子目录规则
   - 测试编写 → `.trae/rules/testing-rules.md`
3. **目标模块的 `MODULE.md`** — 模块概览、子域表、公共 API
4. **目标子域的 `contract.json`** — 不变量、依赖、公共 API
5. **`.ai/modules/{module}.md`** — 详细修改规则和子域依赖图

> 规则分层与防幻觉机制详见 `.trae/rules/ai-tool-integration.md`。

## 修改后的验证序列

```bash
npm run typecheck                                 # 类型安全（renderer）
npm run typecheck:electron                        # 类型安全（Electron 主进程）
npm run lint                                      # ESLint：导入限制 + 代码风格
npm run lint:arch                                 # DDD 违规 + contract.json 一致性
node scripts/check-architecture.mjs               # 架构校验（同 lint:arch）
node scripts/check-module-api-consistency.mjs     # MODULE.md ↔ index.ts 同步
```

## 人工文档

```
docs/
├── README.md                    文档索引
├── plugin-specification.md      插件规范
├── story-pipeline-design.md    故事创作流水线设计
├── architecture/                架构详细文档 + 图表
└── archive/                     历史文档归档
```
