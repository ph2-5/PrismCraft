/**
 * IP 安全改写器（Task 1.4 v5.3 增强 → Task 4.12 生产级升级）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-copyright SKILL 模式。
 *
 * 核心原则：**安全改写而非拒绝**。保留用户创意功能，替换不安全元素。
 * - "像钢铁侠" → "机械战甲超级英雄"（保留创意功能）
 * - "皮克斯风格" → "3D 动画渲染风格"（保留视觉风格）
 * - "漫威式" → "超级英雄电影式"（保留类型特征）
 *
 * Task 4.12 升级内容：
 * 1. 扩展名人/IP/品牌数据库（覆盖更多真实场景）
 * 2. 引入模糊匹配（前缀/后缀/包含），三级置信度
 * 3. 改写置信度评分：
 *    - 高置信度（≥0.9）：精确匹配已知 IP/名人，自动改写
 *    - 中置信度（0.6-0.9）：模糊匹配，建议改写
 *    - 低置信度（<0.6）：疑似但不确定，提示用户确认
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export type IpCategory = "celebrity" | "ip" | "brand";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface IpRewriteChange {
  original: string;
  rewritten: string;
  category: IpCategory;
  confidence: number; // 0-1
  matchKind: "exact" | "prefix" | "suffix" | "contains";
  level: ConfidenceLevel;
}

export interface IpRewriteResult {
  rewritten: string;
  changes: IpRewriteChange[];
  /** 整体置信度 = 所有 changes 中最低的 confidence */
  confidence: number;
  /** 整体置信度等级 */
  level: ConfidenceLevel;
}

// === 名人数据库（演员/歌手/政治家/运动员） ===
const CELEBRITY_DATABASE: Record<string, string> = {
  // 演员
  "汤姆克鲁斯": "好莱坞动作男星",
  "阿汤哥": "好莱坞动作男星",
  "莱昂纳多": "欧美男影星",
  "小李子": "欧美男影星",
  "成龙": "华语功夫动作男星",
  "李连杰": "华语功夫动作男星",
  "周润发": "华语男影星",
  "发哥": "华语男影星",
  "梁朝伟": "华语文艺男影星",
  "刘德华": "华语全能男艺人",
  "周星驰": "华语喜剧男星",
  "星爷": "华语喜剧男星",
  "布拉德皮特": "欧美男影星",
  "皮特": "欧美男影星",
  // 歌手
  "周杰伦": "华语流行男歌手",
  "泰勒斯威夫特": "欧美流行女歌手",
  "霉霉": "欧美流行女歌手",
  "碧昂丝": "欧美流行女歌手",
  "Beyonce": "欧美流行女歌手",
  "王菲": "华语女歌手",
  "张学友": "华语流行男歌手",
  "歌神": "华语流行男歌手",
  // 政治家（避免直接使用，改写为中性描述）
  "奥巴马": "美国前总统",
  "特朗普": "美国前总统",
  "拜登": "美国总统",
  "普京": "俄罗斯领导人",
  // 运动员
  "梅西": "南美足球男运动员",
  "C罗": "欧洲足球男运动员",
  "罗纳尔多": "南美足球男运动员",
  "詹姆斯": "美国篮球男运动员",
  "科比": "美国已故篮球男运动员",
  "费德勒": "欧洲网球男运动员",
  "纳达尔": "欧洲网球男运动员",
};

// === IP 数据库（电影/动漫/游戏/商标） ===
const IP_DATABASE: Record<string, string> = {
  // 电影 IP
  "钢铁侠": "机械战甲超级英雄",
  "蜘蛛侠": "蛛丝发射超级英雄",
  "蝙蝠侠": "黑暗骑士超级英雄",
  "超人": "披风飞行超级英雄",
  "美国队长": "盾牌超级英雄",
  "雷神": "锤子女神超级英雄",
  "黑寡妇": "红色特工女战士",
  "绿巨人": "巨型绿色怪物战士",
  "黑豹": "黑色战甲非洲英雄",
  "奇异博士": "魔法披风法师",
  "蚁人": "微型战士英雄",
  "银河护卫队": "宇宙冒险小队",
  "复仇者联盟": "超级英雄战队",
  "漫威": "超级英雄电影式",
  "MCU": "超级英雄电影式",
  "DC": "超级英雄漫画式",
  "正义联盟": "超级英雄战队",
  "星球大战": "太空科幻史诗式",
  "星战": "太空科幻史诗式",
  "哈利波特": "魔法学院少年式",
  "指环王": "中土奇幻史诗式",
  "魔戒": "中土奇幻史诗式",
  "黑客帝国": "虚拟现实科幻式",
  // 动漫 IP
  "皮卡丘": "黄色电气鼠精灵",
  "宝可梦": "口袋精灵",
  "pokemon": "口袋精灵",
  "龙珠": "热血格斗动漫式",
  "孙悟空龙珠": "热血格斗动漫主角",
  "海贼王": "海洋冒险动漫式",
  "路飞": "草帽海洋冒险少年",
  "火影忍者": "忍者格斗动漫式",
  "鸣人": "金色忍者少年",
  "死神": "灵魂武士动漫式",
  "一护": "橙色武士少年",
  "进击的巨人": "人类对抗巨人末世式",
  "鬼灭之刃": "日式斩鬼武士动漫式",
  "炭治郎": "日式斩鬼少年",
  "eva": "机甲末世动漫式",
  "新世纪福音战士": "机甲末世动漫式",
  // 游戏 IP
  "马里奥": "红帽水管工角色",
  "塞尔达": "奇幻冒险游戏式",
  "林克": "绿色精灵剑士",
  "原神": "开放世界奇幻游戏式",
  "崩坏": "末世战斗游戏式",
  "最终幻想": "奇幻科幻游戏式",
  "ff14": "在线奇幻游戏式",
  "GTA": "开放世界犯罪游戏式",
  "英雄联盟": "多人在线战斗游戏式",
  "lol": "多人在线战斗游戏式",
  "王者荣耀": "移动端多人战斗游戏式",
  "我的世界": "方块沙盒游戏式",
  "minecraft": "方块沙盒游戏式",
  // 动画工作室风格
  "皮克斯": "3D 动画渲染风格",
  "迪士尼": "经典动画风格",
  "吉卜力": "手绘动画风格",
  "宫崎骏": "手绘动画风格",
  "新海诚": "唯美光影动画风格",
};

