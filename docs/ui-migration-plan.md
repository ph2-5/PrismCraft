# UI 迁移计划 — 旧布局 → 新设计

> **目标**：将现有 9 个页面从旧布局迁移到 `design-preview.html` 定义的新设计，**不新增功能**，只改布局、视觉、信息架构。
> **参考**：`design-preview.html`（17 个页面预览，261KB）
> **工期**：约 12-18 天（4 个 Phase）
> **原则**：先搭骨架（侧栏+路由），再逐页迁移，每 Phase 可独立验证。

---

## TL;DR

```
Phase A (3-4天): 侧栏分组重构 + 路由扩展 + AI状态面板
Phase B (4-6天): 分镜编辑器三栏重构（工作量最大）
Phase C (3-4天): 首页仪表盘 + 素材库分类树 + 设置页拆分
Phase D (2-4天): 角色场景视觉微调 + 项目列表独立路由 + 收尾打磨
```

---

## 现有 vs 目标 路由对照

| 现有路由 | 目标路由 | 迁移方式 |
|----------|----------|----------|
| `/` (Home) | `/` (主页仪表盘) | 重写布局 |
| — | `/projects` (项目列表) | 从首页拆分 |
| `/characters` | `/characters` | 视觉微调 |
| `/scenes` | `/scenes` | 视觉微调 |
| `/story` (分镜编辑) | `/storyboard` (三栏编辑器) | **重写** |
| `/asset-library` | `/assets` (分类树+网格) | 重构布局 |
| `/video-tasks` | `/tasks` | 保留，微调 |
| `/quick-generate` | 合并进首页快捷操作 | 删除独立路由 |
| `/settings` | `/settings` (5 Tab) | 拆分扩展 |
| — | `/agent` (AI助手) | **占位页**（功能在 Phase 1） |
| — | `/composer` (编译器) | **占位页**（功能在 Phase 2A） |
| — | `/plugins` (插件市场) | 从 settings 拆分 |
| — | `/story` (导入小说) | **占位页**（功能在 Phase 2A） |
| — | `/story-chars` | **占位页** |
| — | `/story-scenes` | **占位页** |
| — | `/story-shots` | **占位页** |
| — | `/story-tasks` | **占位页** |

> **占位页策略**：UI 迁移阶段只搭页面骨架 + "即将推出"提示，功能在 `development-plan.md` 对应 Phase 实现。

---

## Phase A：侧栏分组 + 路由扩展（3-4天）

### Task A.1：侧栏分组重构

**📋 前置阅读**：
- `src/shared/presentation/Sidebar.tsx` — 现有侧栏（扁平 navItems 数组）
- `design-preview.html` Line 190-227 — 新侧栏（4 分区结构）

**📝 产出文件**：
- `src/shared/presentation/Sidebar.tsx` — 修改（navItems → navSections）
- `src/shared/presentation/SidebarNavSection.tsx` — **新建**（分区组件）

**🤖 执行指令**：

将现有扁平 `navItems` 数组重构为分组结构：

```typescript
// 旧结构
const navItems = [
  { label: "快速生成", path: "/quick-generate", icon: ... },
  { label: "分镜", path: "/story", icon: ... },
  ...
];

// 新结构
const navSections: NavSection[] = [
  {
    title: "自由创作",
    subtitle: "手动编排 · 逐镜头精调",
    icon: "🎬",
    items: [
      { label: "主页", path: "/", icon: HomeIcon },
      { label: "角色", path: "/characters", icon: UserIcon },
      { label: "场景", path: "/scenes", icon: SceneIcon },
      { label: "分镜", path: "/storyboard", icon: FilmIcon },
      { label: "素材库", path: "/assets", icon: FolderIcon },
      { label: "任务", path: "/tasks", icon: TaskIcon },
    ],
  },
  {
    title: "故事创作",
    subtitle: "AI 管道 · 自动拆解生成",
    icon: "📖",
    items: [
      { label: "导入小说", path: "/story", icon: BookIcon },
      { label: "角色确认", path: "/story-chars", icon: UserIcon },
      { label: "场景确认", path: "/story-scenes", icon: SceneIcon },
      { label: "分镜预览", path: "/story-shots", icon: FilmIcon },
      { label: "批量任务", path: "/story-tasks", icon: TaskIcon },
    ],
  },
  {
    title: "工具",
    items: [
      { label: "AI 助手", path: "/agent", icon: BotIcon },
      { label: "编译器", path: "/composer", icon: ImageIcon },
    ],
  },
  {
    title: "系统",
    items: [
      { label: "插件市场", path: "/plugins", icon: PuzzleIcon },
      { label: "设置", path: "/settings", icon: SettingsIcon },
    ],
  },
];
```

