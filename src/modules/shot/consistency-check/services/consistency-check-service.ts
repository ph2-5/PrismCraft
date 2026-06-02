import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";
import { container } from "@/infrastructure/di";
import type { ConsistencyCheckResult, ElementBinding, StoryBeat, StoryElement } from "@/domain/schemas";
import { safeJsonParse } from "@/shared/utils/safe-json";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants/messages";

export interface ConsistencyCheckInput {
  beat: StoryBeat;
  elements: StoryElement[];
  generatedImageUrl?: string;
}

export async function checkVisualConsistency(
  input: ConsistencyCheckInput,
): Promise<Result<ConsistencyCheckResult>> {
  const { beat, elements, generatedImageUrl } = input;

  if (!generatedImageUrl) {
    return ok({
      passed: true,
      characterScores: [],
      overallScore: 1.0,
      recommendation: "accept",
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

  try {
    const prompt = buildConsistencyPrompt(boundElements, beat);
    const analysisResult = await container.imageApi.analyze(generatedImageUrl, "scene", prompt);

    if (!analysisResult.ok) {
      return err(new AppError("CONSISTENCY_CHECK_FAILED", "无法执行一致性检查", analysisResult.error));
    }

    const analysis = analysisResult.value.analysis;
    const parsed = parseConsistencyAnalysis(analysis, boundElements);

    return ok(parsed);
  } catch (e) {
    return err(new AppError("CONSISTENCY_CHECK_ERROR", "检查过程出错", e));
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

  return `请分析这张图片中以下元素的一致性：

${elementDescriptions}

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
    const jsonMatch = analysis.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        passed: false,
        characterScores: elements.map((el) => ({
          elementId: el.id,
          elementName: el.name,
          score: 0.5,
          issues: ["AI返回格式无法解析"],
        })),
        overallScore: 0.5,
        recommendation: "adjust",
      };
    }

    const parsed = safeJsonParse<ConsistencyAnalysisResult>(jsonMatch[0], {
      scores: [],
      overallScore: 0.5,
      recommendation: "adjust",
    });
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