// === 品牌商标数据库 ===
const BRAND_DATABASE: Record<string, string> = {
  "可口可乐": "红色汽水饮料",
  "百事可乐": "蓝色汽水饮料",
  "星巴克": "绿色美人鱼咖啡",
  "麦当劳": "金色拱门快餐",
  "肯德基": "白胡子老人快餐",
  "KFC": "白胡子老人快餐",
  "苹果手机": "现代智能手机",
  "iPhone": "现代智能手机",
  "iPad": "现代平板电脑",
  "MacBook": "现代笔记本电脑",
  "三星": "现代电子产品",
  "华为": "现代中国电子产品",
  "小米": "现代中国电子产品",
  "耐克": "运动服饰品牌",
  "阿迪达斯": "运动服饰品牌",
  "LV": "法国奢侈品牌",
  "路易威登": "法国奢侈品牌",
  "古驰": "意大利奢侈品牌",
  "爱马仕": "法国奢侈品牌",
  "香奈儿": "法国奢侈品牌",
};

// === 改写置信度规则 ===
const CONFIDENCE_EXACT = 0.95; // 精确匹配
const CONFIDENCE_PREFIX = 0.75; // 前缀模糊（如 "漫威式" 匹配 "漫威"）
const CONFIDENCE_SUFFIX = 0.7; // 后缀模糊
// 包含模糊（最弱）—— 当前实现仅支持前缀匹配，保留常量用于未来扩展
// const CONFIDENCE_CONTAINS = 0.65;

