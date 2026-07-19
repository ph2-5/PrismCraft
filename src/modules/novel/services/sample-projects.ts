/**
 * Task 2A.16 — 示例项目数据
 *
 * 3 个示例项目（科幻/古装/现代各一个），用于 OnboardingGuide 的"加载示例项目"入口。
 * 用户打开即可看到一个完整故事的组织方式，降低学习曲线。
 *
 * 每个示例包含：
 * - rawText: 故事文本（约 800-1200 字）
 * - segments: 预置段落（2-3 个）
 * - characters: 预置角色（2-3 个）
 * - scenes: 预置场景（2 个）
 *
 * 依赖方向：仅依赖同模块 domain/types（NovelSegment/CharacterInPipeline/SceneInPipeline）
 */

import type {
  NovelSegment,
  CharacterInPipeline,
  SceneInPipeline,
} from "../domain/types";

/** 示例项目数据结构 */
export interface SampleProject {
  /** 项目唯一 ID */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目类型（用于图标显示） */
  genre: "scifi" | "period" | "modern";
  /** 简短描述 */
  description: string;
  /** 故事文本 */
  rawText: string;
  /** 预置段落 */
  segments: NovelSegment[];
  /** 预置角色 */
  characters: CharacterInPipeline[];
  /** 预置场景 */
  scenes: SceneInPipeline[];
}

// ============================================================================
// 示例 1：科幻 — 星际信使
// ============================================================================

const scifiSegments: NovelSegment[] = [
  {
    id: "seg-scifi-1",
    title: "信号降临",
    summary: "林辰在空间站值班时收到来自未知星系的信号",
    startChar: 0,
    endChar: 280,
    estimatedDuration: 8,
    keyEvents: ["收到异常信号", "信号解析为图像"],
    text: `2147 年，银河边缘的守望者空间站。林辰独自坐在控制台前，屏幕上的数据流如常流淌。突然，一道从未见过的频率切入通讯频道。他坐直了身子，手指飞快地敲击键盘——这不是已知的任何星际信号。信号解码后，呈现出一幅图像：一个倒置的三角形，内含旋转的星辰。林辰屏住呼吸，这是人类等待了三百年的回音。`,
  },
  {
    id: "seg-scifi-2",
    title: "决策时刻",
    summary: "林辰面临是否回复的关键抉择",
    startChar: 280,
    endChar: 560,
    estimatedDuration: 10,
    keyEvents: ["联系地球指挥中心", "决定自行回复"],
    text: `指挥中心的回复需要四小时。林辰盯着倒计时——信号的发射源正在以惊人的速度接近太阳系。如果他等待指令，可能错过唯一的窗口期。他想起导师的话："探索的本质是承担风险。"深吸一口气，他按下了回复键。一道包含人类基因序列和地球坐标的信号射向深空。空间站的灯光在这一刻显得格外孤独。`,
  },
  {
    id: "seg-scifi-3",
    title: "回音",
    summary: "回复信号后，林辰收到了对方的回应",
    startChar: 560,
    endChar: 800,
    estimatedDuration: 7,
    keyEvents: ["收到回应信号", "画面定格"],
    text: `十分钟后，回应来了。不再是抽象的几何图形，而是一段影像：一个类人生物，皮肤呈银灰色，眼睛如深邃的星云。它缓缓抬起手，做出一个林辰从未见过的手势——既像问候，也像警告。屏幕上的翻译系统开始解析，逐字显示："我们...来了...准备好了吗？"林辰望着窗外漆黑的宇宙，第一次感到，宇宙不再是沉默的。`,
  },
];

const scifiCharacters: CharacterInPipeline[] = [
  {
    tempId: "char-scifi-1",
    name: "林辰",
    gender: "男",
    age: 32,
    description: "守望者空间站值班员，独自值守银河边缘的监测任务",
    appearance: {
      hairColor: "黑色",
      hairStyle: "短发",
      eyeColor: "深棕色",
      height: "178cm",
      build: "瘦削",
      clothing: "深蓝色空间站制服",
    },
    personality: ["冷静", "果断", "好奇心强"],
    firstAppearance: "第一段",
    status: "new",
    confirmed: false,
    variants: [],
  },
];

const scifiScenes: SceneInPipeline[] = [
  {
    tempId: "scene-scifi-1",
    name: "守望者空间站控制室",
    type: "室内",
    description: "圆形控制室，环绕式屏幕，冷色调照明",
    atmosphere: "孤寂、科技感",
    timeOfDay: "深夜",
    location: "银河边缘空间站",
    status: "new",
    confirmed: false,
    variants: [],
  },
];

