/**
 * /story 页面入口 — 故事创作工作台
 *
 * 从"直接进入三模式导入流水线"改为"项目总览工作台"：
 * - 无故事时显示空态 +「新建项目」按钮
 * - 新建项目弹窗（名称 + 题材）→ 创建后回到总览，点击项目卡片进入细致编辑（/storyboard/:storyId）
 *
 * 原 StoryPipelineShell（小说导入流水线）保留在 @/modules/novel，
 * 后续可作为工作台内的"从小说导入"次级入口接回。
 */

import StoryWorkbench from "./StoryWorkbench";

export default function StoryPage() {
  return <StoryWorkbench />;
}