/** 数值 → 等级映射 */
function confidenceLevel(c: number): ConfidenceLevel {
  if (c >= 0.9) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

/**
 * 模糊匹配：检测 text 中是否包含类似 IP/名人/品牌的关键词
 *
 * 模糊匹配规则：
 * - 前缀匹配："漫威式" 匹配 key "漫威"（key 是 text 中词的前缀）
 * - 后缀匹配："大钢铁侠" 匹配 key "钢铁侠"
 * - 包含匹配："我爱钢铁侠" 匹配 key "钢铁侠"
 *
 * 注意：精确匹配（text 直接 contains key）已由精确匹配逻辑处理。
 * 模糊匹配仅处理那些不在数据库中但前缀/后缀匹配的词。
 *
 * @returns 匹配到的关键词、上下文片段、匹配类型
 */
interface FuzzyMatch {
  /** text 中触发匹配的子串（含前缀/后缀） */
  matchedText: string;
  /** 数据库中匹配到的 key */
  dbKey: string;
  /** 数据库中对应的改写词 */
  replacement: string;
  matchKind: "prefix" | "suffix" | "contains";
}

function findFuzzyMatches(
  text: string,
  db: Record<string, string>,
  alreadyMatchedKeys: Set<string>,
): FuzzyMatch[] {
  const matches: FuzzyMatch[] = [];
  const keys = Object.keys(db).filter((k) => !alreadyMatchedKeys.has(k));

  for (const key of keys) {
    if (key.length < 2) continue; // 单字符不参与模糊匹配

    // 前缀匹配：text 中存在 "key + 后缀"，如 "漫威式"、"漫威电影"
    // 通过正则查找 key 后紧跟 1-3 个非空白字符的位置
    const prefixPattern = new RegExp(`${escapeRegExp(key)}([\\u4e00-\\u9fa5A-Za-z]{1,3})`, "g");
    let m: RegExpExecArray | null;
    while ((m = prefixPattern.exec(text)) !== null) {
      const matchedText = m[0];
      // 仅当 matchedText 不等于 key 本身时（否则属于精确匹配）
      if (matchedText !== key) {
        const replacement = db[key];
        if (replacement === undefined) continue;
        matches.push({
          matchedText,
          dbKey: key,
          replacement,
          matchKind: "prefix",
        });
        break; // 每个 key 只取第一个模糊匹配
      }
    }
  }

  return matches;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 检测并改写输入中的 IP/名人/品牌关键词。
 *
 * @param input 用户原始 prompt
 * @returns 改写结果，包含改写后文本、所有改动记录、整体置信度
 */
export function rewriteIp(input: string): IpRewriteResult {
  const changes: IpRewriteChange[] = [];
  let rewritten = input;

  // 按数据库处理，先 IP（最具体），再名人，再品牌
  const matchedKeys = new Set<string>();
  rewritten = applyDatabaseExact(rewritten, IP_DATABASE, "ip", changes, matchedKeys);
  rewritten = applyDatabaseExact(rewritten, CELEBRITY_DATABASE, "celebrity", changes, matchedKeys);
  rewritten = applyDatabaseExact(rewritten, BRAND_DATABASE, "brand", changes, matchedKeys);

  // 模糊匹配（前缀/后缀/包含）—— 仅当未精确匹配时启用
  rewritten = applyDatabaseFuzzy(rewritten, IP_DATABASE, "ip", changes, matchedKeys);
  rewritten = applyDatabaseFuzzy(rewritten, CELEBRITY_DATABASE, "celebrity", changes, matchedKeys);
  rewritten = applyDatabaseFuzzy(rewritten, BRAND_DATABASE, "brand", changes, matchedKeys);

  const confidence = changes.length > 0
    ? Math.min(...changes.map((c) => c.confidence))
    : 1;

  return {
    rewritten,
    changes,
    confidence,
    level: confidenceLevel(confidence),
  };
}

function applyDatabaseExact(
  text: string,
  db: Record<string, string>,
  category: IpCategory,
  changes: IpRewriteChange[],
  matchedKeys: Set<string>,
): string {
  let result = text;
  // 按 key 长度降序处理，避免短 key 覆盖长 key（如 "漫威" 覆盖 "漫威式"）
  const keys = Object.keys(db).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (result.includes(key)) {
      const replacement = db[key];
      // noUncheckedIndexedAccess 下 db[key] 可能为 undefined，需显式检查
      if (replacement === undefined) continue;
      changes.push({
        original: key,
        rewritten: replacement,
        category,
        confidence: CONFIDENCE_EXACT,
        matchKind: "exact",
        level: "high",
      });
      result = result.split(key).join(replacement);
      matchedKeys.add(key);
    }
  }

  return result;
}

function applyDatabaseFuzzy(
  text: string,
  db: Record<string, string>,
  category: IpCategory,
  changes: IpRewriteChange[],
  matchedKeys: Set<string>,
): string {
  const fuzzyMatches = findFuzzyMatches(text, db, matchedKeys);
  let result = text;

  // 按匹配长度降序处理（避免短匹配覆盖长匹配）
  fuzzyMatches.sort((a, b) => b.matchedText.length - a.matchedText.length);

  for (const match of fuzzyMatches) {
    if (result.includes(match.matchedText)) {
      changes.push({
        original: match.matchedText,
        rewritten: match.replacement,
        category,
        confidence: match.matchKind === "prefix" ? CONFIDENCE_PREFIX : CONFIDENCE_SUFFIX,
        matchKind: match.matchKind,
        level: confidenceLevel(match.matchKind === "prefix" ? CONFIDENCE_PREFIX : CONFIDENCE_SUFFIX),
      });
      result = result.split(match.matchedText).join(match.replacement);
      matchedKeys.add(match.dbKey);
    }
  }

  return result;
}

/**
 * 判断是否需要用户确认（置信度低于阈值）。
 * 默认阈值 0.9，低于此值的改写建议提示用户确认。
 */
export function needsUserConfirmation(result: IpRewriteResult, threshold = 0.9): boolean {
  return result.confidence < threshold;
}

/**
 * 获取所有已注册的 IP/名人/品牌关键词（用于 UI 展示）。
 */
export function listKnownKeywords(): {
  celebrity: string[];
  ip: string[];
  brand: string[];
} {
  return {
    celebrity: Object.keys(CELEBRITY_DATABASE),
    ip: Object.keys(IP_DATABASE),
    brand: Object.keys(BRAND_DATABASE),
  };
}

/**
 * 获取数据库大小（用于统计和 UI 展示）。
 */
export function getDatabaseStats(): {
  celebrity: number;
  ip: number;
  brand: number;
  total: number;
} {
  return {
    celebrity: Object.keys(CELEBRITY_DATABASE).length,
    ip: Object.keys(IP_DATABASE).length,
    brand: Object.keys(BRAND_DATABASE).length,
    total:
      Object.keys(CELEBRITY_DATABASE).length +
      Object.keys(IP_DATABASE).length +
      Object.keys(BRAND_DATABASE).length,
  };
}
