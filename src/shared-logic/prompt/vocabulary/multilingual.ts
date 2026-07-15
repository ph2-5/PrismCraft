/**
 * 多语言电影词汇表（Task 4.7 v5.3 增强）
 *
 * 借鉴 seedance-2.0（MIT 许可）的多语言 SKILL 模式。
 *
 * 为每个视觉概念提供 6 种语言的标准表述，支持跨语言混合 prompt 结构。
 * 6 种语言：中文（zh）/ 英文（en）/ 日文（ja）/ 韩文（ko）/ 西班牙文（es）/ 俄文（ru）
 *
 * 本文件属于 shared-logic 层，零外部依赖。
 */

export type SupportedLanguage = "zh" | "en" | "ja" | "ko" | "es" | "ru";

export interface MultilingualTerm {
  /** 概念唯一标识（英文 snake_case） */
  concept: string;
  /** 6 种语言的表述 */
  translations: Record<SupportedLanguage, string>;
}

// === 视觉概念多语言词汇表 ===
const VOCABULARY: MultilingualTerm[] = [
  // === 景别 ===
  {
    concept: "extreme_wide_shot",
    translations: {
      zh: "极远景",
      en: "extreme wide shot",
      ja: "極遠景",
      ko: "초원경",
      es: "plano general lejano",
      ru: "общий дальний план",
    },
  },
  {
    concept: "wide_shot",
    translations: {
      zh: "远景",
      en: "wide shot",
      ja: "遠景",
      ko: "원경",
      es: "plano general",
      ru: "общий план",
    },
  },
  {
    concept: "medium_shot",
    translations: {
      zh: "中景",
      en: "medium shot",
      ja: "中景",
      ko: "중경",
      es: "plano medio",
      ru: "средний план",
    },
  },
  {
    concept: "close_up",
    translations: {
      zh: "近景",
      en: "close-up",
      ja: "近景",
      ko: "근경",
      es: "primer plano",
      ru: "крупный план",
    },
  },
  {
    concept: "extreme_close_up",
    translations: {
      zh: "特写",
      en: "extreme close-up",
      ja: "特大写",
      ko: "특대사",
      es: "primerísimo plano",
      ru: "деталь",
    },
  },

  // === 运镜 ===
  {
    concept: "static",
    translations: {
      zh: "固定镜头",
      en: "static shot",
      ja: "固定ショット",
      ko: "고정샷",
      es: "plano fijo",
      ru: "статичный план",
    },
  },
  {
    concept: "pan",
    translations: {
      zh: "摇镜",
      en: "pan",
      ja: "パン",
      ko: "팬",
      es: "paneo",
      ru: "панорамирование",
    },
  },
  {
    concept: "tilt",
    translations: {
      zh: "俯仰镜",
      en: "tilt",
      ja: "ティルト",
      ko: "틸트",
      es: "tilt",
      ru: "наклон",
    },
  },
  {
    concept: "dolly",
    translations: {
      zh: "推拉镜",
      en: "dolly",
      ja: "ドリー",
      ko: "돌리",
      es: "dolly",
      ru: "долли",
    },
  },
  {
    concept: "tracking",
    translations: {
      zh: "跟拍",
      en: "tracking shot",
      ja: "トラッキングショット",
      ko: "트래킹샷",
      es: "plano de seguimiento",
      ru: "прослед",
    },
  },

  // === 光照 ===
  {
    concept: "natural_light",
    translations: {
      zh: "自然光",
      en: "natural light",
      ja: "自然光",
      ko: "자연광",
      es: "luz natural",
      ru: "естественный свет",
    },
  },
  {
    concept: "low_key_lighting",
    translations: {
      zh: "低调光",
      en: "low-key lighting",
      ja: "ローキーライティング",
      ko: "로우키조명",
      es: "iluminación baja",
      ru: "низкое освещение",
    },
  },
  {
    concept: "high_key_lighting",
    translations: {
      zh: "高调光",
      en: "high-key lighting",
      ja: "ハイキーライティング",
      ko: "하이키조명",
      es: "iluminación alta",
      ru: "высокое освещение",
    },
  },
  {
    concept: "golden_hour",
    translations: {
      zh: "黄金时刻",
      en: "golden hour",
      ja: "ゴールデンアワー",
      ko: "골든아워",
      es: "hora dorada",
      ru: "золотой час",
    },
  },

  // === 风格 ===
  {
    concept: "cyberpunk",
    translations: {
      zh: "赛博朋克",
      en: "cyberpunk",
      ja: "サイバーパンク",
      ko: "사이버펑크",
      es: "cyberpunk",
      ru: "киберпанк",
    },
  },
  {
    concept: "anime",
    translations: {
      zh: "日系动画",
      en: "anime",
      ja: "アニメ",
      ko: "애니메이션",
      es: "anime",
      ru: "аниме",
    },
  },
  {
    concept: "realistic",
    translations: {
      zh: "写实",
      en: "realistic",
      ja: "リアル",
      ko: "리얼리스틱",
      es: "realista",
      ru: "реалистичный",
    },
  },
  {
    concept: "cinematic",
    translations: {
      zh: "电影质感",
      en: "cinematic",
      ja: "シネマティック",
      ko: "시네마틱",
      es: "cinematográfico",
      ru: "кинематографичный",
    },
  },
];

// === 索引：concept → MultilingualTerm ===
const VOCABULARY_INDEX: Map<string, MultilingualTerm> = new Map(
  VOCABULARY.map((t) => [t.concept, t]),
);

/**
 * 按概念和语言获取翻译。
 * 若概念或语言不存在，返回 concept 本身作为 fallback。
 */
export function translate(concept: string, lang: SupportedLanguage): string {
  const term = VOCABULARY_INDEX.get(concept);
  if (!term) return concept;
  return term.translations[lang] ?? concept;
}

/**
 * 获取一个概念的所有语言翻译。
 */
export function getTranslations(concept: string): Record<SupportedLanguage, string> | null {
  const term = VOCABULARY_INDEX.get(concept);
  return term ? term.translations : null;
}

/**
 * 列出所有已注册的概念。
 */
export function listConcepts(): string[] {
  return Array.from(VOCABULARY_INDEX.keys());
}

/**
 * 跨语言混合 prompt 构建器。
 *
 * 给定一组概念和主语言，返回主语言的 prompt 片段。
 * 若提供 secondaryLang，则在括号中附加第二语言翻译。
 *
 * 示例：buildMixedPrompt(["close_up", "tracking"], "zh", "en")
 * → "近景(close-up)，跟拍(tracking shot)"
 */
export function buildMixedPrompt(
  concepts: string[],
  primaryLang: SupportedLanguage,
  secondaryLang?: SupportedLanguage,
): string {
  return concepts
    .map((concept) => {
      const primary = translate(concept, primaryLang);
      if (secondaryLang) {
        const secondary = translate(concept, secondaryLang);
        if (secondary !== concept) {
          return `${primary}(${secondary})`;
        }
      }
      return primary;
    })
    .join("，");
}
