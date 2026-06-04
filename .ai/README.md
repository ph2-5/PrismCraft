# AI 维护入口

> 本目录是 AI 代码助手的维护参考。**权威规则见 `.trae/rules/project_rules.md`。**

## 文档结构

```
.ai/
├── README.md              ← 本文件（入口）
├── modules/               ← 11 个模块的详细维护指南
│   ├── asset.md
│   ├── character.md
│   ├── dependency-graph.md   模块间依赖关系图
│   ├── feedback.md
│   ├── persistence.md
│   ├── prompt.md
│   ├── scene.md
│   ├── security.md
│   ├── shot.md
│   ├── story.md
│   ├── sync.md
│   └── video.md
```

## 修改代码前的阅读顺序

1. **`.trae/rules/project_rules.md`** — 架构规则、依赖方向、DI 准则、AI 工作流（必读）
2. **目标模块的 `MODULE.md`** — 模块概览、子域表、公共 API
3. **目标子域的 `contract.json`** — 不变量、依赖、公共 API
4. **`.ai/modules/{module}.md`** — 详细修改规则和子域依赖图

## 修改后的验证序列

```bash
npx eslint .                                     # 导入限制 + 代码风格
node scripts/check-architecture.mjs               # DDD 违规 + contract.json 一致性
node scripts/check-module-api-consistency.mjs      # MODULE.md ↔ index.ts 同步
npx tsc --noEmit                                  # 类型安全
npx tsc -p electron/tsconfig.json --noEmit        # Electron 类型安全
```

## 人工文档

```
docs/
├── README.md                    文档索引
├── PROJECT_DOCUMENTATION.md     项目总文档（人读）
├── CHANGELOG.md                 修改记录
├── FIX_RECORDS.md               修复记录
├── TESTING.md                   测试指南
├── plugin-specification.md      插件规范
├── task-management-v2-design.md 设计文档
├── architecture/                架构详细文档 + 图表
└── 废弃/                        历史文档归档
```