**✅ Done 标准**：
- 侧栏显示 4 个分区，每个分区有标题 + 图标
- 自由创作和故事创作有副标题说明
- 分区之间有分隔线
- 折叠/展开功能正常
- `npm run typecheck && npm run lint` 通过

---

### Task A.2：路由扩展 + 占位页

**📋 前置阅读**：
- `src/router.tsx` — 现有路由配置
- `design-preview.html` — 17 个页面结构

**📝 产出文件**：
- `src/router.tsx` — 修改（新增 8 个路由）
- `src/app/agent/page.tsx` — **新建**（占位页）
- `src/app/composer/page.tsx` — **新建**（占位页）
- `src/app/plugins/page.tsx` — **新建**（从 settings 拆分）
- `src/app/projects/page.tsx` — **新建**（从首页拆分）
- `src/app/story-pipeline/page.tsx` — **新建**（占位页，导入小说）
- `src/app/story-pipeline/characters/page.tsx` — **新建**（占位页）
- `src/app/story-pipeline/scenes/page.tsx` — **新建**（占位页）
- `src/app/story-pipeline/shots/page.tsx` — **新建**（占位页）
- `src/app/story-pipeline/tasks/page.tsx` — **新建**（占位页）
- `src/shared/presentation/PlaceholderPage.tsx` — **新建**（通用占位组件）

**🤖 执行指令**：

1. 创建通用占位组件：

```tsx
// src/shared/presentation/PlaceholderPage.tsx
export function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="text-6xl opacity-30">{icon}</div>
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Badge variant="outline">即将推出</Badge>
    </div>
  );
}
```

2. 路由变更：

```typescript
// router.tsx 新增
{ path: "/agent", element: <PlaceholderPage icon="🤖" title="AI 助手" description="Agent 框架就绪后启用" /> },
{ path: "/composer", element: <PlaceholderPage icon="🖼" title="全局编译器" description="角色+场景+道具组合生成" /> },
{ path: "/plugins", element: <PluginsPage /> },  // 从 settings 拆分
{ path: "/projects", element: <ProjectsPage /> },  // 从首页拆分
{ path: "/story", element: <PlaceholderPage icon="📖" title="导入小说" description="AI 管道就绪后启用" /> },
{ path: "/story-chars", element: <PlaceholderPage icon="👤" title="角色确认" /> },
{ path: "/story-scenes", element: <PlaceholderPage icon="🏙" title="场景确认" /> },
{ path: "/story-shots", element: <PlaceholderPage icon="🎬" title="分镜预览" /> },
{ path: "/story-tasks", element: <PlaceholderPage icon="📋" title="批量任务" /> },
```

3. 路由重命名：`/story`（分镜编辑）→ `/storyboard`，`/asset-library` → `/assets`，`/video-tasks` → `/tasks`

4. 删除 `/quick-generate` 独立路由（合并进首页快捷操作）

**✅ Done 标准**：
- 侧栏所有导航项可点击跳转
- 占位页显示"即将推出"
- 旧路由重定向到新路由（`/story` → `/storyboard`）
- `npm run typecheck && npm run lint` 通过

---

### Task A.3：侧栏底部 AI 状态面板

**📋 前置阅读**：
- `design-preview.html` Line 228-245 — AI 生成中状态面板
- `src/modules/video/task-management/hooks/` — 现有视频任务 store

**📝 产出文件**：
- `src/shared/presentation/SidebarAIStatus.tsx` — **新建**
- `src/shared/presentation/Sidebar.tsx` — 修改（底部插入 AIStatus）

**🤖 执行指令**：

在侧栏底部添加 AI 任务进度面板：

```tsx
// SidebarAIStatus.tsx
export function SidebarAIStatus() {
  const activeTasks = useVideoTaskStore(s => s.activeTasks); // 进行中的任务
  if (activeTasks.length === 0) return null;

  return (
    <div className="m-2 rounded-xl border border-primary/15 bg-card2 p-3">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary/70">
        AI 生成中
      </div>
      {activeTasks.slice(0, 2).map(task => (
        <div key={task.id} className="mb-2">
          <div className="flex items-center justify-between text-xs">
            <span>第{task.shotIndex}镜 · {task.type}</span>
            <span>{task.progress}%</span>
          </div>
          <Progress value={task.progress} className="h-1" />
        </div>
      ))}
      {activeTasks.length > 2 && (
        <div className="text-xs text-muted-foreground">+{activeTasks.length - 2} 个任务</div>
      )}
    </div>
  );
}
```

