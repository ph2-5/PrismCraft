/**
 * 扩展 Skill 体系测试（Task 4.7 v5.3 增强）
 *
 * 覆盖 6 个扩展 Skill：camera / lighting / characters / style / vfx / audio
 */

import { describe, it, expect } from "vitest";
import { cameraSkill } from "../camera-skill";
import { lightingSkill } from "../lighting-skill";
import { charactersSkill, detectCharacterConflicts } from "../characters-skill";
import { styleSkill, rewriteIpStyle, listSupportedStyles } from "../style-skill";
import { vfxSkill } from "../vfx-skill";
import { audioSkill } from "../audio-skill";
import {
  buildCameraInstruction,
  recommendCameraByMood,
} from "../camera-skill";
import {
  buildLightingInstruction,
  recommendLightingByMood,
} from "../lighting-skill";
import { buildStyleInstruction } from "../style-skill";
import {
  buildParticleEffect,
  buildWeatherEffect,
} from "../vfx-skill";
import { buildAudioInstruction } from "../audio-skill";
import type { AgentContext } from "../index";

const ctx: AgentContext = { userMessage: "测试" };

describe("cameraSkill", () => {
  it("matchers 含镜头关键词", () => {
    expect(cameraSkill.matchers).toContain("镜头");
    expect(cameraSkill.matchers).toContain("景别");
    expect(cameraSkill.matchers).toContain("特写");
  });

  it("buildInstructions 返回镜头专项指令", () => {
    const instructions = cameraSkill.buildInstructions(ctx);
    expect(instructions).toContain("Camera Skill");
    expect(instructions).toContain("景别");
    expect(instructions).toContain("运动方式");
    expect(instructions).toContain("镜头参数");
  });

  it("buildInstructions 含情绪推荐（紧张）", () => {
    const ctx2: AgentContext = { userMessage: "紧张氛围" };
    const instructions = cameraSkill.buildInstructions(ctx2);
    expect(instructions).toContain("当前推荐");
    expect(instructions).toContain("紧张");
  });

  it("buildCameraInstruction 返回组合描述", () => {
    const result = buildCameraInstruction("close_up", "handheld", "85mm");
    expect(result).toContain("近景");
    expect(result).toContain("手持感");
    expect(result).toContain("85mm");
  });

  it("recommendCameraByMood 返回对应镜头", () => {
    expect(recommendCameraByMood("紧张")?.shotSize).toBe("close_up");
    expect(recommendCameraByMood("史诗")?.movement).toBe("crane");
    expect(recommendCameraByMood("未知情绪")).toBeNull();
  });
});

describe("lightingSkill", () => {
  it("matchers 含光照关键词", () => {
    expect(lightingSkill.matchers).toContain("光线");
    expect(lightingSkill.matchers).toContain("霓虹");
    expect(lightingSkill.matchers).toContain("黄金时刻");
  });

  it("buildInstructions 返回光照专项指令", () => {
    const instructions = lightingSkill.buildInstructions(ctx);
    expect(instructions).toContain("Lighting Skill");
    expect(instructions).toContain("光照类型");
    expect(instructions).toContain("氛围关键词");
  });

  it("buildInstructions 含氛围推荐（温馨）", () => {
    const ctx2: AgentContext = { userMessage: "温馨场景" };
    const instructions = lightingSkill.buildInstructions(ctx2);
    expect(instructions).toContain("当前推荐");
    expect(instructions).toContain("温馨");
    expect(instructions).toContain("golden_hour");
  });

  it("buildLightingInstruction 返回组合描述", () => {
    const result = buildLightingInstruction("neon", "紫蓝色");
    expect(result).toContain("霓虹光");
    expect(result).toContain("紫蓝色");
  });

  it("recommendLightingByMood 返回对应光照", () => {
    expect(recommendLightingByMood("温馨")?.type).toBe("golden_hour");
    expect(recommendLightingByMood("赛博朋克")?.type).toBe("neon");
    expect(recommendLightingByMood("未知")).toBeNull();
  });
});

