export interface Element {
  id: string;
  name: string;
  type?: string;
  description?: string;
  featureAnchor?: { featureTags?: string[] };
  characterConfig?: {
    appearance?: {
      hairColor?: string;
      hairStyle?: string;
      eyeColor?: string;
      clothing?: string;
    };
  };
  bindings?: Array<{ type: string; url: string }>;
}

export interface Beat {
  id: string;
  elementIds?: string[];
}

interface ConsistencyResult {
  score: number;
  passed: boolean;
  issues: string[];
  details?: string;
}

interface BeatConsistencyResult {
  passed: boolean;
  characterScores: Array<{
    elementId: string;
    elementName: string;
    score: number;
    issues: string[];
  }>;
  overallScore: number;
  recommendation: "accept" | "adjust" | "regenerate";
}

interface ApiGateway {
  analyzeImage: (params: {
    imageUrl: string;
    category: string;
    analysisPrompt: string;
  }) => Promise<{
    success: boolean;
    data?: { analysis?: string };
    error?: string | { code: string; message: string };
  }>;
}

export function buildConsistencyPrompt(element: Element): string {
  const parts = [
    "请严格对比这张图片与参考图中的元素一致性，按以下维度评分（0-100分）：",
    "",
    `元素名称：${element.name}`,
    `元素类型：${element.type === "character" ? "角色" : element.type === "prop" ? "道具" : "特效"}`,
  ];

  if (element.description) {
    parts.push(`元素描述：${element.description}`);
  }

  if (element.featureAnchor?.featureTags && element.featureAnchor.featureTags.length > 0) {
    parts.push(`关键特征：${element.featureAnchor.featureTags.join("、")}`);
  }

  if (element.type === "character" && element.characterConfig?.appearance) {
    const app = element.characterConfig.appearance;
    const features: string[] = [];
    if (app.hairColor) features.push(`${app.hairColor}发色`);
    if (app.hairStyle) features.push(`${app.hairStyle}发型`);
    if (app.eyeColor) features.push(`${app.eyeColor}眼睛`);
    if (app.clothing) features.push(`穿着${app.clothing}`);
    if (features.length > 0) {
      parts.push(`外观特征：${features.join("、")}`);
    }
  }

  parts.push(
    "",
    "请严格按照以下 JSON 格式输出分析结果，不要输出其他内容：",
    "```json",
    "{",
    '  "totalScore": 75,',
    '  "appearance": { "score": 80, "comment": "具体评价" },',
    '  "color": { "score": 70, "comment": "具体评价" },',
    '  "style": { "score": 75, "comment": "具体评价" },',
    '  "issues": ["问题1", "问题2"]',
    "}",
    "```",
    "",
    "注意：",
    "1. 仅评估外观、颜色、风格的一致性",
    "2. 动作、姿态、角度变化不算不一致",
    "3. 如果生成结果与参考图明显不是同一元素，totalScore 应低于30",
  );

  return parts.join("\n");
}

export function parseConsistencyAnalysis(
  analysis: string,
  _element: Element,
): ConsistencyResult {
  const jsonResult = tryParseJsonResult(analysis);
  if (jsonResult) return jsonResult;
  return parseRegexResult(analysis);
}

function tryParseJsonResult(analysis: string): ConsistencyResult | null {
  const jsonMatch = analysis.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    if (typeof parsed.totalScore !== "number") return null;

    const totalScore = Math.min(100, Math.max(0, parsed.totalScore)) / 100;
    const issues: string[] = Array.isArray(parsed.issues)
      ? (parsed.issues as string[]).filter((i): i is string => typeof i === "string" && i.length > 3)
      : [];

    if (issues.length === 0) {
      const subScore = (obj: unknown, fallback: number): number => {
        if (typeof obj === "object" && obj !== null && "score" in obj) {
          const score = (obj as Record<string, unknown>).score;
          return typeof score === "number" ? score : fallback;
        }
        return fallback;
      };
      const appearanceScore = subScore(parsed.appearance, 50);
      const colorScore = subScore(parsed.color, 50);
      const styleScore = subScore(parsed.style, 50);

      if (appearanceScore < 60) issues.push("外观特征与参考图差异较大");
      if (colorScore < 60) issues.push("颜色配色与参考图不一致");
      if (styleScore < 60) issues.push("整体风格与参考图不匹配");
    }

    const passed = totalScore >= 0.7 && issues.length <= 2;
    return { score: totalScore, passed, issues, details: analysis };
  } catch {
    return null;
  }
}

