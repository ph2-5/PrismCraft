# 故事创作流水线设计文档

> 本文档记录 PrismCraft 故事创作流水线的完整设计理念、流程、数据模型和 UI 设计。
> 配套文档：
> - [`development-plan.md` 附录 H](./development-plan.md#附录-h故事创作流水线数据模型) — 数据模型定义
> - [`design-preview.html`](../design-preview.html) — UI 原型（page-story 三栏布局）

---

## 一、设计理念

### 核心理念：渐进式编辑，而非全自动黑盒

```
传统竞品模式（全自动黑盒）：
  上传小说 → [AI 全自动处理] → 一键生成视频
  问题：角色不对？重来。场景不对？重来。用户无法干预中间步骤。

PrismCraft 模式（渐进式编辑）：
  导入 → 分割 → 逐片段处理（角色→场景→变体→Prompt）→ 生成
  优势：每个片段用户可控制，已有角色/场景自动复用，只编辑新的。
```

### 为什么不用全自动？

| 全自动的问题 | 渐进式如何解决 |
|-------------|---------------|
| 角色提取错误，全部重来 | 逐片段确认，错了只改一个片段 |
| 所有片段场景描述一样，画面单调 | 场景变体系统，不同时段/天气自动切换 |
| 用户不知道 AI 做了什么 | 每一步结果可见、可编辑、可跳过 |
| 角色经常"变脸" | 角色变体 + 跨片段向量匹配 + 一致性检查 |

### 设计原则

1. **用户主导，AI 辅助** — AI 提供建议，用户做决策
2. **编辑到哪里，角色/场景就编辑到哪里** — 渐进式，不提前批量处理
3. **已有实体自动复用** — 同一个角色/场景在多个片段中不重复编辑
4. **频率驱动重要性** — 出现次数多的自动标记为重要，少的自动降级
5. **向量化变体** — 场景变体用参数向量描述，可组合、可搜索、可自动匹配

---

## 二、完整流程（10 步）

```
Phase 1: 项目初始化
  Step 1.1  创建项目（名称、风格、格式、AI 模型）
  Step 1.2  选择导入来源（小说/剧本/大纲/模板/空白）

Phase 2: 内容导入与分割
  Step 2.1  导入文本
  Step 2.2  章节分割（自动识别章节标记 + 用户手动调整）
  Step 2.3  选择分割粒度（粗略/标准/精细）
  Step 2.4  Agent 子分割（章节内进一步拆分为片段）

Phase 3: 角色管理（分割前用户可预输入）
  Step 3.1  用户手动输入已知角色（可选，跳过则全 AI 提取）
  Step 3.2  Agent 从文本中补充识别角色
  Step 3.3  分割时建立"片段→角色"关联映射
  Step 3.4  角色编辑（外貌、性格、身份、备注）
  Step 3.5  角色在片段中的定位编辑（戏份权重、角色功能）

Phase 4: 场景管理
  Step 4.1  Agent 识别场景
  Step 4.2  建立"片段→场景"关联映射
  Step 4.3  场景编辑（氛围、空间、元素）
  Step 4.4  场景变体创建（时间/天气/光照/氛围/季节/机位）

Phase 5: 检查与调优
  Step 5.1  角色/场景频率分析 → 重要性排序（P0/P1/P2/P3）
  Step 5.2  一致性检查（角色外观、场景氛围、关联完整性）
  Step 5.3  用户手动调整优先级和关联

Phase 6: 剧本化
  Step 6.1  每个片段生成 Prompt 预览
  Step 6.2  用户审核/修改 Prompt
  Step 6.3  批量 Prompt 优化（统一风格、术语一致性）

Phase 7: 生成
  Step 7.1  选择生成顺序（按片段/按章节/全部）
  Step 7.2  批量生成 + 进度追踪
  Step 7.3  生成结果预览 + 单片段重新生成
```

---

## 三、核心机制

### 3.1 角色/场景去重复用

#### 三级匹配策略

| 匹配方式 | 触发条件 | 结果 |
|---------|---------|------|
| **精确匹配** | 角色名完全相同（"零" = "零"） | 直接复用，自动关联 |
| **模糊匹配** | 编辑距离 ≤ 2（"零" vs "零酱"） | 提示用户确认是否同一角色 |
| **向量匹配** | cosine similarity > 0.85 | 提示用户确认是否同一角色 |
| **无匹配** | 以上都不满足 | 创建新角色，标记 ⚠ 待编辑 |

#### 状态机

```
角色状态流转：
  manual_input ──→ confirmed     (用户手动创建，直接确认)
  ai_extracted ──→ editing       (AI 提取，需要编辑)
  editing ───────→ confirmed     (编辑完成，全局可用)
  ai_extracted ──→ confirmed     (用户跳过编辑，直接确认)
  ai_extracted ──→ conflicted    (疑似与另一角色重复)
  conflicted ────→ confirmed     (用户确认是不同角色)
  conflicted ────→ merged        (合并到已有角色)

场景状态流转：同上。

片段状态流转：
  pending ──→ splitting ──→ split_done
  split_done ──→ extracting_chars ──→ chars_done
  chars_done ──→ extracting_scenes ──→ scenes_done
  scenes_done ──→ composing_prompt ──→ prompt_done
  prompt_done ──→ generating ──→ generated | failed
  failed ──→ composing_prompt | generating (重试)
```

### 3.2 角色重要性排序

```
自动计算：frequency = 角色出现的片段数 / 总片段数

P0 (主角):   frequency >= 80%  → 出现在几乎所有片段
P1 (重要):   frequency >= 40%  → 出现在半数以上片段
P2 (配角):   frequency >= 10%  → 出现在少数片段
P3 (龙套):   frequency < 10%   → 偶尔出现

用户可手动调整优先级。
```

### 3.3 场景变体向量化

每个场景变体用以下参数向量描述，可组合、可搜索、可自动匹配：

| 参数 | 可选值 | 用途 |
|------|--------|------|
| `timeOfDay` | dawn / morning / noon / afternoon / evening / night | 时段 |
| `weather` | clear / rainy / foggy / snowy / stormy / overcast | 天气 |
| `lighting` | warm / cool / neon / natural / dim / harsh | 光照 |
| `mood` | peaceful / tense / chaotic / romantic / mysterious / melancholic | 氛围 |
| `crowdLevel` | empty / sparse / normal / crowded | 人流 |
| `cameraAngle` | wide / medium / close-up / aerial / low-angle / dutch | 机位 |
| `season` | spring / summer / autumn / winter / none | 季节 |
| `colorPalette` | string（如"暖橙+暗蓝"） | 色调 |

**自动匹配**：根据片段的情绪和时间信息，自动从场景变体库中匹配最合适的变体。

**相似变体推荐**：当用户为一个场景创建变体后，系统自动推荐为其他场景创建相同时段/天气的变体，保持跨场景视觉一致性。

### 3.4 Prompt 自动合成

```
片段 + 角色变体 + 场景变体 → 完整 Prompt

示例：
  片段: "零从阴影中走出，影站在站台另一端"
  角色: 零·战斗服（银白短发，红色瞳孔，紧身战斗服）
        影·默认（黑色皮衣，面具）
  场景: 新东京·深夜暴雨（night, rainy, tense, neon, crowded）

  ↓ 自动合成 ↓

  "深夜的新东京，暴雨倾盆。霓虹灯在雨幕中折射出诡异的红光。
  零穿着紧身战斗服站在雨中，银白短发贴在脸颊上，红色瞳孔
  紧盯着对面的影。影的黑色皮衣在雨中泛着冷光，面具下的
  眼神不可捉摸。中景，侧面拍摄，冷蓝色调，霓虹灯红色光晕。"
```

---

## 四、UI 设计

### 4.1 三栏布局

```
┌──────────────────────────────────────────────────────────┐
│ 📖 故事创作  [项目: 都市传说]  [AI: Kling 1.6]  [进度条]  │
├──────────┬───────────────────────────────────┬────────────┤
│          │                                   │            │
│ 片段导航  │        主工作区（按步骤切换）        │  上下文面板  │
│ (260px)  │        (flex)                     │  (280px)   │
│          │                                   │            │
│ ✅ 1.1   │  ┌─ 7步指示器 ──────────────────┐ │ 📝 项目设置 │
│ ✅ 1.2   │  │ 导入→分割→角色→场景→编辑→     │ │            │
│ ✅ 1.3   │  │ Prompt→生成                  │ │ 🛒 模板    │
│ ● 1.4   │  └─────────────────────────────┘ │            │
│ ○ 1.5   │                                   │ 📊 统计    │
│ ○ 1.6   │  ┌─ 当前片段编辑区 ──────────────┐ │ 角色: 4    │
│          │  │ 片段 1.4 · 天台对话           │ │ 场景: 3    │
│ ○ 2.1   │  │                               │ │ 新角色: 1⚠ │
│ ○ 2.2   │  │ [原始文本]                     │ │            │
│ ...      │  │                               │ │ 🎯 重要性  │
│          │  │ 👤 关联角色                    │ │ P0 零    │
│          │  │ 零✅ 山田✅ 影⚠新              │ │ P1 山田   │
│          │  │                               │ │ P1 影    │
│          │  │ 🏙 关联场景                    │ │ P2 博士   │
│          │  │ 新东京✅                       │ │            │
│          │  │                               │ │            │
│          │  │ 🎨 场景变体                    │ │            │
│          │  │ [清晨雾霭][深夜暴雨][黄昏余晖]  │ │            │
│          │  └───────────────────────────────┘ │            │
│          │                                   │            │
│          │ [←上] [跳过] [编辑⚠角色] [Prompt] [下→]│         │
└──────────┴───────────────────────────────────┴────────────┘
```

### 4.2 视觉规则

| 规则 | 说明 |
|------|------|
| **已有角色/场景** | 绿色边框 + ✅ 已确认 + 复用 + 出现次数 |
| **新角色/场景** | 黄色边框 + ⚠ 新角色/首次出现 + 编辑按钮高亮 |
| **冲突角色** | 红色边框 + 去重确认弹窗 |
| **片段导航** | ✅ 已完成 / ⚠ 有新实体待编辑 / ○ 未处理 |
| **步骤指示器** | 已完成=绿色 / 当前=紫色高亮 / 未开始=灰色 |

### 4.3 交互原则

| 原则 | 实现 |
|------|------|
| **编辑即确认** | 用户编辑保存后，角色自动变为 confirmed |
| **跳过即确认** | 用户直接跳过，角色也变为 confirmed |
| **批量兜底** | 提供"全部确认""仅编辑新的"按钮 |
| **已有角色默认折叠** | 已确认的角色只显示头像+名字，点击展开 |
| **新角色自动展开** | 新角色默认展开编辑面板 |

---

## 五、数据模型

> 详细定义见 [`development-plan.md` 附录 H](./development-plan.md#附录-h故事创作流水线数据模型)

### 核心实体关系

```
Project 1──N Chapter 1──N Segment
  │                    │
  │                    ├── SegmentCharacterLink ── Character ── CharacterVariant
  │                    │
  │                    └── SegmentSceneLink ──── Scene ────── SceneVariant
  │
  └── Character (project-level)
  └── Scene (project-level)
```

### 关键表

| 表 | 核心字段 |
|----|---------|
| **Project** | name, style, format, modelPreference, source, sourceText |
| **Chapter** | projectId, order, title, rawText |
| **Segment** | chapterId, order, rawText, summary, emotion, prompt, promptStatus, generationStatus |
| **Character** | projectId, name, status, source, appearance, personality, frequency, importance, embedding |
| **CharacterVariant** | characterId, name, outfit, expression, pose, promptFragment |
| **Scene** | projectId, name, status, baseDescription, spatial, elements, frequency, importance |
| **SceneVariant** | sceneId, name, timeOfDay, weather, lighting, mood, crowdLevel, cameraAngle, season, colorPalette, embedding |
| **SegmentCharacterLink** | segmentId, characterId, characterVariantId, role, weight |
| **SegmentSceneLink** | segmentId, sceneId, sceneVariantId |

---

## 六、与竞品对比

| 维度 | 魔因漫创 | Catimind | 即梦AI | **PrismCraft** |
|------|---------|----------|--------|:---:|
| 部署 | 桌面端 | SaaS | SaaS | **桌面端+网页版** |
| 流程模式 | 线性管道 | 全自动 | 全自动 | **渐进式编辑** |
| 角色一致性 | 6层锚点 | 三视图锁定 | 角色锁定 | **变体+向量+复用** |
| 场景变化 | 无 | 无 | 无 | **向量化变体** |
| 用户控制 | 板块级 | 输入输出 | 输入输出 | **片段级** |
| 开源 | 开源 | 闭源 | 闭源 | **闭源** |
| 扩展性 | 无 | 无 | 无 | **插件系统** |

### 核心差异

PrismCraft 的渐进式编辑在市场上没有直接竞品。所有竞品都在做"全自动黑盒"，而 PrismCraft 让用户**真正掌控创作过程**。

---

## 七、实现考虑

### 7.1 AI 调用限制

| 问题 | 影响 | 解法 |
|------|------|------|
| 长文本超 Token 上限 | 10万字小说无法一次处理 | 分章节处理 + 合并去重 |
| AI 调用成本 | 100片段 × ¥0.2-0.5 = ¥20-50/项目 | 用户自备 API Key |
| 输出不稳定 | 两次调用可能提取不同角色名 | 向量匹配去重 + 用户手动合并 |

### 7.2 状态管理

流水线不是线性 wizard，是反复迭代的编辑器。用户可能在编辑片段 5 时回到片段 2 修改角色。

- 步骤间依赖用"过期标记"而非自动重生成
- 自动保存草稿状态（每 2 秒）
- 支持撤销/重做

### 7.3 性能

- 100+ 片段列表用虚拟滚动（react-window）
- AI 请求并发控制（最多 3-5 并发）
- 大文本编辑器用 Monaco Editor

### 7.4 错误恢复

- 每个步骤失败可重试（最多 3 次）
- 部分片段失败不影响其他片段
- 断点续传（关闭应用后可从上次中断处继续）

---

## 八、实施优先级

| 优先级 | 内容 | 对应 Phase |
|:---:|------|:---:|
| P0 | 数据模型 + 数据库 Schema | Phase 2A |
| P0 | 文本分割引擎（章节+子分割） | Phase 2A |
| P0 | 角色/场景提取 + 去重匹配 | Phase 2A |
| P1 | 三栏 UI 编辑器（page-story） | UI 重置 Step 0 (占位) → Phase 2A (完整) |
| P1 | 角色/场景变体系统 | Phase 2A |
| P1 | Prompt 自动合成 | Phase 2A |
| P2 | 一致性检查 | Phase 2A |
| P2 | 频率→重要性排序 | Phase 2A |
| P2 | 场景变体自动匹配推荐 | Phase 2A |

---

## 九、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2026-06-21 | 初版，整合渐进式编辑设计理念、完整流程、核心机制、UI 设计、数据模型、竞品对比 |