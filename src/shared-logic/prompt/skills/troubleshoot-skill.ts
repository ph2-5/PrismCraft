/**
 * Troubleshoot Skill — 失败诊断 + 修复 prompt（Task 1.4 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-troubleshoot SKILL 模式。
 *
 * 触发场景：用户反馈生成失败/报错/效果不对，要求诊断修复。
 * 行为：按 8 个维度（相机/灯光/运动/参考角色/时长/构图/音频/安全措辞）诊断失败原因，
 *       给出修复后的 prompt。若 ctx.recentFailures 提供，优先诊断已知失败。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, FailureContext, Skill } from "./index";

export const troubleshootSkill: Skill = {
  id: "troubleshoot",
  matchers: [
    "失败",
    "报错",
    "不行",
    "为什么",
    "错误",
    "不对",
    "修复",
    "诊断",
    "有问题",
    "failed",
    "error",
    "wrong",
    "fix",
    "diagnose",
    "troubleshoot",
  ],

  buildInstructions(ctx: AgentContext): string {
    const failures = ctx.recentFailures ?? [];
    const knownFailuresHint = failures.length > 0
      ? buildKnownFailuresSection(failures)
      : "";

    return [
      "## 当前模式：失败诊断与修复（Troubleshoot）",
      "",
      "用户反馈生成失败或效果不符预期。请按以下 8 个维度逐一排查，找出最可能的失败原因并给出修复后的 prompt。",
      "",
      "### 8 维度诊断清单",
      "",
      "1. **相机（Camera）**：景别是否合理？运镜是否过快/过慢？角度是否导致主体变形？",
      "2. **灯光（Lighting）**：光线方向是否一致？是否存在过曝/欠曝？氛围光是否匹配情绪？",
      "3. **运动（Motion）**：主体动作幅度是否过大（导致模糊）？运动方向是否与镜头冲突？",
      "4. **参考角色（Character）**：角色身份特征是否明确？多人镜头是否说明站位？跨镜头服饰是否一致？",
      "5. **时长（Duration）**：时长是否匹配动作复杂度？（5s 只能做 1 个动作；15s 可做 2-3 个）",
      "6. **构图（Composition）**：主体是否在画面安全区？前景/中景/背景层次是否清晰？",
      "7. **音频（Audio）**：是否需要对口型？BGM 情绪是否匹配画面？环境音是否合理？",
      "8. **安全措辞（Safety）**：是否含名人/IP/品牌关键词？是否含暴力/敏感描述？是否含空泛质量词？",
      "",
      "### 诊断流程",
      "",
      "1. 询问用户具体失败现象（是报错？画面崩坏？角色不一致？还是效果不符预期？）",
      "2. 根据现象定位到 1-2 个最可能的维度",
      "3. 给出修复建议（具体到 prompt 哪一句改成什么）",
      "4. 输出修复后的完整 prompt（高亮改动部分）",
      "5. 若无法确定，要求用户提供失败截图或错误信息",
      knownFailuresHint,
    ].filter(Boolean).join("\n");
  },
};

function buildKnownFailuresSection(failures: FailureContext[]): string {
  const lines = failures.map((f, i) => {
    const promptLine = f.prompt ? `（原 prompt 片段：「${f.prompt}」）` : "";
    return `${i + 1}. [${f.dimension}] ${f.issue}${promptLine}`;
  });
  return [
    "",
    "### 已知失败上下文（系统提供）",
    "",
    "以下失败已被系统记录，诊断时优先考虑这些维度：",
    "",
    ...lines,
    "",
    "请针对上述已知失败给出针对性修复，避免泛泛而谈。",
  ].join("\n");
}
