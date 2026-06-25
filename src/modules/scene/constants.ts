import type { Scene } from "@/domain/schemas";

export const defaultScene: Scene = {
  id: "",
  name: "",
  description: "",
  type: "",
  timeOfDay: "",
  weather: "",
  mood: "",
  lighting: "",
  elements: [],
  colors: [],
  camera: { angle: "", distance: "", movement: "" },
  prompt: "",
  tags: [],
  useCount: 0,
};

// 场景建议选项：value 保留中文（兼容 prompt 构造与持久化），labelKey 用于 UI 显示
export interface SceneSuggestionOption {
  value: string;
  labelKey: string;
}

export const typeSuggestions: readonly SceneSuggestionOption[] = [
  { value: "室内", labelKey: "sceneSuggestion.type.indoor" },
  { value: "室外", labelKey: "sceneSuggestion.type.outdoor" },
  { value: "城市", labelKey: "sceneSuggestion.type.city" },
  { value: "自然", labelKey: "sceneSuggestion.type.nature" },
  { value: "森林", labelKey: "sceneSuggestion.type.forest" },
  { value: "海滩", labelKey: "sceneSuggestion.type.beach" },
  { value: "山脉", labelKey: "sceneSuggestion.type.mountain" },
  { value: "沙漠", labelKey: "sceneSuggestion.type.desert" },
  { value: "太空", labelKey: "sceneSuggestion.type.space" },
  { value: "未来都市", labelKey: "sceneSuggestion.type.future-city" },
  { value: "古代宫殿", labelKey: "sceneSuggestion.type.ancient-palace" },
  { value: "魔法学院", labelKey: "sceneSuggestion.type.magic-academy" },
  { value: "地下城", labelKey: "sceneSuggestion.type.dungeon" },
  { value: "浮空岛", labelKey: "sceneSuggestion.type.floating-island" },
  { value: "赛博朋克街区", labelKey: "sceneSuggestion.type.cyberpunk-street" },
  { value: "蒸汽朋克工厂", labelKey: "sceneSuggestion.type.steampunk-factory" },
  { value: "哥特城堡", labelKey: "sceneSuggestion.type.gothic-castle" },
  { value: "日式庭院", labelKey: "sceneSuggestion.type.japanese-garden" },
  { value: "西部小镇", labelKey: "sceneSuggestion.type.western-town" },
];

export const timeSuggestions: readonly SceneSuggestionOption[] = [
  { value: "黎明", labelKey: "sceneSuggestion.time.dawn" },
  { value: "清晨", labelKey: "sceneSuggestion.time.early-morning" },
  { value: "上午", labelKey: "sceneSuggestion.time.morning" },
  { value: "正午", labelKey: "sceneSuggestion.time.noon" },
  { value: "下午", labelKey: "sceneSuggestion.time.afternoon" },
  { value: "黄昏", labelKey: "sceneSuggestion.time.dusk" },
  { value: "傍晚", labelKey: "sceneSuggestion.time.evening" },
  { value: "夜晚", labelKey: "sceneSuggestion.time.night" },
  { value: "午夜", labelKey: "sceneSuggestion.time.midnight" },
  { value: "阴天", labelKey: "sceneSuggestion.time.overcast" },
  { value: "极光之夜", labelKey: "sceneSuggestion.time.aurora-night" },
  { value: "日食", labelKey: "sceneSuggestion.time.solar-eclipse" },
  { value: "月食", labelKey: "sceneSuggestion.time.lunar-eclipse" },
];

