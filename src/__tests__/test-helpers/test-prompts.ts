export interface TestPromptCase {
  id: string;
  name: string;
  description: string;
  complexity: "low" | "medium" | "high" | "extreme";
  prompt: string;
  expectedFeatures: string[];
  testType: "basic" | "complex" | "edge" | "integration";
}

export interface StoryBeatTestData {
  id: string;
  name: string;
  complexity: "low" | "medium" | "high" | "extreme";
  beat: {
    id: string;
    storyId: string;
    sequence: number;
    title?: string;
    description?: string;
    content?: string;
    character?: string;
    characters?: string[];
    sceneId?: string;
    shotType?: string;
    cameraAngle?: string;
    cameraMovement?: string;
    cameraDistance?: string;
    cameraSpeed?: string;
    duration?: number;
    type?: string;
  };
  characters?: Array<{
    id: string;
    name: string;
    gender?: string;
    age?: number;
    style?: string;
    appearance?: {
      hairColor?: string;
      hairStyle?: string;
      eyeColor?: string;
      height?: string;
      build?: string;
      clothing?: string;
    };
    description?: string;
    personality?: string[];
  }>;
  scenes?: Array<{
    id: string;
    name: string;
    description?: string;
    type?: string;
    timeOfDay?: string;
    weather?: string;
    atmosphere?: string;
    mood?: string;
    lighting?: string;
    elements?: string[];
    colors?: string[];
  }>;
  expectedFeatures: string[];
}

