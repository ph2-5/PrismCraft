# 代码清理决策规范

> 本规范定义"删除未调用/疑似死代码"前的强制判断流程。
> 适用场景：发现未被生产代码调用的函数/模块/类型时的清理决策。
> **核心原则**：删除前必须先判断"死代码 vs 忘记接入的功能"，禁止机械删除。

---

## 一、触发场景

当通过以下方式发现"未被调用"的代码时，本规范生效：
- ESLint `no-unused-vars` / `no-unused-modules` 警告
- Grep 搜索发现某 export 无引用
- Code review 发现疑似死代码
- AI 工具分析报告指出"未实装"或"占位"

---

## 二、四步判断流程（强制）

### Step 1：判断是否有独立逻辑

```
被怀疑的函数/模块
  │
  ├── 函数体只有一行委托（return otherFn(...)）？
  │   ├── 是 → 倾向"死代码"，进入 Step 2
  │   └── 否 → 有独立业务逻辑，进入 Step 2（可能是"忘记接入"）
  │
  └── 是否接受参数但完全不用？
      ├── 是 → 倾向"死代码"（参数是误导）
      └── 否 → 进入 Step 2
```

### Step 2：搜索是否有同名/同功能替代

```
搜索同模块/相邻模块
  │
  ├── 存在同名函数（如 performXxx vs checkXxx）？
  │   ├── 是 → 倾向"死代码"（命名冲突的遗留）
  │   └── 否 → 进入 Step 3
  │
  └── 存在功能等价的其他实现？
      ├── 是 → 倾向"死代码"（已被替代）
      └── 否 → 进入 Step 3
```

### Step 3：判断是"死代码"还是"忘记接入的功能"

| 信号 | 死代码 | 忘记接入的功能 |
|------|--------|---------------|
| 函数体 | 纯委托/空实现/占位 | 有完整业务逻辑 |
| 参数使用 | 接受但忽略 | 全部使用 |
| 命名 | 与功能不匹配（误导命名） | 与功能匹配 |
| 同功能替代 | 存在 | 不存在 |
| 注释 | "TODO"/"临时"/"占位" | 无特殊注释 |
| 测试 | 只测委托关系 | 测独立行为 |

**判断结果**：
- 多数信号指向"死代码" → 执行 Step 4A（删除）
- 多数信号指向"忘记接入" → 执行 Step 4B（接入）
- 信号混合 → **暂停，向用户确认**

### Step 4A：删除死代码

1. 删除函数/模块实现
2. 删除对应的 export 声明
3. 更新 contract.json 的 publicAPI 声明
4. 更新 MODULE.md 的公共 API 列表
5. 更新 API_REFERENCE 文档
6. **处理测试**：
   - 测试只验证委托关系（result === expected）→ 删除测试
   - 测试验证独立行为 → 迁移到实际实现该行为的函数
7. 运行 `npm run typecheck && npm run lint:arch` 验证
8. 运行相关测试验证

### Step 4B：接入忘记接入的功能

1. 分析为什么未被调用（路由遗漏？Hook 未导出？）
2. 找到正确的接入点（调用方）
3. 接入并验证
4. 补充接入后的集成测试

---

## 三、测试处理决策树

```
被删除的函数有测试
  │
  ├── 测试内容是什么？
  │   ├── 只验证委托关系（result === otherFn()）→ 删除测试
  │   ├── 验证独立业务行为 → 评估迁移
  │   └── 验证副作用/集成 → 评估迁移
  │
  └── 如果迁移，迁移到哪？
      ├── 同功能替代函数 → 迁移到替代函数的测试文件
      └── 无替代函数 → 不迁移（功能本身不存在）
```

---

## 四、命名规范审查（防止误导命名）

删除死代码后，审查同模块的命名：

| 反模式 | 问题 | 修复 |
|--------|------|------|
| `performConsistencyCheck` 只做配置检查 | 名字暗示"一致性检查"，实际只查配置 | 改名 `performConfigCheck` 或删除 |
| `checkVisualConsistency` 不接受视觉输入 | 名字暗示"视觉"，实际只查文本 | 改名或补充视觉路径 |
| `generateXxx` 返回硬编码值 | 名字暗示"生成"，实际返回常量 | 改名 `getXxxDefault` 或实现真正生成 |

---

## 五、文档同步清单

删除死代码后，必须同步检查并更新：

- [ ] `src/modules/<module>/index.ts` — 移除 export
- [ ] `src/modules/<module>/MODULE.md` — 移除公共 API 条目
- [ ] `src/modules/<module>/<subdomain>/contract.json` — 移除 publicAPI 声明
- [ ] `docs/API_REFERENCE_PART*.md` — 移除函数文档
- [ ] `docs/PROJECT-GUIDE.md` — 检查是否引用
- [ ] `.ai/modules/*.md` — 检查 AI 维护指南是否引用

---

## 六、反例与正例

### 反例：机械删除（禁止）

```
发现 performConsistencyCheck 未被生产调用
  → 直接删除函数
  → 直接删除测试
  → commit "remove dead code"
```

问题：未判断是否"忘记接入"，可能误删未完成的功能。

### 正例：判断后删除

```
发现 performConsistencyCheck 未被生产调用
  → Step 1: 函数体只有一行委托（return performConfigCheck）
  → Step 2: 同模块有 checkVisualConsistency 提供真正视觉检查
  → Step 3: 接受 videoUrl 但忽略，命名误导，是死代码
  → Step 4A: 删除函数 + export + contract.json + MODULE.md + API_REFERENCE
  → 测试只验证委托关系，删除测试
  → typecheck + lint:arch + 相关测试验证
  → commit 说明判断依据
```

---

## 七、与现有规则的关系

- 本规范是 `architecture-rules.md` 的补充，专门处理"代码清理"场景
- 与 `regression-guard-automation.md` 配合：删除代码后评估是否需要新增回归守卫
- 与 `testing-rules.md` 配合：测试迁移决策遵循本规范的决策树
