import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import type { ConsistencyCheckResult, ElementBinding, StoryBeat, StoryElement } from "@/domain/schemas";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { extractJsonObject } from "@/shared-logic/json";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";

export interface ConsistencyCheckInput {
  beat: StoryBeat;
  elements: StoryElement[];
  generatedImageUrl?: string;
  structuredOutput?: ConsistencyAnalysisResult;
}

export async function checkVisualConsistency(
  input: ConsistencyCheckInput,
): Promise<Result<ConsistencyCheckResult>> {
  const { beat, elements, generatedImageUrl, structuredOutput } = input;

  if (!generatedImageUrl && !structuredOutput) {
    return ok({
      passed: false,
      characterScores: [],
      overallScore: 0,
      recommendation: "adjust",
    });
  }

  const boundElements = elements.filter(
    (el) => beat.elementIds?.includes(el.id) || (beat.elementBindings && el.id in beat.elementBindings),
  );

  if (boundElements.length === 0) {
    return ok({
      passed: true,
      characterScores: [],
      overallScore: 1.0,
      recommendation: "accept",
    });
  }

  if (structuredOutput) {
    return ok(parseConsistencyAnalysisFromStructured(structuredOutput, boundElements));
  }

  try {
    const prompt = buildConsistencyPrompt(boundElements, beat);
    const analysisResult = await container.imageApi.analyze(generatedImageUrl!, "scene", prompt);

    if (!analysisResult.ok) {
      return err(new AppError("CONSISTENCY_CHECK_FAILED", t("error.consistencyCheckFailed"), analysisResult.error));
    }

    const analysis = analysisResult.value.analysis;
    const parsed = parseConsistencyAnalysis(analysis, boundElements);

    return ok(parsed);
  } catch (e) {
    return err(new AppError("CONSISTENCY_CHECK_ERROR", t("error.consistencyCheckError"), e));
  }
}

function buildConsistencyPrompt(elements: StoryElement[], beat: StoryBeat): string {
  const elementDescriptions = elements
    .map((el) => {
      const binding = (beat.elementBindings?.[el.id] || {}) as Partial<ElementBinding>;
      const role = binding.role || binding.description || "";
      return `- ${el.name} (${el.type}): ${role || el.description}`;
    })
    .join("\n");

  const featureAnchoringSection = buildFeatureAnchoringSection(beat);

  return `请分析这张图片中以下元素的一致性：

${elementDescriptions}
${featureAnchoringSection}
请评估每个元素的外观一致性，给出0-1的分数，并指出不一致的地方。
请用以下JSON格式回复：
{
  "scores": [
    {"name": "元素名", "score": 0.8, "issues": ["问题描述"]}
  ],
  "overallScore": 0.8,
  "recommendation": "accept" | "regenerate" | "adjust"
}`;
}

function buildFeatureAnchoringSection(beat: StoryBeat): string {
  if (!beat.featureAnchoring?.enabled) return "";

  const anchors = beat.featureAnchoring.characterAnchors || [];
  if (anchors.length === 0) return "";

  const anchorDescriptions = anchors
    .filter((anchor) => anchor.featureTags?.length)
    .map((anchor) => {
      const tags = anchor.featureTags.join(", ");
      return `- Key features to verify: ${tags} (weight: ${anchor.weight})`;
    })
    .join("\n");

  if (!anchorDescriptions) return "";

  return `\nFeature Anchoring Requirements:\n${anchorDescriptions}\n`;
}

interface ConsistencyAnalysisScore {
  name: string;
  score: number;
  issues: string[];
}

interface ConsistencyAnalysisResult {
  scores: ConsistencyAnalysisScore[];
  overallScore: number;
  recommendation: "accept" | "regenerate" | "adjust";
}

function parseConsistencyAnalysis(
  analysis: string,
  elements: StoryElement[],
): ConsistencyCheckResult {
  try {
    const parsed = tryParseAnalysisJson(analysis);

    if (!parsed) {
      return buildUnparseableResult(elements);
    }

    return mapAnalysisToResult(parsed, elements);
  } catch (e) {
    errorLogger.error(t("error.consistencyParseFailed"), e instanceof Error ? e : undefined);
    return {
      passed: false,
      characterScores: elements.map((el) => ({
        elementId: el.id,
        elementName: el.name,
        score: 0.5,
        issues: [t("error.consistencyParseFailed")],
      })),
      overallScore: 0.5,
      recommendation: "adjust",
    };
  }
}

function tryParseAnalysisJson(analysis: string): ConsistencyAnalysisResult | null {
  const directParsed = safeJsonParse<ConsistencyAnalysisResult | null>(analysis, null);
  if (directParsed && typeof directParsed === "object" && "scores" in directParsed) {
    return directParsed;
  }

  const codeBlockMatch = analysis.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const blockParsed = safeJsonParse<ConsistencyAnalysisResult | null>(codeBlockMatch[1], null);
    if (blockParsed && typeof blockParsed === "object" && "scores" in blockParsed) {
      return blockParsed;
    }
  }

  const jsonStr = extractJsonObject(analysis);
  if (jsonStr) {
    const regexParsed = safeJsonParse<ConsistencyAnalysisResult | null>(jsonStr, null);
    if (regexParsed && typeof regexParsed === "object" && "scores" in regexParsed) {
      return regexParsed;
    }
  }

  return null;
}

function buildUnparseableResult(elements: StoryElement[]): ConsistencyCheckResult {
  return {
    passed: false,
    characterScores: elements.map((el) => ({
      elementId: el.id,
      elementName: el.name,
      score: 0.5,
      issues: [t("error.consistencyParseFailed")],
    })),
    overallScore: 0.5,
    recommendation: "adjust",
  };
}

function mapAnalysisToResult(parsed: ConsistencyAnalysisResult, elements: StoryElement[]): ConsistencyCheckResult {
  const scores = parsed.scores || [];

  const characterScores = elements.map((el) => {
    const matched = scores.find(
      (s) => s.name === el.name || s.name.includes(el.name),
    );
    return {
      elementId: el.id,
      elementName: el.name,
      score: matched?.score ?? 0.7,
      issues: matched?.issues || [],
    };
  });

  const overallScore = parsed.overallScore ?? characterScores.reduce((s, c) => s + c.score, 0) / characterScores.length;

  return {
    passed: overallScore >= 0.6,
    characterScores,
    overallScore,
    recommendation: parsed.recommendation || (overallScore >= 0.8 ? "accept" : overallScore >= 0.6 ? "adjust" : "regenerate"),
  };
}

export function parseConsistencyAnalysisFromStructured(
  data: ConsistencyAnalysisResult,
  elements: StoryElement[],
): ConsistencyCheckResult {
  if (!data || !Array.isArray(data.scores)) {
    return buildUnparseableResult(elements);
  }
  return mapAnalysisToResult(data, elements);
}
