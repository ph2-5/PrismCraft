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

export const typeSuggestions = [
  "室内", "室外", "城市", "自然", "森林", "海滩", "山脉", "沙漠",
  "太空", "未来都市", "古代宫殿", "魔法学院", "地下城", "浮空岛",
  "赛博朋克街区", "蒸汽朋克工厂", "哥特城堡", "日式庭院", "西部小镇",
];
export const timeSuggestions = ["黎明", "清晨", "上午", "正午", "下午", "黄昏", "傍晚", "夜晚", "午夜", "阴天", "极光之夜", "日食", "月食"];
export const weatherSuggestions = ["晴朗", "多云", "阴天", "小雨", "大雨", "暴雨", "雷雨", "雪", "暴风雪", "雾", "浓雾", "沙尘暴", "极光", "彩虹"];
export const moodSuggestions = ["宁静", "欢快", "神秘", "紧张", "浪漫", "忧郁", "史诗", "恐怖", "温馨", "孤独", "希望", "绝望", "兴奋", "压抑", "梦幻", "现实"];
export const elementSuggestions = ["建筑", "自然", "水体", "火焰", "植物", "家具", "机械", "魔法效果", "人群", "动物", "飞行器", "车辆", "武器", "道具", "光影", "粒子效果", "烟雾", "镜子", "书籍", "武器架", "水晶", "符文", "传送门", "飞船"];
export const colorSuggestions = ["暖色调", "冷色调", "高饱和", "低饱和", "黑白", "金色", "蓝紫色", "橙红色", "青绿色", "粉彩色", "霓虹色", "复古色", "赛博朋克", "蒸汽波", "莫兰迪", "电影感"];
export const angleSuggestions = ["鸟瞰", "高角度", "平视", "低角度", "仰视", "倾斜", "过肩镜头", "POV第一人称"];
export const distanceSuggestions = ["极特写", "特写", "中近景", "中景", "全景", "远景", "极远景"];
export const movementSuggestions = ["静止", "平移", "俯仰", "推拉", "横移", "手持", "环绕", "跟随", "升降", "旋转", "晃动", "缩放"];
