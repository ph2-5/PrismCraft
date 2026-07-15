/**
 * Style Skill — 视觉风格指令构建器（无 IP 借用）（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-style SKILL 模式。
 *
 * 触发场景：用户消息含风格相关关键词（风格/赛博朋克/日系/写实/水墨/电影质感等）。
 * 行为：构建视觉风格指令片段，覆盖 5 种核心风格 + 安全改写（避免直接借用 IP）。
 *
 * 安全改写规则（与 safety/ip-rewriter.ts 配合）：
 * - "皮克斯风格" → "3D 动画渲染风格"
 * - "宫崎骏风格" → "手绘动画风格"
 * - "漫威式" → "超级英雄电影式"
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

import type { AgentContext, Skill } from "./index";
import type { VisualStyle } from "./extended-types";

// === 视觉风格描述表 ===
const STYLE_DESCRIPTIONS: Record<VisualStyle, string> = {
  cyberpunk: "赛博朋克（霓虹色彩，高科技低生活，未来都市感）",
  anime: "日系动画（赛璐珞画风，明亮色彩，简化阴影）",
  realistic: "写实（照片级真实感，自然光影，细节丰富）",
  ink_wash: "水墨（中国传统画风，黑白灰层次，留白意境）",
  cinematic: "电影质感（宽屏构图，胶片色彩，景深虚化）",
};

// === IP 风格 → 安全改写映射 ===
// 这些条目与 ip-rewriter.ts 的 IP_DATABASE 重叠，但本表只关注"风格借用"场景
const IP_STYLE_REWRITES: Record<string, string> = {
  皮克斯风格: "3D 动画渲染风格",
  迪士尼风格: "经典动画风格",
  宫崎骏风格: "手绘动画风格",
  吉卜力风格: "手绘动画风格",
  漫威式: "超级英雄电影式",
  "DC式": "超级英雄漫画式",
  龙珠风格: "热血格斗动漫式",
  海贼王风格: "海洋冒险动漫式",
};

export const styleSkill: Skill = {
  id: "style",
  matchers: [
    "风格",
    "赛博朋克",
    "日系",
    "写实",
    "水墨",
    "电影质感",
    "皮克斯",
    "迪士尼",
    "宫崎骏",
    "吉卜力",
    "漫威",
    "style",
    "anime",
    "realistic",
  ],

  buildInstructions(ctx: AgentContext): string {
    const detectedRewrites = detectIpStyleRewrites(ctx.userMessage);

    return [
      "## 视觉风格专项指令（Style Skill）",
      "",
      "本片段构建视觉风格指令，覆盖 5 种核心风格 + IP 风格安全改写。",
      "",
      "### 核心视觉风格（VisualStyle）",
      ...Object.entries(STYLE_DESCRIPTIONS).map(([k, v]) => `- ${k}：${v}`),
      "",
      "### IP 风格安全改写（避免直接借用 IP）",
      "以下 IP 风格关键词会被自动改写为等价的安全描述：",
      ...Object.entries(IP_STYLE_REWRITES).map(
        ([ip, safe]) => `- 「${ip}」 → 「${safe}」`,
      ),
      "",
      "### 构建规则",
      "- 一个镜头只用 1 种主风格（避免风格冲突）",
      "- 风格关键词不超过 2 个（如「写实，电影质感」可接受）",
      "- 涉及 IP 风格时必须改写（如「皮克斯风格」→「3D 动画渲染风格」）",
      "- 风格需与情绪匹配：紧张→赛博朋克；温馨→日系动画；史诗→电影质感",
      "- 输出格式：「风格关键词」如「赛博朋克」或「写实，电影质感」",
      detectedRewrites.length > 0
        ? `\n### 检测到 IP 风格借用\n用户消息中含以下 IP 风格关键词，已自动改写：\n${detectedRewrites.map((r) => `- 「${r.original}」 → 「${r.rewritten}」`).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");
  },
};

function detectIpStyleRewrites(
  message: string,
): Array<{ original: string; rewritten: string }> {
  const result: Array<{ original: string; rewritten: string }> = [];
  for (const [ip, safe] of Object.entries(IP_STYLE_REWRITES)) {
    if (message.includes(ip)) {
      result.push({ original: ip, rewritten: safe });
    }
  }
  return result;
}

// === 导出构建函数 ===

export function buildStyleInstruction(style: VisualStyle, supplement?: string): string {
  const base = STYLE_DESCRIPTIONS[style];
  return supplement ? `${base}，${supplement}` : base;
}

export function rewriteIpStyle(input: string): {
  rewritten: string;
  changes: Array<{ original: string; rewritten: string }>;
} {
  const changes: Array<{ original: string; rewritten: string }> = [];
  let rewritten = input;
  // 按 key 长度降序处理
  const keys = Object.keys(IP_STYLE_REWRITES).sort((a, b) => b.length - a.length);
  for (const ip of keys) {
    if (rewritten.includes(ip)) {
      const safe = IP_STYLE_REWRITES[ip];
      if (safe === undefined) continue;
      changes.push({ original: ip, rewritten: safe });
      rewritten = rewritten.split(ip).join(safe);
    }
  }
  return { rewritten, changes };
}

export function listSupportedStyles(): VisualStyle[] {
  return Object.keys(STYLE_DESCRIPTIONS) as VisualStyle[];
}
