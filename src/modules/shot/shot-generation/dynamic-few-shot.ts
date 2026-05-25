import type { Character, Scene, StoryElement } from "@/domain/schemas";

export interface FewShotExample {
  input: {
    genre: string;
    tone: string;
    beatIndex: number;
    totalBeats: number;
    shotType?: string;
    hasDialogue?: boolean;
    hasAction?: boolean;
  };
  output: {
    title: string;
    content: string;
    shotType: string;
    cameraAngle: string;
    cameraMovement: string;
    duration: number;
    type: string;
  };
}

const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    input: { genre: "action", tone: "epic", beatIndex: 0, totalBeats: 8, hasAction: true },
    output: {
      title: "黎明破晓",
      content: "广袤的荒野上，朝阳从地平线升起，金色的光芒穿透薄雾。远处一座孤独的城镇轮廓逐渐清晰，风卷起沙尘掠过镜头。",
      shotType: "wide",
      cameraAngle: "eye_level",
      cameraMovement: "crane_up",
      duration: 5,
      type: "scene",
    },
  },
  {
    input: { genre: "action", tone: "epic", beatIndex: 2, totalBeats: 8, hasAction: true },
    output: {
      title: "对峙",
      content: "主角与对手面对面站立，目光如炬。风吹动两人的衣角，空气中弥漫着紧张的气氛。主角缓缓拔出武器，刀刃反射出冷光。",
      shotType: "medium",
      cameraAngle: "low",
      cameraMovement: "push",
      duration: 4,
      type: "action",
    },
  },
  {
    input: { genre: "action", tone: "epic", beatIndex: 5, totalBeats: 8, hasAction: true },
    output: {
      title: "绝地反击",
      content: "主角在劣势中突然爆发，一记重击将对手击退。镜头跟随主角的动作快速推进，捕捉每一个力量爆发的瞬间。",
      shotType: "close",
      cameraAngle: "low",
      cameraMovement: "tracking",
      duration: 3,
      type: "action",
    },
  },
  {
    input: { genre: "romance", tone: "intimate", beatIndex: 0, totalBeats: 6, hasDialogue: true },
    output: {
      title: "初遇",
      content: "午后的咖啡馆，阳光透过落地窗洒下斑驳光影。她低头翻阅书页，他推门而入，风铃轻响。两人目光偶然交汇，时间仿佛静止。",
      shotType: "medium",
      cameraAngle: "eye_level",
      cameraMovement: "push",
      duration: 6,
      type: "scene",
    },
  },
  {
    input: { genre: "romance", tone: "intimate", beatIndex: 3, totalBeats: 6, hasDialogue: true },
    output: {
      title: "心声",
      content: "她望着窗外的雨幕，轻声说出藏在心底的话。他沉默片刻，然后温柔地握住她的手。特写两人交握的手指，雨滴在窗上滑落。",
      shotType: "close",
      cameraAngle: "eye_level",
      cameraMovement: "static",
      duration: 5,
      type: "dialogue",
    },
  },
  {
    input: { genre: "mystery", tone: "dark", beatIndex: 0, totalBeats: 7 },
    output: {
      title: "深夜来电",
      content: "凌晨三点，手机屏幕在黑暗中亮起。主角接起电话，对面只有沉重的呼吸声。窗外霓虹灯闪烁，映照出主角紧张的面容。",
      shotType: "close",
      cameraAngle: "high",
      cameraMovement: "static",
      duration: 4,
      type: "scene",
    },
  },
  {
    input: { genre: "mystery", tone: "dark", beatIndex: 4, totalBeats: 7 },
    output: {
      title: "真相浮现",
      content: "主角翻阅旧档案，一张泛黄的照片从文件堆中滑落。照片上的日期与案件发生日完全吻合。镜头缓缓推向照片，揭示关键线索。",
      shotType: "extreme_close",
      cameraAngle: "eye_level",
      cameraMovement: "push",
      duration: 4,
      type: "action",
    },
  },
  {
    input: { genre: "comedy", tone: "light", beatIndex: 2, totalBeats: 5, hasDialogue: true },
    output: {
      title: "乌龙误会",
      content: "主角拿着花束满怀期待地走向对方，却认错了人。一个完全陌生的人接过花束，满脸困惑。主角尴尬地站在原地，周围人忍俊不禁。",
      shotType: "medium",
      cameraAngle: "eye_level",
      cameraMovement: "static",
      duration: 4,
      type: "dialogue",
    },
  },
  {
    input: { genre: "scifi", tone: "epic", beatIndex: 0, totalBeats: 8 },
    output: {
      title: "星际启航",
      content: "巨大的太空站悬浮在蓝色星球轨道上，飞船依次驶出 docking 端口。引擎喷射出蓝白色光焰，镜头从太空站全景推至驾驶舱内主角坚定的目光。",
      shotType: "wide",
      cameraAngle: "birds_eye",
      cameraMovement: "pull",
      duration: 6,
      type: "scene",
    },
  },
  {
    input: { genre: "fantasy", tone: "epic", beatIndex: 3, totalBeats: 8, hasAction: true },
    output: {
      title: "魔法觉醒",
      content: "主角双手爆发出耀眼的金色光芒，魔法符文在空中浮现旋转。周围的风暴被力量驱散，光芒照亮了整个战场。镜头环绕主角，展现力量觉醒的壮观场面。",
      shotType: "medium",
      cameraAngle: "low",
      cameraMovement: "orbit",
      duration: 4,
      type: "effect",
    },
  },
  {
    input: { genre: "drama", tone: "neutral", beatIndex: 0, totalBeats: 6 },
    output: {
      title: "日常开始",
      content: "清晨的街道，行人匆匆。主角走出公寓大门，深呼吸一口新鲜空气。镜头跟随主角的脚步，展现平凡而真实的城市生活。",
      shotType: "medium",
      cameraAngle: "eye_level",
      cameraMovement: "tracking",
      duration: 5,
      type: "scene",
    },
  },
  {
    input: { genre: "drama", tone: "dark", beatIndex: 4, totalBeats: 6, hasDialogue: true },
    output: {
      title: "崩溃边缘",
      content: "主角独自坐在昏暗的房间里，手中的信纸微微颤抖。泪水无声地滑落，打湿了纸上的字迹。镜头缓缓推向主角的面容，捕捉每一个细微的情感变化。",
      shotType: "close",
      cameraAngle: "eye_level",
      cameraMovement: "push",
      duration: 5,
      type: "dialogue",
    },
  },
];

