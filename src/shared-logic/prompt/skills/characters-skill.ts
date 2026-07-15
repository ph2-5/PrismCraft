/**
 * Characters Skill — 角色一致性/多人 blocking 指令构建器（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-characters SKILL 模式。
 *
 * 触发场景：用户消息含角色相关关键词（角色/人物/主角/双人/群像/站位/视线等）。
 * 行为：构建角色一致性指令片段，覆盖单人镜头（身份 + 服装 + 发型 + 表情）
 *       和多人 blocking（站位关系 + 视线方向 + 互动动作），含冲突检测。
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";
import type {
  CharacterIdentity,
  MultiCharacterBlocking,
} from "./extended-types";

// === 角色冲突检测规则 ===
// 同一镜头中两个角色穿相同服装会被标记为冲突
export interface CharacterConflict {
  type: "same_outfit" | "same_hairstyle" | "ambiguous_identity";
  description: string;
  characters: string[];
}

export const charactersSkill: Skill = {
  id: "characters",
  matchers: [
    "角色",
    "人物",
    "主角",
    "双人",
    "群像",
    "站位",
    "视线",
    "互动",
    "对视",
    "服装",
    "发型",
    "character",
    "blocking",
  ],

  buildInstructions(_ctx: AgentContext): string {
    return [
      "## 角色专项指令（Characters Skill）",
      "",
      "本片段构建角色一致性指令，确保跨镜头身份一致 + 多人镜头站位清晰。",
      "",
      "### 单人镜头（Single Character）",
      "必填字段：",
      "- **身份参考**：性别 + 年龄 + 体型（如「20岁女性，纤细身材」）",
      "- **服装**：上装 + 下装 + 鞋子（如「白色衬衫，黑色短裙，红色高跟鞋」）",
      "- **发型**：长度 + 颜色 + 造型（如「齐肩黑发，中分直发」）",
      "- **表情**：情绪 + 面部特征（如「微笑，眼神柔和」）",
      "",
      "### 多人镜头（Multi-Character Blocking）",
      "必填字段：",
      "- **站位关系**：前景/中景/背景 + 左中右位置（如「前景左侧女性，背景男性」）",
      "- **视线方向**：看向哪里（如「女性看向画面外右侧，男性看向女性」）",
      "- **互动动作**：肢体接触或动作（如「女性伸手，男性后退」）",
      "",
      "### 角色冲突检测（Conflict Detection）",
      "以下情况会被标记为冲突，需要明确区分：",
      "- **相同服装**：两个角色穿相同服饰（如都穿白衬衫）→ 添加差异化配饰或颜色",
      "- **相同发型**：两个角色发型完全一致 → 调整长度或颜色",
      "- **身份模糊**：角色描述过于笼统（如「一个女孩」）→ 补充身份特征",
      "",
      "### 构建规则",
      "- 跨镜头角色身份特征必须一致（同一角色的发型/服饰在所有镜头中保持不变）",
      "- 多人镜头必须明确站位关系，避免「站在一起」这种模糊描述",
      "- 视线方向决定互动张力：对视→亲密/对峙；避开→疏离/隐瞒",
      "- 服装冲突时优先用颜色区分（红 vs 蓝），其次用配饰（戴帽 vs 不戴）",
      "- 输出格式：「身份参考，[服装]，[发型]，[表情]，[站位（多人时）]」",
      "",
      "### 跨镜头一致性检查清单",
      "- [ ] 主角的发型颜色在所有镜头中是否一致？",
      "- [ ] 主角的服装款式在所有镜头中是否一致？",
      "- [ ] 多人镜头中每个角色的身份特征是否明确？",
      "- [ ] 是否存在两个角色穿相同服装的情况？",
    ].join("\n");
  },
};

// === 导出构建函数 ===

export function buildCharacterIdentity(identity: CharacterIdentity): string {
  const parts = [identity.referenceDescription];
  if (identity.outfit) parts.push(identity.outfit);
  if (identity.hairstyle) parts.push(identity.hairstyle);
  if (identity.expression) parts.push(identity.expression);
  return parts.join("，");
}

export function buildMultiCharacterBlocking(blocking: MultiCharacterBlocking): string {
  const parts = [blocking.positionRelationship, blocking.gazeDirection];
  if (blocking.interactionAction) parts.push(blocking.interactionAction);
  return parts.join("，");
}

/**
 * 检测角色列表中的冲突（相同服装/发型/身份模糊）。
 */
export function detectCharacterConflicts(
  characters: Array<{ name: string; identity: CharacterIdentity }>,
): CharacterConflict[] {
  const conflicts: CharacterConflict[] = [];

  // 检测相同服装
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i]!;
      const b = characters[j]!;
      if (
        a.identity.outfit &&
        b.identity.outfit &&
        a.identity.outfit === b.identity.outfit
      ) {
        conflicts.push({
          type: "same_outfit",
          description: `${a.name} 和 ${b.name} 穿相同服装：${a.identity.outfit}`,
          characters: [a.name, b.name],
        });
      }
      if (
        a.identity.hairstyle &&
        b.identity.hairstyle &&
        a.identity.hairstyle === b.identity.hairstyle
      ) {
        conflicts.push({
          type: "same_hairstyle",
          description: `${a.name} 和 ${b.name} 发型相同：${a.identity.hairstyle}`,
          characters: [a.name, b.name],
        });
      }
    }
  }

  // 检测身份模糊（描述过短，少于 6 字符）
  for (const c of characters) {
    if (c.identity.referenceDescription.length < 6) {
      conflicts.push({
        type: "ambiguous_identity",
        description: `${c.name} 的身份描述过于模糊：${c.identity.referenceDescription}`,
        characters: [c.name],
      });
    }
  }

  return conflicts;
}
