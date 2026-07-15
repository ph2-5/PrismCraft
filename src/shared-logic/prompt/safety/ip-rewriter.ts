/**
 * IP 安全改写器（Task 1.4 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-copyright SKILL 模式。
 *
 * 核心原则：**安全改写而非拒绝**。保留用户创意功能，替换不安全元素。
 * - "像钢铁侠" → "机械战甲超级英雄"（保留创意功能）
 * - "皮克斯风格" → "3D 动画渲染风格"（保留视觉风格）
 * - "漫威式" → "超级英雄电影式"（保留类型特征）
 *
 * 改写置信度评分：
 * - 高置信度（>0.9）：精确匹配已知 IP/名人，自动改写
 * - 中置信度（0.6-0.9）：模糊匹配，建议改写
 * - 低置信度（<0.6）：疑似但不确定，提示用户确认
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 * Task 4.12 会将此基础版本升级为生产级（扩展数据库 + 跨分镜一致性）。
 */

export type IpCategory = "celebrity" | "ip" | "brand";

export interface IpRewriteChange {
  original: string;
  rewritten: string;
  category: IpCategory;
  confidence: number; // 0-1
}

export interface IpRewriteResult {
  rewritten: string;
  changes: IpRewriteChange[];
  /** 整体置信度 = 所有 changes 中最低的 confidence */
  confidence: number;
}

// === 名人数据库（演员/歌手/政治家/运动员，示例数据） ===
const CELEBRITY_DATABASE: Record<string, string> = {
  // 演员
  "汤姆克鲁斯": "好莱坞动作男星",
  "阿汤哥": "好莱坞动作男星",
  "莱昂纳多": "欧美男影星",
  "成龙": "华语功夫动作男星",
  "李连杰": "华语功夫动作男星",
  "周润发": "华语男影星",
  // 歌手
  "周杰伦": "华语流行男歌手",
  "泰勒斯威夫特": "欧美流行女歌手",
  "霉霉": "欧美流行女歌手",
  // 政治家（避免直接使用，改写为中性描述）
  // 运动员
  "梅西": "南美足球男运动员",
  "C罗": "欧洲足球男运动员",
};

// === IP 数据库（电影/动漫/游戏/商标） ===
const IP_DATABASE: Record<string, string> = {
  // 电影 IP
  "钢铁侠": "机械战甲超级英雄",
  "蜘蛛侠": "蛛丝发射超级英雄",
  "蝙蝠侠": "黑暗骑士超级英雄",
  "美国队长": "盾牌超级英雄",
  "雷神": "锤子女神超级英雄",
  "漫威": "超级英雄电影式",
  "DC": "超级英雄漫画式",
  // 动漫 IP
  "皮卡丘": "黄色电气鼠精灵",
  "龙珠": "热血格斗动漫式",
  "海贼王": "海洋冒险动漫式",
  "火影忍者": "忍者格斗动漫式",
  "死神": "灵魂武士动漫式",
  // 游戏 IP
  "马里奥": "红帽水管工角色",
  "塞尔达": "奇幻冒险游戏式",
  "原神": "开放世界奇幻游戏式",
  // 动画工作室风格
  "皮克斯": "3D 动画渲染风格",
  "迪士尼": "经典动画风格",
  "吉卜力": "手绘动画风格",
  "宫崎骏": "手绘动画风格",
};

// === 品牌商标数据库 ===
const BRAND_DATABASE: Record<string, string> = {
  "可口可乐": "红色汽水饮料",
  "星巴克": "绿色美人鱼咖啡",
  "麦当劳": "金色拱门快餐",
  "苹果手机": "现代智能手机",
  "iPhone": "现代智能手机",
  "耐克": "运动服饰品牌",
  "阿迪达斯": "运动服饰品牌",
};

// === 改写置信度规则 ===
// 精确匹配已知数据库条目：0.95
// （Task 4.12 会扩展模糊匹配，届时引入 0.9/0.7 等级）
const CONFIDENCE_EXACT = 0.95;

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
  rewritten = applyDatabase(rewritten, IP_DATABASE, "ip", changes);
  rewritten = applyDatabase(rewritten, CELEBRITY_DATABASE, "celebrity", changes);
  rewritten = applyDatabase(rewritten, BRAND_DATABASE, "brand", changes);

  const confidence = changes.length > 0
    ? Math.min(...changes.map((c) => c.confidence))
    : 1;

  return { rewritten, changes, confidence };
}

function applyDatabase(
  text: string,
  db: Record<string, string>,
  category: IpCategory,
  changes: IpRewriteChange[],
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
      });
      result = result.split(key).join(replacement);
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
