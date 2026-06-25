// 快速模式视频模板
// 提供预设的视频生成模板

export interface VideoTemplate {
  id: string;
  name: string; // 兼容持久化（保留中文）
  nameKey: string; // UI 显示用 i18n key
  description: string; // 兼容持久化（保留中文）
  descKey: string; // UI 显示用 i18n key
  category: string; // 分类（兼容持久化，保留中文）
  categoryKey: string; // UI 显示用 i18n key
  prompt: string; // 基础提示词
  style: string; // 默认风格
  duration: number; // 默认时长
  imageDescription?: string; // 可选的参考图片描述（用于自动生成参考图）
}

// 所有模板
export const videoTemplates: VideoTemplate[] = [
  {
    id: "nature-landscape",
    name: "自然风光",
    nameKey: "videoTemplate.nature-landscape.name",
    description: "美丽的自然风景动画，如日出、海浪、森林等",
    descKey: "videoTemplate.nature-landscape.desc",
    category: "风景",
    categoryKey: "videoTemplate.nature-landscape.category",
    prompt: "美丽的自然风景，宁静祥和，画面唯美流畅，高质量4K动画",
    style: "cinematic",
    duration: 8,
    imageDescription: "日出时的海边风景，金色阳光洒在海面上，远处有山脉"
  },
  {
    id: "city-night",
    name: "城市夜景",
    nameKey: "videoTemplate.city-night.name",
    description: "繁华都市夜景，霓虹闪烁的都市风光",
    descKey: "videoTemplate.city-night.desc",
    category: "风景",
    categoryKey: "videoTemplate.city-night.category",
    prompt: "现代都市夜景，霓虹灯闪烁，车水马龙，繁华热闹，赛博朋克风格，高质量4K动画",
    style: "cyberpunk",
    duration: 8,
    imageDescription: "赛博朋克风格的都市夜景，高楼大厦上有霓虹广告"
  },
  {
    id: "character-walk",
    name: "角色漫步",
    nameKey: "videoTemplate.character-walk.name",
    description: "一个角色在场景中悠闲地行走",
    descKey: "videoTemplate.character-walk.desc",
    category: "角色",
    categoryKey: "videoTemplate.character-walk.category",
    prompt: "一个可爱的卡通角色在美丽的场景中悠闲地漫步，画面流畅自然，生动可爱，高质量4K动画",
    style: "卡通",
    duration: 6,
    imageDescription: "可爱的卡通角色站在公园草地上，背景是蓝天白云"
  },
  {
    id: "fantasy-castle",
    name: "奇幻城堡",
    nameKey: "videoTemplate.fantasy-castle.name",
    description: "魔法奇幻风格的城堡场景",
    descKey: "videoTemplate.fantasy-castle.desc",
    category: "奇幻",
    categoryKey: "videoTemplate.fantasy-castle.category",
    prompt: "壮观的奇幻城堡，有魔法效果，童话风格，温馨浪漫，高质量4K动画",
    style: "奇幻",
    duration: 10,
    imageDescription: "童话风格的奇幻城堡，周围有彩虹和魔法光芒"
  },
  {
    id: "product-showcase",
    name: "产品展示",
    nameKey: "videoTemplate.product-showcase.name",
    description: "适合展示产品或概念的优雅动画",
    descKey: "videoTemplate.product-showcase.desc",
    category: "商业",
    categoryKey: "videoTemplate.product-showcase.category",
    prompt: "优雅的产品展示动画，高端大气，流畅专业，高质量4K动画",
    style: "艺术",
    duration: 6,
    imageDescription: "简约现代风格的产品展示场景，有优雅的光线"
  },
  {
    id: "abstract-art",
    name: "抽象艺术",
    nameKey: "videoTemplate.abstract-art.name",
    description: "抽象艺术风格的动态视觉动画",
    descKey: "videoTemplate.abstract-art.desc",
    category: "艺术",
    categoryKey: "videoTemplate.abstract-art.category",
    prompt: "抽象艺术风格的视觉动画，色彩斑斓，流动变幻，创意艺术，高质量4K动画",
    style: "艺术",
    duration: 8,
    imageDescription: "抽象艺术风格的彩色图案，色彩流动，视觉震撼"
  },
  {
    id: "romantic-moment",
    name: "浪漫时刻",
    nameKey: "videoTemplate.romantic-moment.name",
    description: "温馨浪漫的场景，适合表达情感",
    descKey: "videoTemplate.romantic-moment.desc",
    category: "情感",
    categoryKey: "videoTemplate.romantic-moment.category",
    prompt: "温馨浪漫的场景，柔和的光线，唯美动人，充满爱意，高质量4K动画",
    style: "浪漫",
    duration: 8,
    imageDescription: "浪漫的黄昏场景，有两个人影和温暖的灯光"
  },
  {
    id: "space-travel",
    name: "太空漫游",
    nameKey: "videoTemplate.space-travel.name",
    description: "宇宙太空科幻风格的动画",
    descKey: "videoTemplate.space-travel.desc",
    category: "科幻",
    categoryKey: "videoTemplate.space-travel.category",
    prompt: "壮观的太空场景，宇宙星空，科幻未来感，高质量4K动画",
    style: "科幻",
    duration: 10,
    imageDescription: "宇宙星空场景，有行星、星云和科幻飞船"
  },
  {
    id: "pet-animals",
    name: "可爱宠物",
    nameKey: "videoTemplate.pet-animals.name",
    description: "可爱宠物或动物的动画",
    descKey: "videoTemplate.pet-animals.desc",
    category: "角色",
    categoryKey: "videoTemplate.pet-animals.category",
    prompt: "可爱的宠物或动物动画，生动活泼，萌趣治愈，高质量4K动画",
    style: "卡通",
    duration: 6,
    imageDescription: "一只可爱的白色小猫咪在草地上玩耍"
  },
  {
    id: "seasonal",
    name: "四季变换",
    nameKey: "videoTemplate.seasonal.name",
    description: "美丽的季节场景，如秋天落叶、冬日雪景等",
    descKey: "videoTemplate.seasonal.desc",
    category: "风景",
    categoryKey: "videoTemplate.seasonal.category",
    prompt: "美丽的季节风景，诗意唯美，画面动人，高质量4K动画",
    style: "诗意",
    duration: 8,
    imageDescription: "秋天的公园，金黄的落叶飘落，阳光温暖"
  }
];

// 分类列表
export const templateCategories = [
  { id: "all", name: "全部", nameKey: "videoTemplateCategory.all" },
  { id: "风景", name: "风景", nameKey: "videoTemplateCategory.scenery" },
  { id: "角色", name: "角色", nameKey: "videoTemplateCategory.character" },
  { id: "奇幻", name: "奇幻", nameKey: "videoTemplateCategory.fantasy" },
  { id: "商业", name: "商业", nameKey: "videoTemplateCategory.business" },
  { id: "艺术", name: "艺术", nameKey: "videoTemplateCategory.art" },
  { id: "情感", name: "情感", nameKey: "videoTemplateCategory.emotion" },
  { id: "科幻", name: "科幻", nameKey: "videoTemplateCategory.scifi" }
];

// 按分类获取模板
export function getTemplatesByCategory(category: string): VideoTemplate[] {
  if (category === "all") {
    return videoTemplates;
  }
  return videoTemplates.filter(template => template.category === category);
}

// 应用模板
export function applyVideoTemplate(template: VideoTemplate): {
  prompt: string;
  duration: number;
  style: string;
} {
  return {
    prompt: template.prompt,
    duration: template.duration,
    style: template.style
  };
}