describe("charactersSkill", () => {
  it("matchers 含角色关键词", () => {
    expect(charactersSkill.matchers).toContain("角色");
    expect(charactersSkill.matchers).toContain("站位");
    expect(charactersSkill.matchers).toContain("服装");
  });

  it("buildInstructions 返回角色专项指令", () => {
    const instructions = charactersSkill.buildInstructions(ctx);
    expect(instructions).toContain("Characters Skill");
    expect(instructions).toContain("单人镜头");
    expect(instructions).toContain("多人镜头");
    expect(instructions).toContain("冲突检测");
  });

  it("buildInstructions 含跨镜头一致性检查清单", () => {
    const instructions = charactersSkill.buildInstructions(ctx);
    expect(instructions).toContain("跨镜头一致性检查");
    expect(instructions).toContain("发型颜色");
    expect(instructions).toContain("服装款式");
  });

  it("detectCharacterConflicts 检测相同服装冲突", () => {
    const conflicts = detectCharacterConflicts([
      { name: "主角", identity: { referenceDescription: "20岁女性纤细", outfit: "白衬衫" } },
      { name: "配角", identity: { referenceDescription: "25岁男性高大", outfit: "白衬衫" } },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("same_outfit");
    expect(conflicts[0]!.characters).toContain("主角");
    expect(conflicts[0]!.characters).toContain("配角");
  });

  it("detectCharacterConflicts 检测身份模糊", () => {
    const conflicts = detectCharacterConflicts([
      { name: "路人", identity: { referenceDescription: "女孩" } },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.type).toBe("ambiguous_identity");
  });

  it("detectCharacterConflicts 无冲突时返回空数组", () => {
    const conflicts = detectCharacterConflicts([
      { name: "主角", identity: { referenceDescription: "20岁女性纤细身材", outfit: "红裙", hairstyle: "长发" } },
      { name: "配角", identity: { referenceDescription: "25岁男性高大身材", outfit: "蓝西装", hairstyle: "短发" } },
    ]);
    expect(conflicts).toHaveLength(0);
  });
});

describe("styleSkill", () => {
  it("matchers 含风格关键词", () => {
    expect(styleSkill.matchers).toContain("风格");
    expect(styleSkill.matchers).toContain("赛博朋克");
    expect(styleSkill.matchers).toContain("皮克斯");
  });

  it("buildInstructions 返回视觉风格专项指令", () => {
    const instructions = styleSkill.buildInstructions(ctx);
    expect(instructions).toContain("Style Skill");
    expect(instructions).toContain("核心视觉风格");
    expect(instructions).toContain("IP 风格安全改写");
  });

  it("buildInstructions 检测到 IP 风格借用时输出改写记录", () => {
    const ctx2: AgentContext = { userMessage: "皮克斯风格动画" };
    const instructions = styleSkill.buildInstructions(ctx2);
    expect(instructions).toContain("检测到 IP 风格借用");
    expect(instructions).toContain("皮克斯风格");
    expect(instructions).toContain("3D 动画渲染风格");
  });

  it("rewriteIpStyle 改写皮克斯风格", () => {
    const result = rewriteIpStyle("皮克斯风格的 3D 动画");
    expect(result.changes).toHaveLength(1);
    expect(result.rewritten).toContain("3D 动画渲染风格");
    expect(result.rewritten).not.toContain("皮克斯");
  });

  it("listSupportedStyles 返回 5 种核心风格", () => {
    const styles = listSupportedStyles();
    expect(styles).toHaveLength(5);
    expect(styles).toContain("cyberpunk");
    expect(styles).toContain("anime");
    expect(styles).toContain("realistic");
    expect(styles).toContain("ink_wash");
    expect(styles).toContain("cinematic");
  });

  it("buildStyleInstruction 返回组合描述", () => {
    const result = buildStyleInstruction("cyberpunk", "未来都市");
    expect(result).toContain("赛博朋克");
    expect(result).toContain("未来都市");
  });
});

describe("vfxSkill", () => {
  it("matchers 含特效关键词", () => {
    expect(vfxSkill.matchers).toContain("特效");
    expect(vfxSkill.matchers).toContain("火焰");
    expect(vfxSkill.matchers).toContain("爆炸");
  });

  it("buildInstructions 返回特效专项指令", () => {
    const instructions = vfxSkill.buildInstructions(ctx);
    expect(instructions).toContain("VFX Skill");
    expect(instructions).toContain("粒子特效");
    expect(instructions).toContain("破坏特效");
    expect(instructions).toContain("能量特效");
    expect(instructions).toContain("天气特效");
  });

  it("buildInstructions 检测到特效类别时输出当前检测", () => {
    const ctx2: AgentContext = { userMessage: "火焰和爆炸特效" };
    const instructions = vfxSkill.buildInstructions(ctx2);
    expect(instructions).toContain("当前检测");
    expect(instructions).toContain("particle");
    expect(instructions).toContain("destruction");
  });

  it("buildParticleEffect 返回粒子描述", () => {
    const result = buildParticleEffect("fire", "密集向上");
    expect(result).toContain("火焰");
    expect(result).toContain("密集向上");
  });

  it("buildWeatherEffect 返回天气描述", () => {
    const result = buildWeatherEffect("rainy");
    expect(result).toContain("雨天");
  });
});

describe("audioSkill", () => {
  it("matchers 含音频关键词", () => {
    expect(audioSkill.matchers).toContain("对白");
    expect(audioSkill.matchers).toContain("bgm");
    expect(audioSkill.matchers).toContain("音乐");
  });

  it("buildInstructions 返回音频专项指令", () => {
    const instructions = audioSkill.buildInstructions(ctx);
    expect(instructions).toContain("Audio Skill");
    expect(instructions).toContain("对白");
    expect(instructions).toContain("口型同步");
    expect(instructions).toContain("音乐");
    expect(instructions).toContain("环境");
  });

  it("buildInstructions 含语气和BGM风格描述表", () => {
    const instructions = audioSkill.buildInstructions(ctx);
    expect(instructions).toContain("温柔");
    expect(instructions).toContain("坚定");
    expect(instructions).toContain("史诗");
    expect(instructions).toContain("温馨钢琴");
  });

  it("buildAudioInstruction 构建完整音频指令", () => {
    const result = buildAudioInstruction({
      dialogue: { tone: "温柔", speed: "缓慢", emotion: "柔和" },
      music: { bgmStyle: "温馨", tempo: "慢板", emotion: "温暖" },
      environment: { ambient: "鸟鸣", atmosphere: "清晨" },
      lipSync: true,
    });
    expect(result).toContain("对白");
    expect(result).toContain("BGM");
    expect(result).toContain("环境");
    expect(result).toContain("口型同步");
  });
});
