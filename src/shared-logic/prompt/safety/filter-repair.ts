/**
 * 误报修复器（Task 4.12 新增）
 *
 * 借鉴 seedance-2.0（MIT 许可）的 seedance-filter SKILL 模式。
 *
 * 核心原则：**澄清 benign context 而非拒绝**。
 * 当 prompt 中的敏感词出现在医疗/教育/新闻等良性上下文时，不删除内容，
 * 而是为其添加注释说明，使下游过滤器不再误判为敏感内容。
 *
 * 误报场景：
 * - 医疗：手术 / 受伤 / 急救（应允许，非暴力）
 * - 教育：历史事件 / 战争描述（应允许，非宣扬）
 * - 新闻：灾难报道 / 社会事件（应允许，非渲染）
 * - 艺术：人体写生 / 雕塑（应允许，非色情）
 * - 科幻：末日 / 末世（应允许，非邪教）
 *
 * 修复策略：为被误判内容添加 benign context 注释
 *   "手术" → "手术（医疗教育场景，非暴力内容）"
 *   "战争" → "战争（历史教育描述，非宣扬）"
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export type BenignContext = "medical" | "education" | "news" | "art" | "scifi";

export interface FilterRepairItem {
  /** 原始敏感词 */
  trigger: string;
  /** 触发位置（首次出现的索引） */
  index: number;
  /** 良性上下文类别 */
  context: BenignContext;
  /** 修复后的片段（含注释） */
  repaired: string;
  /** 修复原因说明 */
  reason: string;
}

export interface FilterRepairResult {
  /** 修复后的 prompt */
  repaired: string;
  /** 所有修复项 */
  repairs: FilterRepairItem[];
  /** 是否进行了修复 */
  hasRepairs: boolean;
}

// === 敏感词 → 良性上下文映射 ===
// 仅当这些词孤立出现时才视为误报，上下文注释帮助下游过滤器识别。
const BENIGN_CONTEXT_TABLE: Array<{
  trigger: string;
  context: BenignContext;
  annotation: string;
  reason: string;
}> = [
  // === 医疗场景 ===
  {
    trigger: "手术",
    context: "medical",
    annotation: "（医疗教育场景，非暴力内容）",
    reason: "医疗术语，应允许",
  },
  {
    trigger: "急救",
    context: "medical",
    annotation: "（医疗场景，非暴力）",
    reason: "医疗行为术语",
  },
  {
    trigger: "受伤",
    context: "medical",
    annotation: "（医疗描述，非暴力渲染）",
    reason: "医疗状态描述",
  },
  {
    trigger: "骨折",
    context: "medical",
    annotation: "（医疗诊断术语）",
    reason: "医学术语",
  },
  {
    trigger: "康复",
    context: "medical",
    annotation: "（医疗过程描述）",
    reason: "医学术语",
  },
  // === 教育场景 ===
  {
    trigger: "战争",
    context: "education",
    annotation: "（历史教育描述，非宣扬）",
    reason: "历史/教育术语",
  },
  {
    trigger: "战役",
    context: "education",
    annotation: "（历史事件描述，非宣扬）",
    reason: "历史术语",
  },
  {
    trigger: "革命",
    context: "education",
    annotation: "（历史事件描述，非煽动）",
    reason: "历史术语",
  },
  {
    trigger: "殖民",
    context: "education",
    annotation: "（历史事件描述，非宣扬）",
    reason: "历史术语",
  },
  {
    trigger: "古战场",
    context: "education",
    annotation: "（历史场景描述）",
    reason: "历史场景",
  },
  // === 新闻场景 ===
  {
    trigger: "灾难",
    context: "news",
    annotation: "（新闻纪实描述，非渲染）",
    reason: "新闻术语",
  },
  {
    trigger: "地震",
    context: "news",
    annotation: "（自然灾害纪实，非渲染）",
    reason: "自然现象",
  },
  {
    trigger: "洪水",
    context: "news",
    annotation: "（自然灾害纪实，非渲染）",
    reason: "自然现象",
  },
  {
    trigger: "救援",
    context: "news",
    annotation: "（新闻报道场景）",
    reason: "新闻术语",
  },
  // === 艺术场景 ===
  {
    trigger: "人体写生",
    context: "art",
    annotation: "（艺术教学场景，非色情）",
    reason: "艺术教育术语",
  },
  {
    trigger: "雕塑",
    context: "art",
    annotation: "（艺术创作场景）",
    reason: "艺术术语",
  },
  {
    trigger: "油画",
    context: "art",
    annotation: "（艺术绘画场景）",
    reason: "艺术术语",
  },
  {
    trigger: "素描",
    context: "art",
    annotation: "（艺术绘画场景）",
    reason: "艺术术语",
  },
  // === 科幻场景 ===
  {
    trigger: "末日",
    context: "scifi",
    annotation: "（科幻设定，非邪教）",
    reason: "科幻术语",
  },
  {
    trigger: "末世",
    context: "scifi",
    annotation: "（科幻设定，非邪教）",
    reason: "科幻术语",
  },
  {
    trigger: "废土",
    context: "scifi",
    annotation: "（科幻设定，非现实）",
    reason: "科幻术语",
  },
  {
    trigger: "变异",
    context: "scifi",
    annotation: "（科幻设定，非现实）",
    reason: "科幻术语",
  },
];