**✅ Done 标准**：
- 有进行中任务时显示进度条
- 无任务时面板隐藏
- 最多显示 2 个任务 + "更多"提示
- 进度条有脉冲动画

---

## Phase B：分镜编辑器三栏重构（4-6天）

> **这是工作量最大的 Phase**，核心创新在此。

### Task B.1：三栏布局骨架

**📋 前置阅读**：
- `src/modules/story/beat-editor/presentation/ProfessionalModeEditor.tsx` — 现有编辑器
- `design-preview.html` `page-storyboard` — 三栏布局参考

**📝 产出文件**：
- `src/modules/story/beat-editor/presentation/StoryboardEditor.tsx` — **新建**（三栏容器）
- `src/modules/story/beat-editor/presentation/BeatListColumn.tsx` — **新建**（左栏 340px）
- `src/modules/story/beat-editor/presentation/PromptEditColumn.tsx` — **新建**（中栏 flex:1）
- `src/modules/story/beat-editor/presentation/ElementBindingColumn.tsx` — **新建**（右栏 300px）
- `src/modules/story/beat-editor/presentation/PreviewColumn.tsx` — **新建**（第三栏 220px）
- `src/modules/story/beat-editor/presentation/StoryboardTimeline.tsx` — **新建**（底部时间轴）

**🤖 执行指令**：

```tsx
// StoryboardEditor.tsx — 三栏 + 底部时间轴
export function StoryboardEditor() {
  return (
    <div className="flex h-full flex-col">
      {/* 顶部 Tab：分镜编排 / AI 生成 / 预览导出 */}
      <StoryboardTabs />

      {/* 三栏主体 */}
      <div className="flex flex-1 overflow-hidden">
        <BeatListColumn />          {/* 左 340px */}
        <PromptEditColumn />        {/* 中 flex:1 */}
        <ElementBindingColumn />    {/* 右 300px */}
        <PreviewColumn />           {/* 第三 220px */}
      </div>

      {/* 底部时间轴 */}
      <StoryboardTimeline />
    </div>
  );
}
```

**布局契约**（从 design-preview.html 提取）：
- 左栏：`width: 340px; flex-shrink: 0; border-right`
- 中栏：`flex: 1; min-width: 0`
- 右栏：`width: 300px; flex-shrink: 0; border-left`
- 第三栏：`width: 220px; flex-shrink: 0; border-left`
- 底部时间轴：`height: 100px; flex-shrink: 0; border-top`
- 整体：`height: 100%; display: flex; flex-direction: column`

**✅ Done 标准**：
- 三栏 + 底部时间轴布局正确
- 各栏可独立滚动
- 窗口缩放时比例不变
- 现有分镜数据可正常显示

---

### Task B.2：左栏 — 分镜列表

**📝 产出文件**：
- `src/modules/story/beat-editor/presentation/BeatListColumn.tsx`

**🤖 执行指令**：

每项显示：
```
┌─────────────────────────────────┐
│ #1  城市黎明          [已生成] │
│ 零站在天台边缘，俯瞰...        │
│ 👤零  🏙新东京  📐远景  🎥推  │
└─────────────────────────────────┘
```

- 编号 + 标题 + 状态徽章
- 描述截断 2 行
- 底部 chip 标签：绑定角色/场景 + 景别 + 运镜
- 选中态：左侧 3px 主色边框 + 背景高亮
- 未绑定角色/场景：dashed border + 警告色

**✅ Done 标准**：
- 分镜列表可滚动
- 点击选中高亮
- 状态徽章正确（草稿/已生成/生成中/失败）
- 绑定标签正确显示

---

### Task B.3：中栏 — 提示词编辑器

**📝 产出文件**：
- `src/modules/story/beat-editor/presentation/PromptEditColumn.tsx`
- `src/modules/story/beat-editor/presentation/PromptBindingHighlighter.tsx` — **新建**

**🤖 执行指令**：

