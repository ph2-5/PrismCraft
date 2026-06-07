// 故事模板系统
// 根据类型和基调提供预设的故事结构

// 模板中的基础镜头类型（不需要完整 StoryBeat 字段）
interface TemplateBeat {
  type: "action" | "dialogue" | "scene" | "transition" | "effect";
  title: string;
  content: string;
  duration: number;
}

export interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  genre: string[]; // 适用的故事类型
  tone: string[];  // 适用的基调
  beats: TemplateBeat[];
}

// 经典三幕式结构
const threeActStructure: StoryTemplate = {
  id: "three-act",
  name: "经典三幕式",
  description: "传统的故事结构：铺垫-冲突-解决",
  genre: ["drama", "action", "romance", "mystery", "scifi", "fantasy"],
  tone: ["light", "neutral", "dark", "epic"],
  beats: [
    { type: "scene", title: "开场", content: "展示主角的日常生活，建立背景", duration: 5 },
    { type: "action", title: "触发事件", content: "打破平静的事件发生", duration: 3 },
    { type: "dialogue", title: "反应", content: "主角对事件的反应和决定", duration: 4 },
    { type: "transition", title: "进入新世界", content: "场景转换到新的环境", duration: 2 },
    { type: "scene", title: "冲突升级", content: "主角面临更大的挑战", duration: 6 },
    { type: "action", title: "中点转折", content: "故事发生重大转折", duration: 4 },
    { type: "dialogue", title: "低谷时刻", content: "主角陷入绝望或困境", duration: 5 },
    { type: "action", title: "觉醒与准备", content: "主角重新振作，准备反击", duration: 4 },
    { type: "scene", title: "高潮对决", content: "最终冲突爆发", duration: 8 },
    { type: "effect", title: "高潮特效", content: "高潮时刻的视觉特效", duration: 3 },
    { type: "scene", title: "结局", content: "冲突解决，展示新状态", duration: 5 },
    { type: "transition", title: "收尾", content: "故事结束，回到平静或新的开始", duration: 2 },
  ],
};

// 英雄之旅
const heroJourney: StoryTemplate = {
  id: "hero-journey",
  name: "英雄之旅",
  description: "经典的英雄成长故事结构",
  genre: ["fantasy", "action", "scifi"],
  tone: ["epic", "neutral", "dark"],
  beats: [
    { type: "scene", title: "平凡世界", content: "主角在熟悉的环境中", duration: 4 },
    { type: "action", title: "冒险召唤", content: "出现需要主角行动的事件", duration: 3 },
    { type: "dialogue", title: "拒绝召唤", content: "主角犹豫或拒绝", duration: 3 },
    { type: "scene", title: "遇见导师", content: "获得指引或力量", duration: 4 },
    { type: "transition", title: "跨越门槛", content: "离开舒适区，进入未知", duration: 2 },
    { type: "scene", title: "试炼之路", content: "面对一系列挑战", duration: 6 },
    { type: "action", title: "盟友与敌人", content: "结识伙伴，遭遇对手", duration: 5 },
    { type: "scene", title: "深入洞穴", content: "面对最大的恐惧或挑战", duration: 6 },
    { type: "action", title: "终极考验", content: "生死攸关的决战", duration: 7 },
    { type: "effect", title: "奖励时刻", content: "获得宝物或领悟", duration: 3 },
    { type: "transition", title: "归途", content: "带着收获返回", duration: 3 },
    { type: "scene", title: "重生", content: "主角完成蜕变", duration: 4 },
    { type: "scene", title: "带着灵药归来", content: "将收获带回世界", duration: 4 },
  ],
};

// 喜剧结构
const comedyStructure: StoryTemplate = {
  id: "comedy",
  name: "喜剧结构",
  description: "轻松幽默的故事节奏",
  genre: ["comedy", "romance"],
  tone: ["light", "intimate"],
  beats: [
    { type: "scene", title: "日常笑话", content: "展示角色的有趣日常", duration: 4 },
    { type: "action", title: "误会开始", content: "产生有趣的误会或意外", duration: 3 },
    { type: "dialogue", title: "幽默对话", content: "角色间的搞笑互动", duration: 5 },
    { type: "scene", title: "情况恶化", content: "误会或问题升级", duration: 4 },
    { type: "action", title: "荒诞场景", content: "出现荒诞可笑的情况", duration: 5 },
    { type: "dialogue", title: "互相吐槽", content: "角色间的幽默吐槽", duration: 4 },
    { type: "scene", title: "混乱高潮", content: "所有误会集中爆发", duration: 6 },
    { type: "effect", title: "搞笑特效", content: "夸张的视觉效果", duration: 2 },
    { type: "dialogue", title: "真相大白", content: "误会解除，大家释然", duration: 4 },
    { type: "scene", title: "欢乐结局", content: "大团圆结局", duration: 4 },
  ],
};