function parseRegexResult(analysis: string): ConsistencyResult {
  const issues: string[] = [];
  let totalScore = 0.5;

  const totalMatch = analysis.match(/总分[:：]\s*(\d+)/i);
  if (totalMatch?.[1]) {
    totalScore = Math.min(100, Math.max(0, parseInt(totalMatch[1], 10))) / 100;
  }

  const appearanceMatch = analysis.match(/外观一致性[:：]\s*(\d+)/i);
  const colorMatch = analysis.match(/颜色一致性[:：]\s*(\d+)/i);
  const styleMatch = analysis.match(/风格一致性[:：]\s*(\d+)/i);

  const issueSection = analysis.match(/问题列表[:：]([\s\S]*?)(?=\n\n|$)/i);
  if (issueSection?.[1]) {
    const issueLines = issueSection[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-") || line.startsWith("•"));
    for (const line of issueLines) {
      const issue = line.replace(/^[-•]\s*/, "").trim();
      if (issue && issue.length > 3) {
        issues.push(issue);
      }
    }
  }

  if (issues.length === 0) {
    const appearanceScore = appearanceMatch?.[1] ? parseInt(appearanceMatch[1], 10) : 50;
    const colorScore = colorMatch?.[1] ? parseInt(colorMatch[1], 10) : 50;
    const styleScore = styleMatch?.[1] ? parseInt(styleMatch[1], 10) : 50;

    if (appearanceScore < 60) {
      issues.push("外观特征与参考图差异较大");
    }
    if (colorScore < 60) {
      issues.push("颜色配色与参考图不一致");
    }
    if (styleScore < 60) {
      issues.push("整体风格与参考图不匹配");
    }
  }

  const passed = totalScore >= 0.7 && issues.length <= 2;

  return {
    score: totalScore,
    passed,
    issues,
    details: analysis,
  };
}

export async function checkVisualConsistency(
  apiGateway: ApiGateway,
  params: {
    generatedImageUrl?: string;
    referenceImageUrl?: string;
    element: Element;
  },
): Promise<ConsistencyResult> {
  const { generatedImageUrl, referenceImageUrl, element } = params;

  if (!generatedImageUrl || !referenceImageUrl) {
    return {
      score: 0,
      passed: false,
      issues: ["缺少生成结果或参考图"],
    };
  }

  const checkPrompt = buildConsistencyPrompt(element);

  try {
    const result = await apiGateway.analyzeImage({
      imageUrl: generatedImageUrl,
      category: element.type === "character" ? "character" : "scene",
      analysisPrompt: checkPrompt,
    });

    if (!result.success || !result.data?.analysis) {
      return {
        score: 0,
        passed: false,
        issues: [`视觉分析失败: ${result.error || "未知错误"}`],
      };
    }

    return parseConsistencyAnalysis(result.data.analysis, element);
  } catch (error) {
    return {
      score: 0,
      passed: false,
      issues: [
        `检查过程异常: ${error instanceof Error ? error.message : "未知错误"}`,
      ],
    };
  }
}

export async function checkBeatElementConsistency(
  apiGateway: ApiGateway,
  params: {
    beat: Beat;
    elements: Element[];
    getGeneratedImageUrl: (elementId: string) => string | undefined;
  },
): Promise<BeatConsistencyResult> {
  const { beat, elements, getGeneratedImageUrl } = params;

  const characterScores: BeatConsistencyResult["characterScores"] = [];
  const allIssues: string[] = [];

  if (!beat.elementIds || beat.elementIds.length === 0) {
    return {
      passed: true,
      characterScores: [],
      overallScore: 1,
      recommendation: "accept",
    };
  }

  const checkPromises = beat.elementIds.map(async (elementId) => {
    const element = elements.find((e) => e.id === elementId);
    if (!element) {
      characterScores.push({
        elementId,
        elementName: "未知元素",
        score: 0,
        issues: ["元素未在库中找到"],
      });
      allIssues.push(`元素 ${elementId} 未找到`);
      return;
    }

    const generatedUrl = getGeneratedImageUrl(elementId);
    const referenceBinding = element.bindings?.find((b) => b.type === "image");
    const referenceUrl = referenceBinding ? referenceBinding.url : undefined;

    if (!generatedUrl || !referenceUrl) {
      const issues: string[] = [];
      if (!generatedUrl) issues.push("缺少生成结果图");
      if (!referenceUrl) issues.push("缺少参考图");
      characterScores.push({
        elementId,
        elementName: element.name,
        score: 0,
        issues,
      });
      allIssues.push(...issues);
      return;
    }

    const checkResult = await checkVisualConsistency(apiGateway, {
      generatedImageUrl: generatedUrl,
      referenceImageUrl: referenceUrl,
      element,
    });

    characterScores.push({
      elementId,
      elementName: element.name,
      score: checkResult.score,
      issues: checkResult.issues,
    });
    allIssues.push(...checkResult.issues);
  });

  await Promise.all(checkPromises);

  const overallScore =
    characterScores.length > 0
      ? characterScores.reduce((sum, s) => sum + s.score, 0) /
        characterScores.length
      : 1;

  const passed = overallScore >= 0.7 && allIssues.length === 0;

  let recommendation: BeatConsistencyResult["recommendation"];
  if (overallScore >= 0.85) {
    recommendation = "accept";
  } else if (overallScore >= 0.6) {
    recommendation = "adjust";
  } else {
    recommendation = "regenerate";
  }

  return {
    passed,
    characterScores,
    overallScore,
    recommendation,
  };
}
