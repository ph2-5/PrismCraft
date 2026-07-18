/**
 * Novel Tool 5 — breakdown_text_to_shots
 *
 * 将小说段落文本转换为分镜拆解（ShotBreakdown[]）。
 * 每个分镜包含：description、shotType、cameraAngle、cameraMovement、action、characters（引用）、estimatedDuration。
 * 返回 { shots: ShotBreakdown[] }。
 *
 * 注：分镜转提示词使用统一的 generate_prompt 工具（模式 2），无需单独工具。
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { errorLogger } from "@/shared/error-logger";
import type { ShotBreakdown } from "../domain/types";
import { generateJsonArrayWithAI, asString, asNumber, asStringArray } from "./helpers";

export const breakdownTextToShotsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "breakdown_text_to_shots",
      description:
        "将小说段落文本转换为分镜拆解（ShotBreakdown[]）。" +
        "每个分镜包含：sequence（序号）、description（描述）、shotType（景别：特写/近景/中景/全景/远景）、" +
        "cameraAngle（机位角度：平视/俯视/仰视/侧视）、cameraMovement（运镜：固定/推拉摇移/跟随）、" +
        "action（动作描述）、characters（角色名引用数组）、estimatedDuration（预估时长秒）。" +
        "返回 { shots: ShotBreakdown[] }。" +
        "注：分镜转提示词使用统一的 generate_prompt 工具，无需单独工具。",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "小说段落文本（必填）",
          },
          charactersJson: {
            type: "string",
            description: "段落中出现的角色 JSON 数组（来自 extract_characters_from_text），用于分镜的 characters 引用",
          },
          sceneId: {
            type: "string",
            description: "段落对应的场景 ID（可选，关联到场景库）",
          },
        },
        required: ["text"],
      },
    },
  },
  domain: "novel",
  dangerLevel: "safe",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args) {
    const text = asString(args.text);
    if (!text) {
      return { success: false, error: "参数 text 不能为空" };
    }
    const sceneId = asString(args.sceneId);

    let characterNames: string[] = [];
    const charactersJson = asString(args.charactersJson);
    if (charactersJson) {
      try {
        const parsed = JSON.parse(charactersJson);
        if (Array.isArray(parsed)) {
          // 提取角色名（支持 ExtractedCharacter 格式或纯字符串数组）
          characterNames = parsed
            .map((c) => {
              if (typeof c === "string") return c;
              if (c !== null && typeof c === "object" && "name" in c) {
                return String((c as Record<string, unknown>).name);
              }
              return "";
            })
            .filter((n) => n.length > 0);
        }
      } catch (err) {
        // P1-3: 解析失败时记录日志，按无角色引用处理继续
        errorLogger.warn("[breakdown-shots] charactersJson 解析失败，按无角色引用处理", err);
      }
    }

    const prompt = `你是专业分镜师。请将以下小说段落转换为视频分镜。

要求：
1. 按故事节奏拆分为多个分镜（通常 3-8 个）
2. 每个分镜包含：
   - sequence（序号，从 1 开始）
   - description（分镜描述，20-50字）
   - shotType（景别：特写/近景/中景/全景/远景）
   - cameraAngle（机位角度：平视/俯视/仰视/侧视/鸟瞰）
   - cameraMovement（运镜：固定/推/拉/摇/移/跟/升降）
   - action（动作描述，30字内）
   - characters（出场角色名数组，只能从给定角色列表中选）
   - estimatedDuration（预估时长秒数）
3. 角色引用必须使用给定的角色名，不要编造新角色
${characterNames.length > 0 ? `4. 可用角色列表：${characterNames.join(", ")}` : "4. 本段无明确角色，characters 字段为空数组"}

小说段落：
${text}

请只返回 JSON 数组，每个分镜一个对象。`;

    const raw = await generateJsonArrayWithAI(prompt, 4000);
    if (!raw) {
      return { success: false, error: "AI 分镜拆解失败或返回格式解析失败" };
    }

    const shots: ShotBreakdown[] = raw.map((item, i) => {
      const s = (item ?? {}) as Record<string, unknown>;
      return {
        id: crypto.randomUUID(),
        sequence: asNumber(s.sequence, i + 1),
        description: asString(s.description),
        shotType: asString(s.shotType, "中景"),
        cameraAngle: asString(s.cameraAngle, "平视"),
        cameraMovement: asString(s.cameraMovement, "固定"),
        action: asString(s.action),
        characters: asStringArray(s.characters),
        sceneId: sceneId || undefined,
        estimatedDuration: asNumber(s.estimatedDuration, 5),
        status: "draft" as const,
      };
    });

    return { success: true, data: { shots } };
  },
};