export const challengingPrompts: TestPromptCase[] = [
  {
    id: "complex-character-interaction",
    name: "复杂角色交互",
    description: "三个角色之间的复杂对话和动作",
    complexity: "high",
    prompt: "在一个繁忙的未来都市街头，赛博朋克风格，夜晚，霓虹灯闪烁。女主角身穿黑色皮质风衣，紫色短发，机械义眼发出微弱蓝光，站在左侧前景，右手持发光的能量武器。男主角穿白色西装，银色长发，站在右侧背景，表情严肃地指向远处。中间有一个机器人助手，正在扫描地面的全息投影地图。天空中下着细雨，地面有反光效果。镜头从低角度仰拍，缓慢推近女主角的面部特写，展示她坚定的眼神和机械义眼的细节。",
    expectedFeatures: ["multiple characters", "complex action", "cyberpunk style", "camera movement", "weather effects", "lighting effects"],
    testType: "complex"
  },
  {
    id: "extreme-camera-angles",
    name: "极端镜头角度组合",
    description: "多个极端镜头角度的组合使用",
    complexity: "high",
    prompt: "鸟瞰镜头从正上方90度垂直拍摄一片废墟城市，然后镜头急速下降变成虫视角度，从地面仰视一栋倾斜的摩天大楼。接着镜头环绕大楼旋转360度，最后定格在一个倾斜的荷兰角度，展示主角站在废墟中，背景是破碎的天空和漂浮的碎片。",
    expectedFeatures: ["birds_eye", "worms_eye", "orbit", "dutch angle", "camera transition", "complex camera path"],
    testType: "edge"
  },
  {
    id: "multi-style-mix",
    name: "跨风格混合",
    description: "多种艺术风格的混合提示词",
    complexity: "extreme",
    prompt: "一个混合风格的场景：前景是水彩风格的小女孩，穿着像素风格的连衣裙，背景是写实风格的森林，远处的城堡是3D渲染风格，天空是油画风格的云彩。角色动作是日式动画风格的流畅运动，整体色调是赛博朋克的霓虹色彩。",
    expectedFeatures: ["style mixing", "watercolor", "pixel art", "photorealistic", "3D render", "anime", "cyberpunk"],
    testType: "edge"
  },
  {
    id: "long-prompt-compression",
    name: "超长提示词压缩",
    description: "超过500字的超长提示词，测试压缩和截断逻辑",
    complexity: "extreme",
    prompt: "在一个遥远的星系边缘，远离任何已知文明的星域深处，有一颗被遗弃了数百年的古老太空站静静地漂浮在黑暗的虚空中。太空站的外壳布满了岁月侵蚀的痕迹，原本光滑的金属板已经生锈剥落，露出了内部的结构框架，巨大的太阳能电池板破碎不堪，只剩下几片残骸在无力地旋转。站内仍然闪烁着微弱的应急灯光，透过破损的窗户和裂缝可以看到远处壮丽的星云和无数闪烁的星星，它们像是镶嵌在黑色天鹅绒上的钻石。一个孤独的机器人维修员正在昏暗的控制室内检查一个故障的控制台，它的红色光学传感器在黑暗中发出微弱但坚定的光芒，机械臂灵活地操作着各种按钮和开关。控制台的屏幕上显示着乱码的数据和警告信息，偶尔闪烁着红色的警报信号，似乎在诉说着曾经发生的灾难。太空站的核心反应堆在深处发出低沉的嗡嗡声，管道中流淌着荧光绿色的冷却剂，在昏暗的光线下形成诡异的光晕。远处传来金属扭曲和撕裂的声音，像是有什么未知的东西在船体外部缓慢移动，让人不寒而栗。镜头从太空站的外部全景开始，缓慢地环绕整个庞大的结构体，展示其宏伟而苍凉的规模，然后逐渐推进到维修机器人所在的控制室，捕捉它专注工作的特写，再跟随它的视线移动到闪烁的控制台屏幕，最后镜头缓缓拉远，展示整个太空站在浩瀚无垠的宇宙中显得如此渺小和孤独。整个场景笼罩在一种神秘、孤寂而略带恐怖的氛围中，只有应急灯光和星星的光芒照亮这片死寂的空间，仿佛时间在这里已经停止了流逝。",
    expectedFeatures: ["long prompt", "detailed environment", "atmospheric", "camera movement", "multiple objects"],
    testType: "edge"
  },
  {
    id: "special-effects-complex",
    name: "复杂特效场景",
    description: "包含粒子效果、魔法特效的复杂场景",
    complexity: "high",
    prompt: "一位年轻的女魔法师站在古老的魔法阵中央，双手举起，正在召唤一场流星雨。天空中布满了五彩斑斓的魔法粒子，形成螺旋状的能量漩涡。流星拖着长长的光尾从天空坠落，撞击地面时产生耀眼的光芒和冲击波。魔法师的长袍随风飘动，头发周围环绕着发光的符文。地面上刻满了发光的魔法阵图案，散发着神秘的蓝光。镜头从远处的广角开始，逐渐推进到魔法师的面部，捕捉她专注的表情，然后跟随一颗流星的轨迹向下移动，最后展示魔法阵被流星击中时的壮观爆炸效果。",
    expectedFeatures: ["particle effects", "magic effects", "complex action", "camera movement", "lighting effects"],
    testType: "complex"
  },
  {
    id: "cultural-mix",
    name: "文化元素混合",
    description: "东西方文化元素的融合",
    complexity: "high",
    prompt: "一个融合了东方和西方元素的奇幻场景：一位身穿汉服的古代中国女侠，手持激光剑，站在一座漂浮的中式宫殿屋顶上。宫殿周围环绕着赛博朋克风格的霓虹灯光和全息投影广告。远处可以看到现代化的摩天大楼，但建筑风格却是传统的飞檐翘角。女侠的身后跟着一只机械仙鹤，翅膀由金属和发光二极管组成。天空中漂浮着传统的孔明灯，但每个灯笼都发出数字化的光芒。镜头从低角度仰视女侠，展示她的英姿和背后的混合风格背景。",
    expectedFeatures: ["cultural fusion", "east meets west", "ancient vs modern", "cyberpunk", "fantasy elements"],
    testType: "complex"
  },
  {
    id: "emotion-complex",
    name: "复杂情感表达",
    description: "包含多种情感层次的场景",
    complexity: "medium",
    prompt: "一个充满情感张力的场景：在夕阳西下的海滩上，一位白发苍苍的老人独自坐在礁石上，凝视着远方的大海。他的表情混合着怀念、悲伤和一丝希望。海浪轻轻拍打着礁石，金色的阳光洒在他布满皱纹的脸上。远处有一对年轻情侣在沙滩上奔跑嬉戏，形成鲜明的对比。镜头缓慢移动，从老人的特写开始，逐渐拉远展示整个海滩的景象，最后定格在老人和情侣之间的空间，强调时间的流逝和生命的循环。",
    expectedFeatures: ["emotional complexity", "contrast", "atmospheric", "age difference", "symbolism"],
    testType: "complex"
  },
  {
    id: "action-sequence",
    name: "连续动作序列",
    description: "包含多个连续动作的场景描述",
    complexity: "high",
    prompt: "一场激烈的追逐戏：主角从一栋高楼的屋顶跳跃到另一栋楼，同时转身向追逐者开枪。追逐者也跟着跳跃，但差点失足，抓住了屋檐边缘。主角继续奔跑，跳过一个障碍物，然后滑下一个斜坡。追逐者终于爬上来，继续追赶。镜头跟随主角的视角，展示他奔跑时的主观视角，然后切换到追逐者的视角，最后用一个环绕镜头展示整个追逐场景的规模。",
    expectedFeatures: ["action sequence", "multiple actions", "POV camera", "camera switching", "dynamic movement"],
    testType: "complex"
  },
  {
    id: "ambiguous-scene",
    name: "模糊/抽象场景",
    description: "模糊和抽象的场景描述",
    complexity: "extreme",
    prompt: "一个超现实的梦境场景：时间似乎静止了，漂浮的时钟指针停在午夜。周围是扭曲的空间，墙壁融化成液体，地板变成镜子反射出无数个自己。远处传来模糊的声音，像是从另一个维度传来的低语。光线呈现出非自然的颜色，阴影有着自己的生命。主角站在这个扭曲的空间中，试图抓住一片漂浮的记忆碎片。整个场景充满了不确定性和超现实的元素。",
    expectedFeatures: ["surreal", "abstract", "dreamlike", "non-linear", "ambiguous"],
    testType: "edge"
  },
  {
    id: "technical-challenges",
    name: "技术挑战场景",
    description: "包含技术难点的场景描述",
    complexity: "extreme",
    prompt: "一个高度复杂的技术场景：在一个充满全息显示屏的控制室中，无数的数据在空气中流动形成三维图表。一位科学家正在用手势操作这些数据，他的手穿过全息投影，引起数据的波动。周围的墙壁显示着实时的星球地图和复杂的方程式。窗外可以看到宇宙飞船正在对接，闪烁的指示灯和机械臂的运动清晰可见。整个场景需要精确的光影追踪和复杂的粒子效果来呈现数据流的效果。",
    expectedFeatures: ["holographic displays", "data visualization", "complex UI", "scientific accuracy", "technical details"],
    testType: "edge"
  }
];

