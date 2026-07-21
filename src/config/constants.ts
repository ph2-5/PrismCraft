// 统一配置和常量

// 端口常量（从 ports.ts 重新导出）
export { API_SERVER_PORT, APP_SERVER_PORT, DEV_SERVER_PORT } from "./ports";

// 镜头序列常量
export const DEFAULT_SHOT_SEQUENCES = [
  {
    id: "basic_dialogue",
    name: "基础对话序列",
    description: "适用于两个角色对话的经典镜头组合",
    shotTypes: [
      { shotSize: "wide", duration: 3 },
      { shotSize: "medium", duration: 2 },
      { shotSize: "close", duration: 2 },
      { shotSize: "medium", duration: 2 },
      { shotSize: "close", duration: 2 },
      { shotSize: "wide", duration: 2 },
    ],
  },
  {
    id: "action_sequence",
    name: "动作场景序列",
    description: "适用于动作场景的快节奏镜头组合",
    shotTypes: [
      { shotSize: "wide", duration: 2 },
      { shotSize: "medium", duration: 1 },
      { shotSize: "close", duration: 1 },
      { shotSize: "medium", duration: 1 },
      { shotSize: "low", duration: 2 },
      { shotSize: "close", duration: 1 },
      { shotSize: "wide", duration: 2 },
    ],
  },
  {
    id: "introduction",
    name: "人物介绍序列",
    description: "适用于角色首次出现的镜头组合",
    shotTypes: [
      { shotSize: "wide", duration: 3 },
      { shotSize: "medium", duration: 2 },
      { shotSize: "close", duration: 3 },
      { shotSize: "extreme_close", duration: 2 },
    ],
  },
] as const;

// API 配置
// R-SEC2: X-Electron-App header 携带主进程启动时生成的随机 token，
// 由 preload 注入到 window.electronAPI.appToken。checkAuthHeader 校验此 token。
// 在非 Electron 环境（如测试）中回退为 "true"。
export const ELECTRON_APP_HEADERS: Record<string, string> = {
  "X-Electron-App":
    (typeof window !== "undefined" &&
      (window as Window & { electronAPI?: { appToken?: string } }).electronAPI?.appToken) ||
    "true",
};

export const API_CONFIG = {
  TIMEOUT: 30000, // 30秒
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE: 1000, // 1秒
  MAX_RETRY_DELAY: 10000, // 10秒
} as const;

// 文件上传配置
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_REQUEST_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/gif"] as const,
} as const;

// 批量操作配置
export const BATCH_CONFIG = {
  MAX_CONCURRENT: 3,
  DELAY_BETWEEN_BATCHES: 500, // 毫秒
  MAX_VARIANTS: 10,
} as const;

// 搜索配置
export const SEARCH_CONFIG = {
  DEBOUNCE_DELAY: 300, // 毫秒
  MAX_RESULTS_PER_TYPE: 10,
  MAX_TOTAL_RESULTS: 20,
} as const;

// 缓存配置
export const CACHE_CONFIG = {
  IMAGE_VERSION: "1.0",
  MAX_CACHE_AGE: 7 * 24 * 60 * 60 * 1000, // 7天
} as const;

// 提示词模板
export const PROMPT_TEMPLATES = {
  CHARACTER_ANALYSIS: `分析这张图片中的角色，提取以下信息并以JSON格式返回：
{
  "name": "角色名称（根据特征起一个合适的名字）",
  "gender": "性别",
  "age": "年龄范围",
  "style": "艺术风格（如：日式动漫、写实、赛博朋克等）",
  "personality": ["性格特征1", "性格特征2", "性格特征3"],
  "appearance": {
    "hairColor": "发色",
    "hairStyle": "发型",
    "eyeColor": "眼睛颜色",
    "height": "身高描述",
    "build": "体型",
    "clothing": "服装描述"
  },
  "description": "角色整体描述"
}`,

  SCENE_ANALYSIS: `分析这张图片中的场景，提取以下信息并以JSON格式返回：
{
  "name": "场景名称（根据特征起一个合适的名字）",
  "type": "场景类型（如：室内、室外、城市、自然等）",
  "timeOfDay": "时间段（如：黎明、正午、黄昏、夜晚）",
  "weather": "天气/环境",
  "mood": "氛围/情绪",
  "lighting": "光线描述",
  "elements": ["场景元素1", "场景元素2", "场景元素3"],
  "colors": ["主色调1", "主色调2"],
  "description": "场景整体描述"
}`,

  CHARACTER_GENERATION: (description: string, style: string) => 
    `${description}，${style}风格，高质量，细节丰富，角色设计`,

  SCENE_GENERATION: (description: string, style: string) => 
    `${description}，${style}风格，高质量，电影级画面，场景设计`,
} as const;