export const weatherSuggestions: readonly SceneSuggestionOption[] = [
  { value: "晴朗", labelKey: "sceneSuggestion.weather.sunny" },
  { value: "多云", labelKey: "sceneSuggestion.weather.cloudy" },
  { value: "阴天", labelKey: "sceneSuggestion.weather.overcast" },
  { value: "小雨", labelKey: "sceneSuggestion.weather.light-rain" },
  { value: "大雨", labelKey: "sceneSuggestion.weather.heavy-rain" },
  { value: "暴雨", labelKey: "sceneSuggestion.weather.rainstorm" },
  { value: "雷雨", labelKey: "sceneSuggestion.weather.thunderstorm" },
  { value: "雪", labelKey: "sceneSuggestion.weather.snow" },
  { value: "暴风雪", labelKey: "sceneSuggestion.weather.blizzard" },
  { value: "雾", labelKey: "sceneSuggestion.weather.fog" },
  { value: "浓雾", labelKey: "sceneSuggestion.weather.dense-fog" },
  { value: "沙尘暴", labelKey: "sceneSuggestion.weather.sandstorm" },
  { value: "极光", labelKey: "sceneSuggestion.weather.aurora" },
  { value: "彩虹", labelKey: "sceneSuggestion.weather.rainbow" },
];

export const moodSuggestions: readonly SceneSuggestionOption[] = [
  { value: "宁静", labelKey: "sceneSuggestion.mood.peaceful" },
  { value: "欢快", labelKey: "sceneSuggestion.mood.cheerful" },
  { value: "神秘", labelKey: "sceneSuggestion.mood.mysterious" },
  { value: "紧张", labelKey: "sceneSuggestion.mood.tense" },
  { value: "浪漫", labelKey: "sceneSuggestion.mood.romantic" },
  { value: "忧郁", labelKey: "sceneSuggestion.mood.melancholic" },
  { value: "史诗", labelKey: "sceneSuggestion.mood.epic" },
  { value: "恐怖", labelKey: "sceneSuggestion.mood.horror" },
  { value: "温馨", labelKey: "sceneSuggestion.mood.cozy" },
  { value: "孤独", labelKey: "sceneSuggestion.mood.lonely" },
  { value: "希望", labelKey: "sceneSuggestion.mood.hopeful" },
  { value: "绝望", labelKey: "sceneSuggestion.mood.desperate" },
  { value: "兴奋", labelKey: "sceneSuggestion.mood.excited" },
  { value: "压抑", labelKey: "sceneSuggestion.mood.oppressive" },
  { value: "梦幻", labelKey: "sceneSuggestion.mood.dreamy" },
  { value: "现实", labelKey: "sceneSuggestion.mood.realistic" },
];

export const elementSuggestions: readonly SceneSuggestionOption[] = [
  { value: "建筑", labelKey: "sceneSuggestion.element.architecture" },
  { value: "自然", labelKey: "sceneSuggestion.element.nature" },
  { value: "水体", labelKey: "sceneSuggestion.element.water" },
  { value: "火焰", labelKey: "sceneSuggestion.element.fire" },
  { value: "植物", labelKey: "sceneSuggestion.element.plant" },
  { value: "家具", labelKey: "sceneSuggestion.element.furniture" },
  { value: "机械", labelKey: "sceneSuggestion.element.machinery" },
  { value: "魔法效果", labelKey: "sceneSuggestion.element.magic-effect" },
  { value: "人群", labelKey: "sceneSuggestion.element.crowd" },
  { value: "动物", labelKey: "sceneSuggestion.element.animal" },
  { value: "飞行器", labelKey: "sceneSuggestion.element.aircraft" },
  { value: "车辆", labelKey: "sceneSuggestion.element.vehicle" },
  { value: "武器", labelKey: "sceneSuggestion.element.weapon" },
  { value: "道具", labelKey: "sceneSuggestion.element.prop" },
  { value: "光影", labelKey: "sceneSuggestion.element.light-shadow" },
  { value: "粒子效果", labelKey: "sceneSuggestion.element.particle-effect" },
  { value: "烟雾", labelKey: "sceneSuggestion.element.smoke" },
  { value: "镜子", labelKey: "sceneSuggestion.element.mirror" },
  { value: "书籍", labelKey: "sceneSuggestion.element.book" },
  { value: "武器架", labelKey: "sceneSuggestion.element.weapon-rack" },
  { value: "水晶", labelKey: "sceneSuggestion.element.crystal" },
  { value: "符文", labelKey: "sceneSuggestion.element.rune" },
  { value: "传送门", labelKey: "sceneSuggestion.element.portal" },
  { value: "飞船", labelKey: "sceneSuggestion.element.spaceship" },
];