function calculateRelevance(example: FewShotExample, context: {
  genre: string;
  tone: string;
  beatIndex: number;
  totalBeats: number;
  shotType?: string;
  hasDialogue?: boolean;
  hasAction?: boolean;
}): number {
  let score = 0;

  if (example.input.genre === context.genre) score += 3;
  if (example.input.tone === context.tone) score += 2;

  const positionDiff = Math.abs(
    (example.input.beatIndex / Math.max(example.input.totalBeats, 1)) -
    (context.beatIndex / Math.max(context.totalBeats, 1)),
  );
  score += Math.max(0, 2 - positionDiff * 4);

  if (context.shotType && example.input.shotType === context.shotType) score += 1;
  if (context.hasDialogue && example.input.hasDialogue) score += 1;
  if (context.hasAction && example.input.hasAction) score += 1;

  return score;
}

export function selectFewShotExamples(context: {
  genre: string;
  tone: string;
  beatIndex: number;
  totalBeats: number;
  shotType?: string;
  hasDialogue?: boolean;
  hasAction?: boolean;
}, count: number = 3): FewShotExample[] {
  const scored = FEW_SHOT_EXAMPLES.map(example => ({
    example,
    score: calculateRelevance(example, context),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, count).map(s => s.example);
}

export function buildFewShotPrompt(examples: FewShotExample[]): string {
  if (examples.length === 0) return "";

  const parts: string[] = [
    "以下是几个高质量的分镜示例，请参考其结构和详细程度：\n",
  ];

  examples.forEach((example, i) => {
    parts.push(`示例${i + 1}（${example.input.genre}/${example.input.tone}，第${example.input.beatIndex + 1}镜/共${example.input.totalBeats}镜）：`);
    parts.push(`  标题：${example.output.title}`);
    parts.push(`  内容：${example.output.content}`);
    parts.push(`  景别：${example.output.shotType} | 角度：${example.output.cameraAngle} | 运镜：${example.output.cameraMovement}`);
    parts.push(`  时长：${example.output.duration}秒 | 类型：${example.output.type}`);
    parts.push("");
  });

  parts.push("请按照以上示例的结构和详细程度生成分镜，确保：");
  parts.push("1. 每个分镜的内容描述具体、有画面感，包含视觉细节");
  parts.push("2. 镜头参数（景别、角度、运镜）与内容匹配");
  parts.push("3. 时长合理，动作镜头2-4秒，对话镜头4-6秒，场景镜头5-8秒");
  parts.push("4. 类型标注准确（action/dialogue/scene/transition/effect）");

  return parts.join("\n");
}

export function enrichPromptWithFewShot(
  basePrompt: string,
  context: {
    genre: string;
    tone: string;
    beatIndex: number;
    totalBeats: number;
    shotType?: string;
    hasDialogue?: boolean;
    hasAction?: boolean;
    characters?: Character[];
    scenes?: Scene[];
    elements?: StoryElement[];
  },
): string {
  const examples = selectFewShotExamples(context, 3);
  const fewShotSection = buildFewShotPrompt(examples);

  const characterSection = context.characters && context.characters.length > 0
    ? `\n已有角色：${context.characters.map(c => `${c.name}(${c.description?.slice(0, 50) || "无描述"})`).join("、")}`
    : "";

  const sceneSection = context.scenes && context.scenes.length > 0
    ? `\n已有场景：${context.scenes.map(s => `${s.name}(${s.description?.slice(0, 50) || "无描述"})`).join("、")}`
    : "";

  const elementSection = context.elements && context.elements.length > 0
    ? `\n已绑定元素：${context.elements.map(e => `${e.id}(${e.name})`).join("、")}`
    : "";

  return `${basePrompt}\n\n${fewShotSection}${characterSection}${sceneSection}${elementSection}`;
}