中栏结构：
```
┌──────────────────────────────────┐
│ #1 城市黎明              [景别▾] │
├──────────────────────────────────┤
│ [关键帧] [首帧] [尾帧]           │ ← Tab 切换
├──────────────────────────────────┤
│                                  │
│  零站在[新东京]的天台边缘...     │ ← 提示词，角色名高亮
│  ↑紫色    ↑蓝色                 │
│                                  │
├──────────────────────────────────┤
│ 景别: 远景  运镜: 推  时长: 5s  │ ← 属性面板
└──────────────────────────────────┘
```

- 提示词编辑区支持 Tab 切换：关键帧 / 首帧 / 尾帧
- **提示词绑定高亮**：文本中出现的角色名用紫色 tag，场景名用蓝色 tag
- 底部属性面板：景别（下拉）、运镜（下拉）、时长（数字输入）

**✅ Done 标准**：
- Tab 切换正常
- 提示词文本中角色/场景名高亮
- 属性修改保存到 store
- 编辑器自适应高度

---

### Task B.4：右栏 — 元素绑定面板

**📝 产出文件**：
- `src/modules/story/beat-editor/presentation/ElementBindingColumn.tsx`
- `src/modules/story/beat-editor/presentation/BindingCard.tsx` — **新建**

**🤖 执行指令**：

右栏结构：
```
┌────────────────────────┐
│ 🔗 元素绑定             │
├────────────────────────┤
│ ┌────────────────────┐ │
│ │ 👤 零               │ │
│ │ 角色: 主角          │ │
│ │ 位置: 天台边缘      │ │
│ │ 动作: 站立俯瞰      │ │
│ │ 情绪: 严肃          │ │
│ │ 补充: 白色风衣      │ │
│ │ ────────────────── │ │
│ │ ✅ 一致性检查 100%  │ │
│ └────────────────────┘ │
│ ┌────────────────────┐ │
│ │ 🏙 新东京           │ │
│ │ 位置: 城市          │ │
│ │ 时间: 黎明          │ │
│ │ 天气: 雾            │ │
│ │ ────────────────── │ │
│ │ ✅ 一致性检查 100%  │ │
│ └────────────────────┘ │
│ + 添加角色/场景        │
└────────────────────────┘
```

每个绑定卡片包含：
- 实体头像 + 名称
- 角色/位置/动作/情绪/补充描述（可编辑）
- 一致性检查进度条
- 删除按钮

**✅ Done 标准**：
- 绑定卡片正确显示
- 字段可编辑并保存
- 一致性检查进度条显示（数据源：现有 consistency-check 服务）
- 添加/删除绑定正常

---

### Task B.5：第三栏 — 预览区 + 底部时间轴

**📝 产出文件**：
- `src/modules/story/beat-editor/presentation/PreviewColumn.tsx`
- `src/modules/story/beat-editor/presentation/StoryboardTimeline.tsx`

**🤖 执行指令**：

第三栏（预览区）：
```
┌──────────────────┐
│ 📸 关键帧         │
│ ┌──────────────┐ │
│ │              │ │
│ │   [图片]     │ │
│ │              │ │
│ └──────────────┘ │
│ [生成] [上传]    │
├──────────────────┤
│ 📸 首帧          │
│ [缩略图]         │
├──────────────────┤
│ 📸 尾帧          │
│ [缩略图]         │
├──────────────────┤
│ 🎬 视频预览      │
│ [播放器]         │
└──────────────────┘
```

底部时间轴：
```
┌──────────────────────────────────────────────────┐
│ #1  #2  #3  #4  #5  #6  #7  #8  #9  #10  #11  #12 │
│ 🖼  🖼  🖼  ⏳ 🖼  ❌ 🖼  🖼  🖼  🖼   🖼   🖼  │
│ 5s  3s  4s  5s  3s  4s  5s  3s  4s  5s   3s   4s  │
└──────────────────────────────────────────────────┘
```

- 横向滚动卡片
- 每卡：缩略图 + 状态图标 + 时长
- 点击跳转到对应分镜
- 当前选中分镜高亮

**✅ Done 标准**：
- 预览区三块（关键帧/首尾帧/视频）正确显示
- 时间轴横向滚动
- 点击时间轴卡片跳转
- 当前选中高亮

---

## Phase C：首页 + 素材库 + 设置页（3-4天）

### Task C.1：首页三栏仪表盘

**📋 前置阅读**：
- `src/app/page.tsx` — 现有首页
- `src/app/ProjectList.tsx` — 现有项目列表
- `src/app/QuickActions.tsx` — 现有快捷操作
- `design-preview.html` `page-home` — 仪表盘布局