export const colorSuggestions: readonly SceneSuggestionOption[] = [
  { value: "暖色调", labelKey: "sceneSuggestion.color.warm-tone" },
  { value: "冷色调", labelKey: "sceneSuggestion.color.cool-tone" },
  { value: "高饱和", labelKey: "sceneSuggestion.color.high-saturation" },
  { value: "低饱和", labelKey: "sceneSuggestion.color.low-saturation" },
  { value: "黑白", labelKey: "sceneSuggestion.color.black-white" },
  { value: "金色", labelKey: "sceneSuggestion.color.gold" },
  { value: "蓝紫色", labelKey: "sceneSuggestion.color.blue-purple" },
  { value: "橙红色", labelKey: "sceneSuggestion.color.orange-red" },
  { value: "青绿色", labelKey: "sceneSuggestion.color.cyan-green" },
  { value: "粉彩色", labelKey: "sceneSuggestion.color.pastel" },
  { value: "霓虹色", labelKey: "sceneSuggestion.color.neon" },
  { value: "复古色", labelKey: "sceneSuggestion.color.retro" },
  { value: "赛博朋克", labelKey: "sceneSuggestion.color.cyberpunk" },
  { value: "蒸汽波", labelKey: "sceneSuggestion.color.vapor-wave" },
  { value: "莫兰迪", labelKey: "sceneSuggestion.color.morandi" },
  { value: "电影感", labelKey: "sceneSuggestion.color.cinematic" },
];

export const angleSuggestions: readonly SceneSuggestionOption[] = [
  { value: "鸟瞰", labelKey: "sceneSuggestion.angle.birds-eye" },
  { value: "高角度", labelKey: "sceneSuggestion.angle.high-angle" },
  { value: "平视", labelKey: "sceneSuggestion.angle.eye-level" },
  { value: "低角度", labelKey: "sceneSuggestion.angle.low-angle" },
  { value: "仰视", labelKey: "sceneSuggestion.angle.lookup" },
  { value: "倾斜", labelKey: "sceneSuggestion.angle.tilt" },
  { value: "过肩镜头", labelKey: "sceneSuggestion.angle.over-shoulder" },
  { value: "POV第一人称", labelKey: "sceneSuggestion.angle.pov-first-person" },
];

export const distanceSuggestions: readonly SceneSuggestionOption[] = [
  { value: "极特写", labelKey: "sceneSuggestion.distance.extreme-closeup" },
  { value: "特写", labelKey: "sceneSuggestion.distance.closeup" },
  { value: "中近景", labelKey: "sceneSuggestion.distance.medium-closeup" },
  { value: "中景", labelKey: "sceneSuggestion.distance.medium-shot" },
  { value: "全景", labelKey: "sceneSuggestion.distance.full-shot" },
  { value: "远景", labelKey: "sceneSuggestion.distance.wide-shot" },
  { value: "极远景", labelKey: "sceneSuggestion.distance.extreme-wide-shot" },
];

export const movementSuggestions: readonly SceneSuggestionOption[] = [
  { value: "静止", labelKey: "sceneSuggestion.movement.static" },
  { value: "平移", labelKey: "sceneSuggestion.movement.pan" },
  { value: "俯仰", labelKey: "sceneSuggestion.movement.tilt" },
  { value: "推拉", labelKey: "sceneSuggestion.movement.push-pull" },
  { value: "横移", labelKey: "sceneSuggestion.movement.tracking" },
  { value: "手持", labelKey: "sceneSuggestion.movement.handheld" },
  { value: "环绕", labelKey: "sceneSuggestion.movement.orbit" },
  { value: "跟随", labelKey: "sceneSuggestion.movement.follow" },
  { value: "升降", labelKey: "sceneSuggestion.movement.crane" },
  { value: "旋转", labelKey: "sceneSuggestion.movement.rotate" },
  { value: "晃动", labelKey: "sceneSuggestion.movement.shake" },
  { value: "缩放", labelKey: "sceneSuggestion.movement.zoom" },
];
