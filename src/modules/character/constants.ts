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

export const styleSuggestions = [
  "日式动漫", "写实风格", "卡通风格", "Q版/萌系", "像素风格", "水彩风格",
  "赛博朋克", "奇幻风格", "蒸汽朋克", "哥特风格", "浮世绘", "油画风格",
  "素描风格", "3D渲染", "低多边形", "美式漫画", "韩漫风格", "国风/古风",
  "未来主义", "复古风",
];

export const genderSuggestions = ["男性", "女性", "中性", "无性别", "双性", "其他"];

export const heightSuggestions = ["很矮", "较矮", "平均", "较高", "很高", "巨人", "侏儒"];

export const buildSuggestions = ["瘦弱", "苗条", "平均", "健美", "魁梧", "肥胖", "精瘦", "丰满"];
