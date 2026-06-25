import type { Character } from "@/domain/schemas";
import { normalizeGender } from "@/shared/utils/utils";

export { normalizeGender };

export const defaultCharacter: Character = {
  id: "",
  name: "",
  description: "",
  gender: "",
  age: 25,
  style: "",
  personality: [],
  appearance: {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  },
  outfits: [],
  prompt: "",
  traits: [],
  tags: [],
  useCount: 0,
};

export const personalitySuggestions = [
  "开朗", "内向", "勇敢", "谨慎", "聪明", "幽默", "严肃", "温柔",
  "强势", "善良", "叛逆", "忠诚", "好奇", "冷静", "热情", "神秘",
  "傲娇", "腹黑", "天然呆", "病娇", "元气", "三无", "御姐", "正太",
  "大叔", "萝莉", "女王", "骑士", "智者", "疯子", "毒舌",
];

export interface StyleOption {
  value: string;
  labelKey: string;
}

export const styleSuggestions: readonly StyleOption[] = [
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
];

export const genderSuggestions = ["男性", "女性", "中性", "无性别", "双性", "其他"];

export const heightSuggestions = ["很矮", "较矮", "平均", "较高", "很高", "巨人", "侏儒"];

export const buildSuggestions = ["瘦弱", "苗条", "平均", "健美", "魁梧", "肥胖", "精瘦", "丰满"];