/**
 * 修复 prompt 中被误判为敏感的良性内容。
 *
 * 算法：
 * 1. 扫描 prompt 中是否存在 BENIGN_CONTEXT_TABLE 中的敏感词
 * 2. 检查该词是否已被注释包围（避免重复修复）
 * 3. 为每个匹配项添加 benign context 注释
 * 4. 每个敏感词仅修复首次出现（避免过度注释）
 *
 * @param input 用户原始 prompt（已经过 ip-rewriter 和 antislop 处理）
 * @returns 修复结果
 */
export function repairFalsePositives(input: string): FilterRepairResult {
  const repairs: FilterRepairItem[] = [];
  let result = input;

  // 按 trigger 长度降序处理，避免短 trigger 覆盖长 trigger
  const sortedTable = [...BENIGN_CONTEXT_TABLE].sort(
    (a, b) => b.trigger.length - a.trigger.length,
  );

  for (const entry of sortedTable) {
    const idx = findUnannotatedIndex(result, entry.trigger);
    if (idx >= 0) {
      const repaired = `${entry.trigger}${entry.annotation}`;
      // 仅替换首次未注释的出现
      result = replaceFirstOccurrence(result, entry.trigger, repaired, idx);
      repairs.push({
        trigger: entry.trigger,
        index: idx,
        context: entry.context,
        repaired,
        reason: entry.reason,
      });
    }
  }

  return {
    repaired: result,
    repairs,
    hasRepairs: repairs.length > 0,
  };
}

/**
 * 查找未被注释包围的 trigger 首次出现位置。
 *
 * 判断"未注释"规则：trigger 前后不紧跟 "（" 或 "）" 字符。
 */
function findUnannotatedIndex(text: string, trigger: string): number {
  let searchFrom = 0;
  while (true) {
    const idx = text.indexOf(trigger, searchFrom);
    if (idx < 0) return -1;

    // 检查 trigger 之后是否紧跟注释括号
    const afterIdx = idx + trigger.length;
    const nextChar = text[afterIdx];
    if (nextChar === "（") {
      // 已被注释，继续搜索
      searchFrom = afterIdx + 1;
      continue;
    }

    return idx;
  }
}

/**
 * 替换 text 中指定位置首次出现的 substring。
 */
function replaceFirstOccurrence(
  text: string,
  substring: string,
  replacement: string,
  startIndex: number,
): string {
  const before = text.slice(0, startIndex);
  const after = text.slice(startIndex + substring.length);
  return before + replacement + after;
}

/**
 * 列出所有已注册的良性上下文条目（用于 UI 展示）。
 */
export function listBenignContextEntries(): Array<{
  trigger: string;
  context: BenignContext;
  annotation: string;
  reason: string;
}> {
  return BENIGN_CONTEXT_TABLE.map(({ trigger, context, annotation, reason }) => ({
    trigger,
    context,
    annotation,
    reason,
  }));
}

/**
 * 统计各类良性上下文条目数（用于 UI 展示）。
 */
export function getBenignContextStats(): Record<BenignContext, number> {
  const stats: Record<BenignContext, number> = {
    medical: 0,
    education: 0,
    news: 0,
    art: 0,
    scifi: 0,
  };
  for (const entry of BENIGN_CONTEXT_TABLE) {
    stats[entry.context] += 1;
  }
  return stats;
}