const scifiRawText = scifiSegments.map((s) => s.text).join("\n\n");

// ============================================================================
// 示例 2：古装 — 江湖夜雨
// ============================================================================

const periodSegments: NovelSegment[] = [
  {
    id: "seg-period-1",
    title: "夜宿客栈",
    summary: "侠客沈云投宿小镇客栈，遇神秘女子",
    startChar: 0,
    endChar: 240,
    estimatedDuration: 8,
    keyEvents: ["入住客栈", "遇到神秘女子"],
    text: `秋雨连绵，沈云策马赶了三十里路，终于在暮色中望见小镇的灯火。客栈的招牌已被风雨侵蚀得看不清字迹，但透出的暖光让他心头一暖。他推门而入，店内只有一位客人——青衣女子独坐窗边，面前一壶清酒，半盏残茶。她抬眼看了沈云一眼，那目光清冷如秋水，让他不自觉地按住了腰间的剑。`,
  },
  {
    id: "seg-period-2",
    title: "夜话江湖",
    summary: "沈云与女子交谈，得知她是被追杀的官家之女",
    startChar: 240,
    endChar: 520,
    estimatedDuration: 10,
    keyEvents: ["女子道出身份", "追兵将至"],
    text: `"敢问姑娘深夜独行，可是有要事？"沈云终于开口。女子淡淡一笑："侠士看得出，我并非寻常女子。"她自称姓苏，父亲是朝中被冤屈的清官，如今满门遭难，她是唯一的幸存者。话音未落，窗外传来马蹄声——追兵已至。沈云握紧剑柄，望向窗外漆黑的雨幕。江湖儿女，本不该问是非，但这一刻，他知道自己无法袖手。`,
  },
  {
    id: "seg-period-3",
    title: "雨夜激战",
    summary: "沈云与追兵在雨夜激战，护送苏姑娘离开",
    startChar: 520,
    endChar: 800,
    estimatedDuration: 12,
    keyEvents: ["雨夜激战", "护送苏姑娘离开"],
    text: `客栈的木门被踹开，三个黑衣人持刀闯入。沈云长剑出鞘，剑光在烛火中划出冷冽的弧线。雨水顺着屋檐倾泻，与刀剑相击的火花交织。苏姑娘退至墙角，神色镇定地观察战局。一炷香后，三人倒地。沈云甩去剑上血珠，转身对苏姑娘说："跟我走，天亮前离开此地。"雨势渐小，两人的身影消失在通往南方的山道上。`,
  },
];

const periodCharacters: CharacterInPipeline[] = [
  {
    tempId: "char-period-1",
    name: "沈云",
    gender: "男",
    age: 28,
    description: "江湖游侠，剑术精湛，性格豪爽重义",
    appearance: {
      hairColor: "黑色",
      hairStyle: "束发",
      eyeColor: "深黑色",
      height: "180cm",
      build: "矫健",
      clothing: "青色长袍，腰佩长剑",
    },
    personality: ["豪爽", "重义", "机警"],
    firstAppearance: "第一段",
    status: "new",
    confirmed: false,
    variants: [],
  },
  {
    tempId: "char-period-2",
    name: "苏姑娘",
    gender: "女",
    age: 22,
    description: "被追杀的官家之女，举止端庄，临危不乱",
    appearance: {
      hairColor: "黑色",
      hairStyle: "盘发",
      eyeColor: "清亮",
      height: "165cm",
      build: "纤瘦",
      clothing: "青色衣裙",
    },
    personality: ["端庄", "聪慧", "坚强"],
    firstAppearance: "第一段",
    status: "new",
    confirmed: false,
    variants: [],
  },
];

const periodScenes: SceneInPipeline[] = [
  {
    tempId: "scene-period-1",
    name: "古镇客栈",
    type: "室内",
    description: "木质结构的客栈大堂，烛火摇曳，雨声淅沥",
    atmosphere: "古朴、雨夜氛围",
    timeOfDay: "夜晚",
    location: "南方小镇",
    status: "new",
    confirmed: false,
    variants: [],
  },
];

const periodRawText = periodSegments.map((s) => s.text).join("\n\n");

// ============================================================================
// 示例 3：现代 — 咖啡馆之约
// ============================================================================