// 悬疑推理
const mysteryStructure: StoryTemplate = {
  id: "mystery",
  name: "悬疑推理",
  description: "层层递进的推理故事",
  genre: ["mystery", "horror"],
  tone: ["dark", "neutral"],
  beats: [
    { type: "scene", title: "谜团出现", content: "神秘事件或案件发生", duration: 5 },
    { type: "action", title: "初步调查", content: "收集线索，发现疑点", duration: 4 },
    { type: "scene", title: "第一个线索", content: "发现重要线索", duration: 4 },
    { type: "dialogue", title: "询问证人", content: "与相关人员对话", duration: 5 },
    { type: "action", title: "红鲱鱼", content: "误导性的线索", duration: 4 },
    { type: "scene", title: "危险逼近", content: "发现真相或遭遇威胁", duration: 5 },
    { type: "transition", title: "紧张时刻", content: "氛围转换", duration: 2 },
    { type: "action", title: "关键突破", content: "找到决定性证据", duration: 4 },
    { type: "dialogue", title: "推理过程", content: "还原真相的推理", duration: 6 },
    { type: "scene", title: "真相揭露", content: "谜底揭晓", duration: 5 },
    { type: "effect", title: "震撼时刻", content: "真相的视觉呈现", duration: 3 },
    { type: "scene", title: "收尾", content: "案件结束，反思", duration: 4 },
  ],
};

// 爱情故事
const romanceStructure: StoryTemplate = {
  id: "romance",
  name: "爱情故事",
  description: "浪漫的爱情发展弧线",
  genre: ["romance", "drama"],
  tone: ["light", "intimate", "neutral"],
  beats: [
    { type: "scene", title: "初次相遇", content: "两个主角第一次见面", duration: 4 },
    { type: "dialogue", title: "第一印象", content: "彼此留下印象的对话", duration: 4 },
    { type: "scene", title: "逐渐靠近", content: "更多接触和了解", duration: 5 },
    { type: "action", title: "心动时刻", content: "产生浪漫情愫的场景", duration: 4 },
    { type: "dialogue", title: "甜蜜互动", content: "暧昧或甜蜜的对话", duration: 5 },
    { type: "scene", title: "障碍出现", content: "外部或内部的阻碍", duration: 5 },
    { type: "dialogue", title: "误会或分离", content: "产生隔阂", duration: 4 },
    { type: "scene", title: "思念", content: "分开后的想念", duration: 4 },
    { type: "action", title: "重逢", content: "再次相遇", duration: 3 },
    { type: "dialogue", title: "表白", content: "表达真实感情", duration: 5 },
    { type: "effect", title: "浪漫时刻", content: "浪漫的视觉效果", duration: 3 },
    { type: "scene", title: "幸福结局", content: "在一起或美好回忆", duration: 5 },
  ],
};

// 恐怖惊悚
const horrorStructure: StoryTemplate = {
  id: "horror",
  name: "恐怖惊悚",
  description: "营造恐惧和紧张氛围",
  genre: ["horror", "mystery"],
  tone: ["dark"],
  beats: [
    { type: "scene", title: "平静开端", content: "看似正常的日常", duration: 4 },
    { type: "action", title: "异常迹象", content: "细微的不对劲", duration: 3 },
    { type: "scene", title: "不安升级", content: "奇怪的事情接连发生", duration: 4 },
    { type: "effect", title: "惊吓点1", content: "第一次惊吓", duration: 2 },
    { type: "dialogue", title: "怀疑与否认", content: "角色试图解释异常", duration: 4 },
    { type: "scene", title: "真相逼近", content: "发现恐怖真相", duration: 5 },
    { type: "effect", title: "惊吓点2", content: "更大的惊吓", duration: 2 },
    { type: "action", title: "逃亡或对抗", content: "与恐怖元素对抗", duration: 6 },
    { type: "scene", title: "绝望时刻", content: "似乎无路可逃", duration: 4 },
    { type: "effect", title: "高潮恐怖", content: "最恐怖的场景", duration: 3 },
    { type: "scene", title: "结局", content: "开放式或悲剧结局", duration: 4 },
  ],
};

// 所有模板
export const storyTemplates: StoryTemplate[] = [
  threeActStructure,
  heroJourney,
  comedyStructure,
  mysteryStructure,
  romanceStructure,
  horrorStructure,
];

// 根据类型和基调获取推荐模板
export function getRecommendedTemplates(genre: string, tone: string): StoryTemplate[] {
  return storyTemplates.filter(
    template => 
      template.genre.includes(genre) && 
      template.tone.includes(tone)
  );
}

// 应用模板生成 beats
import type { StoryBeat } from "@/domain/schemas";

export function applyTemplate(
  template: StoryTemplate, 
  characters: string[] = [], 
  scenes: string[] = []
): StoryBeat[] {
  return template.beats.map((beat, index) => ({
    ...beat,
    id: `${template.id}-beat-${index}-${Date.now()}`,
    sequence: index + 1,
    order: index + 1,
    description: beat.content || "",
    characters: beat.type === "dialogue" && characters.length > 0 
      ? [characters[0]!] 
      : [],
    elementIds: [],
    characterIds: [],
    enhancedGeneration: false,
    scene: beat.type === "scene" && scenes.length > 0 
      ? scenes[0]! 
      : undefined,
    character: undefined,
    sceneId: undefined,
    generationPrompt: undefined,
    imageGenerationPrompt: undefined,
    firstFramePrompt: undefined,
    lastFramePrompt: undefined,
    transition: undefined,
    imageUrl: undefined,
    videoReferenceUrl: undefined,
    uploadedKeyframe: undefined,
    uploadedVideo: undefined,
    customChainTarget: undefined,
  }));
}

// 获取模板预览（前3个镜头）
export function getTemplatePreview(template: StoryTemplate): string {
  const preview = template.beats.slice(0, 3).map(b => b.title).join(" → ");
  return `${preview}...`;
}