// 风格选项（labelKey 指向 i18n key，value 为持久化与 prompt 构造用的中文风格词）
export interface ConfigStyleOption {
  value: string;
  labelKey: string;
}

export const STYLE_OPTIONS: Readonly<{
  CHARACTER: readonly ConfigStyleOption[];
  SCENE: readonly ConfigStyleOption[];
}> = {
  CHARACTER: [
    { value: "日式动漫", labelKey: "styleOption.japanese-anime" },
    { value: "写实风格", labelKey: "styleOption.realistic" },
    { value: "卡通风格", labelKey: "styleOption.cartoon" },
    { value: "Q版/萌系", labelKey: "styleOption.chibi" },
    { value: "像素风格", labelKey: "styleOption.pixel" },
    { value: "水彩风格", labelKey: "styleOption.watercolor" },
    { value: "赛博朋克", labelKey: "styleOption.cyberpunk" },
    { value: "奇幻风格", labelKey: "styleOption.fantasy" },
    { value: "蒸汽朋克", labelKey: "styleOption.steampunk" },
    { value: "哥特风格", labelKey: "styleOption.gothic" },
    { value: "浮世绘", labelKey: "styleOption.ukiyoe" },
    { value: "油画风格", labelKey: "styleOption.oil-painting" },
    { value: "素描风格", labelKey: "styleOption.sketch" },
    { value: "3D渲染", labelKey: "styleOption.3d-render" },
    { value: "低多边形", labelKey: "styleOption.low-poly" },
    { value: "美式漫画", labelKey: "styleOption.american-comic" },
    { value: "韩漫风格", labelKey: "styleOption.korean-comic" },
    { value: "国风/古风", labelKey: "styleOption.chinese-classical" },
    { value: "未来主义", labelKey: "styleOption.futurism" },
    { value: "复古风", labelKey: "styleOption.retro" },
  ],

  SCENE: [
    { value: "写实风格", labelKey: "styleOption.realistic" },
    { value: "卡通风格", labelKey: "styleOption.cartoon" },
    { value: "水彩风格", labelKey: "styleOption.watercolor" },
    { value: "油画风格", labelKey: "styleOption.oil-painting" },
    { value: "赛博朋克", labelKey: "styleOption.cyberpunk" },
    { value: "奇幻风格", labelKey: "styleOption.fantasy" },
    { value: "蒸汽朋克", labelKey: "styleOption.steampunk" },
    { value: "哥特风格", labelKey: "styleOption.gothic" },
    { value: "未来主义", labelKey: "styleOption.futurism" },
    { value: "复古风", labelKey: "styleOption.retro" },
    { value: "极简风格", labelKey: "styleOption.minimalist" },
    { value: "华丽风格", labelKey: "styleOption.ornate" },
  ],
};

// 日志工具
import { errorLogger } from "@/shared/error-logger";

export const logger = {
  log: (...args: unknown[]) => {
    errorLogger.debug(args.map(String).join(" "));
  },
  warn: (...args: unknown[]) => {
    errorLogger.warn(args.map(String).join(" "));
  },
  error: (...args: unknown[]) => {
    errorLogger.error(args.map(String).join(" "));
  },
  info: (...args: unknown[]) => {
    errorLogger.info(args.map(String).join(" "));
  },
} as const;