const modernSegments: NovelSegment[] = [
  {
    id: "seg-modern-1",
    title: "咖啡馆重逢",
    summary: "陈晓在咖啡馆偶遇大学初恋李然",
    startChar: 0,
    endChar: 260,
    estimatedDuration: 7,
    keyEvents: ["咖啡馆偶遇", "认出对方"],
    text: `周五下午，陈晓推开了街角咖啡馆的门。风铃轻响，咖啡香扑面而来。她正低头看手机，一个熟悉的声音让她猛地抬头："陈晓？真的是你？"吧台后站着一个男人，围着围裙，笑容有些局促——是李然，她大学时的初恋。五年未见，他的眉眼依旧，只是眼角多了几道纹路。陈晓张了张嘴，一时竟说不出话来。`,
  },
  {
    id: "seg-modern-2",
    title: "旧事重提",
    summary: "两人坐下聊天，谈起当年的误会",
    startChar: 260,
    endChar: 540,
    estimatedDuration: 9,
    keyEvents: ["坐下聊天", "解开当年误会"],
    text: `李然让同事顶班，端着两杯拿铁坐到陈晓对面。窗外的梧桐叶被风吹得沙沙作响。"你...怎么会在这里开店？"陈晓小心翼翼地问。李然笑了笑："毕业后去了北京，做了三年金融，后来母亲生病，就回来开了这家店。"他顿了顿，"其实，当年我去北京，是因为你选了上海。"陈晓怔住了——原来他一直以为是她要先分开。`,
  },
  {
    id: "seg-modern-3",
    title: "重新开始",
    summary: "两人决定给彼此一次机会",
    startChar: 540,
    endChar: 800,
    estimatedDuration: 8,
    keyEvents: ["决定重新开始", "咖啡馆落幕"],
    text: `夕阳西下，咖啡馆的客人陆续离开。两人从下午聊到黄昏，仿佛要把五年的空白一次填满。李然忽然说："晓晓，如果...我是说如果，我们还来得及吗？"陈晓望着他认真的眼睛，心底某个角落轻轻地柔软下来。她伸出手，覆盖住他放在桌上的手："也许，这次我们可以试试。"风铃再次响起，是最后一桌客人离开。咖啡馆的灯光在这个黄昏显得格外温暖。`,
  },
];

const modernCharacters: CharacterInPipeline[] = [
  {
    tempId: "char-modern-1",
    name: "陈晓",
    gender: "女",
    age: 28,
    description: "广告公司文案策划，性格温和细腻",
    appearance: {
      hairColor: "栗色",
      hairStyle: "中长直发",
      eyeColor: "深棕色",
      height: "165cm",
      build: "中等",
      clothing: "米色风衣，简约风格",
    },
    personality: ["温和", "细腻", "念旧"],
    firstAppearance: "第一段",
    status: "new",
    confirmed: false,
    variants: [],
  },
  {
    tempId: "char-modern-2",
    name: "李然",
    gender: "男",
    age: 29,
    description: "前金融从业者，现为咖啡馆老板，陈晓大学初恋",
    appearance: {
      hairColor: "黑色",
      hairStyle: "短发",
      eyeColor: "深黑色",
      height: "178cm",
      build: "中等",
      clothing: "围裙，白衬衫",
    },
    personality: ["内敛", "稳重", "深情"],
    firstAppearance: "第一段",
    status: "new",
    confirmed: false,
    variants: [],
  },
];

const modernScenes: SceneInPipeline[] = [
  {
    tempId: "scene-modern-1",
    name: "街角咖啡馆",
    type: "室内",
    description: "温馨小咖啡馆，木质装修，落地窗临街",
    atmosphere: "温暖、怀旧",
    timeOfDay: "下午",
    location: "城市街角",
    status: "new",
    confirmed: false,
    variants: [],
  },
];

const modernRawText = modernSegments.map((s) => s.text).join("\n\n");

// ============================================================================
// 导出
// ============================================================================

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: "sample-scifi",
    name: "星际信使",
    genre: "scifi",
    description: "2147 年银河边缘的空间站，孤独的值班员收到了人类等待三百年的外星回音",
    rawText: scifiRawText,
    segments: scifiSegments,
    characters: scifiCharacters,
    scenes: scifiScenes,
  },
  {
    id: "sample-period",
    name: "江湖夜雨",
    genre: "period",
    description: "秋雨连绵的古镇客栈，江湖游侠与神秘女子的雨夜邂逅与激战",
    rawText: periodRawText,
    segments: periodSegments,
    characters: periodCharacters,
    scenes: periodScenes,
  },
  {
    id: "sample-modern",
    name: "咖啡馆之约",
    genre: "modern",
    description: "五年未见的初恋在街角咖啡馆重逢，一段错过的缘分能否重来",
    rawText: modernRawText,
    segments: modernSegments,
    characters: modernCharacters,
    scenes: modernScenes,
  },
];
