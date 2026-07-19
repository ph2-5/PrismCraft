/**
 * QC Skill — 一致性 QC 检查 prompt（Task 2A.23 Agent 集成 P2）
 *
 * 触发场景：用户询问视频完成情况、QC 结果、角色漂移、是否需要重新生成。
 * 行为：引导 Agent 调用 check_video_consistency 获取 QCReport，根据 verdict 决策：
 *   - pass / drift_warning → 告知用户质量良好
 *   - drift_critical → 询问用户是否调用 dispatch_video_fallback
 *
 * 与 intent-routes.ts 的 videoCompletedRouteContext 的关系：
 * - videoCompletedRouteContext 提供「意图层」简要指引（响应流程）
 * - qcSkill 提供「Skill 层」详细 QC 工作流（工具调用细节、verdict 解读、forceAction 规则）
 * - 二者按顺序拼接到 system prompt，互补而非重叠
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";

export const qcSkill: Skill = {
  id: "qc",
  matchers: [
    "qc",
    "一致性",
    "质量检查",
    "consistency",
    "检查视频",
    "视频质量",
    "漂移",
    "重新检查",
  ],

  buildInstructions(_ctx: AgentContext): string {
    return [
      "## 当前模式：一致性 QC 检查（QC）",
      "",
      "用户询问视频完成情况、QC 结果或角色漂移。请按以下流程响应：",
      "",
      "### 响应流程",
      "",
      "1. **获取 taskId**：",
      "   - 若用户已提供 taskId → 直接使用",
      "   - 若用户未提供 → 调用 `list_video_tasks(status=\"completed\")` 查询最近完成的视频，让用户确认",
      "",
      "2. **执行 QC 查询**：调用 `check_video_consistency(taskId)`",
      "   - 默认 `forceRecheck=false`，返回 cached QCReport（避免重复抽帧）",
      "   - 用户明确要求「重新检查」/「再跑一次」→ `forceRecheck=true`",
      "   - 若返回 `cached=true`，告知用户「这是之前 QC 的结果，可要求重新检查」",
      "",
      "3. **解读 verdict 并决策**：",
      "   - `pass`（通过）→ 告知用户「视频质量良好，角色一致性达标」",
      "   - `drift_warning`（漂移警告）→ 告知用户「检测到轻微漂移，但不影响使用，可手动决定是否重新生成」",
      "   - `drift_critical`（严重漂移）→ 告知用户「检测到严重角色漂移」，询问是否触发 fallback",
      "",
      "4. **触发 fallback**（仅 verdict=drift_critical 且用户同意时）：",
      "   - 调用 `dispatch_video_fallback(taskId)`（不传 forceAction）",
      "   - 系统会按 retryCount 自动决策：regenerate → face_swap → manual_review",
      "   - 告知用户触发的动作和新的 taskId（若 regenerate）",
      "",
      "### forceAction 使用规则（重要）",
      "",
      "仅当用户明确表达偏好时才传 `forceAction`：",
      "- 用户说「交给人工处理」/「不要再试了」→ `forceAction=\"manual_review\"`（唯一可跳过 fallback 链的动作）",
      "- 用户说「重新生成」→ `forceAction=\"regenerate\"`（若 retryCount 超限会返回错误，此时建议改用 face_swap 或 manual_review）",
      "- 用户说「尝试 face-swap」→ `forceAction=\"face_swap\"`（必须 retryCount 达到 maxRegenerateAttempts）",
      "",
      "**禁止行为**：",
      "- 不要对 verdict=pass / drift_warning 的视频调用 dispatch_video_fallback",
      "- 不要主动传 forceAction（除非用户明确要求）",
      "- 不要在 forceAction 不匹配时反复重试（返回错误即告知用户）",
      "",
      "### QCReport 关键字段解读",
      "",
      "- `verdict`：pass / drift_warning / drift_critical（只有 critical 触发 fallback）",
      "- `averageScore` / `minScore`：cosineSimilarity 0-1，越低漂移越严重",
      "  - 一般 pass: >0.8, warning: 0.6-0.8, critical: <0.5（具体阈值由 DriftPolicy 决定）",
      "- `retryCount`：fallback 重试次数（0=未触发过 fallback）",
      "- `actionTaken`：上次 fallback 执行的动作（none / regenerated / face_swapped / manual_review）",
      "- `worstFrames`：最差 3 帧的索引、时间戳、cosineSimilarity（用于定位漂移位置）",
      "- `sampledFrames` / `totalFrames`：抽样帧数 / 总帧数",
      "",
      "### Workflow 编排",
      "",
      "QC 工具已注册到 toolRegistry，可通过 workflow 工具批量编排：",
      "- `create_workflow` / `chain_operations` / `batch_process`",
      "- 示例：「检查所有 critical 视频」→ list_video_tasks → 逐个 check_video_consistency → 汇总 verdict=critical 的任务",
      "",
      "### 响应示例",
      "",
      "用户：「视频好了吗？检查一下一致性」",
      "Agent 响应：",
      "1. 调用 list_video_tasks(status=\"completed\", limit=5) → 找到最近完成的 taskId",
      "2. 调用 check_video_consistency(taskId) → 获取 QCReport",
      "3. 根据 verdict 输出：",
      '   - 若 pass：「视频质量良好，角色一致性达标（averageScore=0.85），无需处理」',
      '   - 若 critical：「检测到严重角色漂移（minScore=0.42，最差帧在第 3 秒），是否需要重新生成？」',
      "",
      "用户：「重新生成这个视频」",
      "Agent 响应：",
      "1. 调用 dispatch_video_fallback(taskId, forceAction=\"regenerate\")",
      "2. 若成功：「已触发重新生成，新任务 taskId=xxx，预计等待 X 分钟」",
      "3. 若失败（retryCount 超限）：「regenerate 已达上限，建议改用 face_swap 或 manual_review」",
    ].join("\n");
  },
};