export const storyBeatTestData: StoryBeatTestData[] = [
  {
    id: "beat-complex-character-scene",
    name: "复杂角色场景组合",
    complexity: "high",
    beat: {
      id: "beat-001",
      storyId: "story-001",
      sequence: 1,
      title: "夜袭",
      description: "女主角在雨夜潜入敌方基地",
      content: "雨夜，女主角身穿黑色紧身衣，从屋顶潜入戒备森严的敌方基地。她动作敏捷，避开巡逻的机器人哨兵，利用绳索下到地面。基地内部灯火通明，红色警报灯闪烁。",
      character: "char-001",
      sceneId: "scene-001",
      shotType: "medium",
      cameraAngle: "low",
      cameraMovement: "tracking",
      duration: 15,
      type: "action"
    },
    characters: [
      {
        id: "char-001",
        name: "艾琳",
        gender: "female",
        age: 28,
        style: "anime",
        appearance: {
          hairColor: "黑色",
          hairStyle: "短发",
          eyeColor: "蓝色",
          height: "高挑",
          build: "健美",
          clothing: "黑色紧身战斗服"
        },
        description: "精英特工，冷静果断，擅长潜入和格斗",
        personality: ["冷静", "机智", "勇敢"]
      }
    ],
    scenes: [
      {
        id: "scene-001",
        name: "敌方基地",
        description: "高科技军事基地，夜晚",
        type: "室外",
        timeOfDay: "深夜",
        weather: "暴雨",
        atmosphere: "紧张",
        mood: "危险",
        lighting: "霓虹",
        elements: ["激光围栏", "巡逻机器人", "监控摄像头", "铁丝网"],
        colors: ["黑色", "红色", "蓝色"]
      }
    ],
    expectedFeatures: ["complex character", "detailed scene", "action", "weather effects", "camera tracking"]
  },
  {
    id: "beat-multi-character-interaction",
    name: "多角色交互",
    complexity: "high",
    beat: {
      id: "beat-002",
      storyId: "story-001",
      sequence: 2,
      title: "对峙",
      description: "三方势力在废弃工厂对峙",
      content: "废弃工厂内，女主角、神秘男子和反派头目形成三角对峙。女主角手持武器指向反派，神秘男子站在中间试图调解，反派头目冷笑地看着两人。工厂内布满了废弃的机器和散落的零件，阳光从破损的屋顶照射下来，形成明暗对比。",
      characters: ["char-001", "char-002", "char-003"],
      sceneId: "scene-002",
      shotType: "wide",
      cameraAngle: "eye_level",
      cameraMovement: "pan",
      duration: 20,
      type: "drama"
    },
    characters: [
      {
        id: "char-001",
        name: "艾琳",
        gender: "female",
        age: 28,
        style: "anime",
        appearance: {
          hairColor: "黑色",
          hairStyle: "短发",
          eyeColor: "蓝色",
          clothing: "战斗服"
        }
      },
      {
        id: "char-002",
        name: "神秘男子",
        gender: "male",
        age: 35,
        style: "realistic",
        appearance: {
          hairColor: "灰色",
          hairStyle: "长发",
          eyeColor: "绿色",
          clothing: "风衣"
        },
        description: "身份不明的中间人"
      },
      {
        id: "char-003",
        name: "维克托",
        gender: "male",
        age: 50,
        style: "anime",
        appearance: {
          hairColor: "白色",
          hairStyle: "光头",
          eyeColor: "红色",
          clothing: "西装"
        },
        description: "反派头目，冷酷无情"
      }
    ],
    scenes: [
      {
        id: "scene-002",
        name: "废弃工厂",
        type: "室内",
        timeOfDay: "白天",
        atmosphere: "紧张",
        mood: "危险",
        lighting: "自然光",
        elements: ["废弃机器", "金属管道", "破碎玻璃"],
        colors: ["灰色", "黄色", "黑色"]
      }
    ],
    expectedFeatures: ["multiple characters", "dialogue setup", "tension", "complex composition"]
  },
  {
    id: "beat-emotional-moment",
    name: "情感高潮时刻",
    complexity: "medium",
    beat: {
      id: "beat-003",
      storyId: "story-001",
      sequence: 3,
      title: "真相",
      description: "主角发现惊人真相的瞬间",
      content: "在古老的图书馆中，主角找到了揭示身世之谜的古籍。当她翻开最后一页时，一道神秘的光芒从书中涌出，照亮了她震惊的脸庞。镜头缓慢推近，捕捉她眼中的泪水和颤抖的双手。窗外的月光透过彩色玻璃窗洒进来，形成斑斓的光影。",
      character: "char-001",
      sceneId: "scene-003",
      shotType: "close",
      cameraAngle: "eye_level",
      cameraMovement: "push",
      duration: 12,
      type: "emotional"
    },
    characters: [
      {
        id: "char-001",
        name: "艾琳",
        gender: "female",
        age: 28,
        style: "anime",
        appearance: {
          hairColor: "黑色",
          hairStyle: "长发",
          eyeColor: "蓝色",
          clothing: "复古长裙"
        },
        description: "正在寻找身世之谜的年轻学者"
      }
    ],
    scenes: [
      {
        id: "scene-003",
        name: "古老图书馆",
        type: "室内",
        timeOfDay: "夜晚",
        atmosphere: "神秘",
        mood: "神圣",
        lighting: "烛光",
        elements: ["古籍", "书架", "烛台", "彩色玻璃"],
        colors: ["金色", "棕色", "蓝色"]
      }
    ],
    expectedFeatures: ["emotional moment", "close-up", "lighting effects", "symbolic elements"]
  }
];

export function getPromptById(id: string): TestPromptCase | undefined {
  return challengingPrompts.find((p) => p.id === id);
}

export function getBeatTestDataById(id: string): StoryBeatTestData | undefined {
  return storyBeatTestData.find((d) => d.id === id);
}

export function getPromptsByComplexity(complexity: TestPromptCase["complexity"]): TestPromptCase[] {
  return challengingPrompts.filter((p) => p.complexity === complexity);
}

export function getPromptsByTestType(testType: TestPromptCase["testType"]): TestPromptCase[] {
  return challengingPrompts.filter((p) => p.testType === testType);
}
