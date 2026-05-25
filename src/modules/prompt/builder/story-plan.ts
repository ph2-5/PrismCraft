import type { Character, Scene } from "@/domain/schemas";
import { buildCharacterFullDesc, buildSceneAtmosphereDesc } from "../base";

interface StoryPlanParams {
  title: string;
  description: string;
  genre: string;
  tone: string;
  targetDuration: number;
  characters: Character[];
  scenes: Scene[];
}

export function generateStoryPlanPrompt(params: StoryPlanParams): string {
  const {
    title,
    description,
    genre,
    tone,
    targetDuration,
    characters,
    scenes,
  } = params;

  const genreGuide: Record<string, string> = {
    drama: "剧情片节奏：缓慢铺垫→矛盾激化→情感爆发→余韵收尾，注重人物内心变化",
    剧情: "剧情片节奏：缓慢铺垫→矛盾激化→情感爆发→余韵收尾，注重人物内心变化",
    comedy: "喜剧节奏：快速建立情境→误会叠加→笑点爆发→皆大欢喜，注重反差和意外",
    喜剧: "喜剧节奏：快速建立情境→误会叠加→笑点爆发→皆大欢喜，注重反差和意外",
    action: "动作片节奏：紧张开场→危机升级→高潮对决→胜利收尾，注重节奏感和视觉冲击",
    动作: "动作片节奏：紧张开场→危机升级→高潮对决→胜利收尾，注重节奏感和视觉冲击",
    thriller: "悬疑节奏：悬念设置→线索铺陈→反转揭秘→真相大白，注重信息控制和节奏把控",
    悬疑: "悬疑节奏：悬念设置→线索铺陈→反转揭秘→真相大白，注重信息控制和节奏把控",
    romance: "爱情节奏：相遇→相知→矛盾→和解，注重情感细腻和氛围营造",
    爱情: "爱情节奏：相遇→相知→矛盾→和解，注重情感细腻和氛围营造",
    scifi: "科幻节奏：世界观建立→科技展示→危机出现→解决突破，注重设定逻辑和想象力",
    科幻: "科幻节奏：世界观建立→科技展示→危机出现→解决突破，注重设定逻辑和想象力",
    fantasy: "奇幻节奏：异世界引入→冒险启程→试炼成长→终极对决，注重奇观展示和成长弧线",
    奇幻: "奇幻节奏：异世界引入→冒险启程→试炼成长→终极对决，注重奇观展示和成长弧线",
    horror: "恐怖节奏：不安铺垫→恐怖递增→惊吓爆发→余恐未消，注重氛围和节奏控制",
    恐怖: "恐怖节奏：不安铺垫→恐怖递增→惊吓爆发→余恐未消，注重氛围和节奏控制",
  };

  const toneGuide: Record<string, string> = {
    neutral: "中性基调，客观叙事",
    中性: "中性基调，客观叙事",
    light: "轻松明快，色彩明亮，节奏轻快",
    轻松: "轻松明快，色彩明亮，节奏轻快",
    warm: "温馨细腻，近景多，暖色调，情感充沛",
    温馨: "温馨细腻，近景多，暖色调，情感充沛",
    dark: "沉重压抑，暗色调，慢节奏，特写多",
    沉重: "沉重压抑，暗色调，慢节奏，特写多",
    epic: "宏大壮阔，大场景，史诗配乐感",
    史诗: "宏大壮阔，大场景，史诗配乐感",
    intimate: "温馨细腻，近景多，暖色调，情感充沛",
    humorous: "幽默诙谐，节奏轻快，夸张表现，反转频繁",
    幽默: "幽默诙谐，节奏轻快，夸张表现，反转频繁",
  };

  const charDescs = characters.length > 0
    ? `\n\n已有角色（请在规划中合理使用这些角色）：\n${characters.map((c) => `- ${c.name}：${buildCharacterFullDesc(c)}`).join("\n")}`
    : "";

  const sceneDescs = scenes.length > 0
    ? `\n\n已有场景（请在规划中合理使用这些场景）：\n${scenes.map((s) => `- ${s.name}（${s.type}）：${buildSceneAtmosphereDesc(s)}${s.description ? `，${s.description}` : ""}`).join("\n")}`
    : "";

  return `你是一位专业的动画分镜导演，请根据以下故事信息，规划一个逻辑完整的剧情结构。

故事标题：${title || "未命名"}
故事类型：${genre || "剧情"}
故事基调：${tone || "中性"}
故事简介：${description || "无"}
目标总时长：${targetDuration || 60} 秒
${charDescs}${sceneDescs}

类型节奏指导：${genreGuide[genre] || genreGuide.drama}
基调指导：${toneGuide[tone] || toneGuide.neutral}

重要说明：
- 每个镜头将生成独立的视频片段，然后按顺序拼接
- 请重点规划每个镜头的时长和排列顺序
- 所有镜头的 duration 总和必须等于目标总时长 ${targetDuration} 秒

请按照以下格式返回JSON数组，每个元素代表一个镜头：
[
  {
    "type": "scene" | "dialogue" | "action" | "transition" | "effect",
    "title": "镜头标题（简短有力）",
    "content": "详细描述（要非常具体，包含画面构图、角色动作、表情变化、台词、环境细节）",
    "duration": 秒数（整数）
  }
]

规划要求：
1. 剧情要有完整的起承转合逻辑结构
2. 镜头类型要多样化，根据类型节奏合理分配
3. 每个镜头的 duration 要合理：转场/特效2-3秒，对话3-5秒，动作/场景5-8秒
4. content 描述要详细具体，包含视觉、听觉、情感三个维度
5. 如果有已有角色，请使用角色名字并保持性格一致
6. 如果有已有场景，请在合适的地方引用这些场景
7. 镜头数量建议：${Math.max(4, Math.floor(targetDuration / 8))}-${Math.min(15, Math.ceil(targetDuration / 4))}个`;
}
