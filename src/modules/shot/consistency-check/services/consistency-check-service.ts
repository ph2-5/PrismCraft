import type { Result } from "@/domain/types";
import { ok } from "@/domain/types";
import { container } from "@/infrastructure/di";
import type { ConsistencyCheckResult, ElementBinding, StoryBeat, StoryElement } from "@/domain/schemas";
import { safeJsonParse } from "@/shared/utils/safe-json";

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
      return ok({
        passed: false,
        characterScores: boundElements.map((el) => ({
          elementId: el.id,
          elementName: el.name,
          score: 0.5,
          issues: ["无法执行一致性检查"],
        })),
        overallScore: 0.5,
        recommendation: "adjust",
      });
    }

    const analysis = analysisResult.value.analysis;
    const parsed = parseConsistencyAnalysis(analysis, boundElements);

    return ok(parsed);
  } catch {
    return ok({
      passed: false,
      characterScores: boundElements.map((el) => ({
        elementId: el.id,
        elementName: el.name,
        score: 0.5,
        issues: ["检查过程出错"],
      })),
      overallScore: 0.5,
      recommendation: "adjust",
    });
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

    const parsed = safeJsonParse(jsonMatch[0], {}) as Record<string, any>;
    const scores = parsed.scores || [];

    const characterScores = elements.map((el) => {
      const matched = scores.find(
        (s: { name: string }) => s.name === el.name || s.name.includes(el.name),
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
  } catch {
    return {
      passed: false,
      characterScores: elements.map((el) => ({
        elementId: el.id,
        elementName: el.name,
        score: 0.5,
        issues: ["一致性分析结果解析失败"],
      })),
      overallScore: 0.5,
      recommendation: "adjust",
    };
  }
}