**📝 产出文件**：
- `src/app/page.tsx` — 重写
- `src/app/home/ProjectHeader.tsx` — **新建**
- `src/app/home/StatsRow.tsx` — **新建**
- `src/app/home/ReferenceMapPanel.tsx` — **新建**
- `src/app/home/ActivityTimeline.tsx` — **新建**
- `src/app/home/QuickActionsPanel.tsx` — **新建**
- `src/app/home/OrphanResourcesPanel.tsx` — **新建**

**🤖 执行指令**：

首页布局：
```
┌──────────────────────────────────────────────────────┐
│ 🌃 都市传说    修改: 2026-06-18  ⚡3 API  [设置][分镜] │ ← ProjectHeader
├──────────────────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                       │
│  │ 4  │ │ 4  │ │ 12 │ │ 24 │  ← 统计卡片（可点击）    │ ← StatsRow
│  │角色│ │场景│ │分镜│ │素材│                        │
│  └────┘ └────┘ └────┘ └────┘                       │
├──────────────────────────────────┬──────────────────┤
│ 🔗 引用地图                       │ ⚡ 快捷操作       │
│ 👤 零 ──→ 第1,2,3,4镜           │ 🎬 快速生成      │
│ 🏙 新东京 ──→ 第1,2,4镜         │ 📖 故事创作      │
│ ⚠ 博士 ──→ 未引用               │ 🎨 图片生成器    │
│ [搜索...] [展开]                 │ 📋 视频任务      │
│                                  ├──────────────────┤
│ 📋 最近动态                       │ ⚠ 孤立资源       │
│ 🖼 第5镜 视频完成 14:32          │ 博士 (未引用)    │
│ ✏ 更新角色 零 13:15             │ 废弃工厂 (未引用)│
└──────────────────────────────────┴──────────────────┘
```

**布局契约**：
- 整体：`display: flex; flex-direction: column; height: 100%`
- ProjectHeader：`flex-shrink: 0`
- StatsRow：`flex-shrink: 0`，4 列 grid
- 主体：`flex: 1; display: flex; gap: 16px; overflow: hidden`
  - 左侧（引用地图+动态）：`flex: 1; display: flex; flex-direction: column; gap: 12px`
  - 右侧（快捷操作+孤立资源）：`width: 280px; flex-shrink: 0`

**✅ Done 标准**：
- 三栏布局正确
- 统计卡片可点击跳转
- 引用地图显示角色/场景→分镜引用关系
- 孤立资源高亮
- 快捷操作卡片可点击

---

### Task C.2：素材库分类树重构

**📋 前置阅读**：
- `src/app/asset-library/page.tsx` — 现有素材库（4 Tab）
- `design-preview.html` `page-assets` — 左分类树+右网格

**📝 产出文件**：
- `src/app/asset-library/page.tsx` — 重写
- `src/app/asset-library/CategoryTree.tsx` — **新建**
- `src/app/asset-library/AssetGrid.tsx` — **新建**（从现有拆分）

**🤖 执行指令**：

布局变更：
```
旧：[Tab: 角色|场景|分镜|收藏集] → 网格
新：┌──────────┬───────────────────────────┐
    │ 全部素材  │  [搜索] [上传] [批量]      │
    │ 角色素材  │  ┌────┐ ┌────┐ ┌────┐   │
    │ 场景素材  │  │ 🖼 │ │ 🖼 │ │ 🖼 │   │
    │ 分镜素材  │  └────┘ └────┘ └────┘   │
    │ 道具      │                           │
    │  ├ 服装   │                           │
    │  ├ 武器   │                           │
    │  ├ 配饰   │                           │
    │  └ 道具   │                           │
    │ 收藏集    │                           │
    │ 媒体资产  │                           │
    └──────────┴───────────────────────────┘
```

- 左侧分类树：`width: 200px; flex-shrink: 0`
- 道具分类暂时为占位（Phase 2A Task 2A.8 实现数据层）
- 右侧网格保留现有卡片样式

**✅ Done 标准**：
- 左分类树可点击筛选
- 右侧网格自适应
- 上传区可折叠
- 批量选择工具栏浮动显示

---

### Task C.3：设置页 5 Tab 拆分

**📋 前置阅读**：
- `src/app/settings/page.tsx` — 现有设置页（API配置 + 插件管理）
- `design-preview.html` `page-settings` — 5 Tab

**📝 产出文件**：
- `src/app/settings/page.tsx` — 修改
- `src/app/settings/AutoSaveTab.tsx` — **新建**（占位）
- `src/app/settings/SyncTab.tsx` — **新建**（占位）
- `src/app/settings/ProjectPackageTab.tsx` — **新建**（占位）
- `src/app/settings/SystemTab.tsx` — **新建**（占位）

**🤖 执行指令**：

5 个 Tab：
1. **API 配置** — 现有功能迁移，新增 API Key 自动检测 Provider 类型
2. **自动保存** — 占位（功能后续实现）
3. **同步** — 占位
4. **项目包** — 占位
5. **系统** — 占位（磁盘空间、缓存清理、日志查看）

插件管理拆分到 `/plugins` 独立页面。

**✅ Done 标准**：
- 5 个 Tab 切换正常
- API 配置 Tab 功能完整
- 其他 Tab 显示占位提示
- 插件管理从 settings 移除，在 `/plugins` 独立显示

---

## Phase D：角色场景微调 + 收尾（2-4天）

### Task D.1：角色页面视觉微调

**📋 前置阅读**：
- `src/app/characters/page.tsx` — 现有角色页（功能完备）
- `design-preview.html` `page-characters`

**📝 产出文件**：
- `src/app/characters/page.tsx` — 修改（视觉调整）

**🤖 执行指令**：

调整项：
- 顶部工具栏：搜索框 + "+ 添加角色"按钮对齐
- 空状态：右侧详情区"选择一个角色查看详情"引导
- 卡片样式：圆角、阴影、hover 效果统一

> **注意**：服装管理功能保留，Phase 2A Task 2A.10 才替换为角色变体系统。

**✅ Done 标准**：
- 视觉与新设计一致
- 功能无回归
- `npm run typecheck && npm run lint` 通过

---

### Task D.2：场景页面视觉微调

**📝 产出文件**：
- `src/app/scenes/page.tsx` — 修改（视觉调整）

**🤖 执行指令**：同 Task D.1，调整顶部工具栏 + 空状态 + 卡片样式。

**✅ Done 标准**：同 Task D.1。

---

### Task D.3：项目列表独立路由

**📋 前置阅读**：
- `src/app/ProjectList.tsx` — 现有项目列表（嵌在首页）
- `design-preview.html` `page-projects`

**📝 产出文件**：
- `src/app/projects/page.tsx` — **新建**
- `src/app/ProjectList.tsx` — 修改（导出为独立组件）

**🤖 执行指令**：

- 从首页拆分项目列表到 `/projects`
- 卡片网格 + 搜索 + 新建
- 首页的 ProjectHeader 中"项目切换"按钮跳转到 `/projects`

**✅ Done 标准**：
- `/projects` 页面独立显示
- 首页不再包含项目列表
- 搜索、新建功能正常

---

### Task D.4：全局收尾打磨

**📝 产出文件**：各页面文件（修改）

**🤖 执行指令**：

1. 所有页面 `switchPage` / 路由切换无 console error
2. 响应式适配（最小窗口 1024×768 不掉组件）
3. Loading skeleton 替换所有 spinner
4. 亮暗主题切换在所有新页面生效
5. 键盘快捷键：`Ctrl+K` 全局搜索，`Ctrl+B` 侧边栏
6. 所有交互反馈（按钮 hover/active、Toast、焦点环）

**✅ Done 标准**：
- 全部页面无 console error
- 最小窗口 1024×768 无组件溢出
- 亮暗主题切换流畅
- 所有快捷键生效

---

## 验证清单

每个 Phase 完成后执行：

```bash
npm run typecheck
npm run typecheck:electron
npm run lint
npm run lint:arch
npm test
npm run e2e
```

---

## 与 development-plan.md 的衔接

| UI 迁移 Phase | 对应 development-plan Phase | 关系 |
|---------------|---------------------------|------|
| Phase A（侧栏+路由） | Phase 0 Task 0.3 | UI 迁移先行，搭好骨架 |
| Phase B（分镜编辑器） | Phase 2B Task 2B.11 | 布局先搭好，功能后填入 |
| Phase C（首页+素材库） | Phase 0 Task 0.3 + Phase 2A Task 2A.8 | 首页仪表盘 + 素材库分类树 |
| Phase D（微调+收尾） | Phase 4 Task 4.9 | UI 打磨 |

> **关键**：UI 迁移只改布局和视觉，不实现新功能。所有"占位页"在 `development-plan.md` 对应 Phase 填入实际功能。
