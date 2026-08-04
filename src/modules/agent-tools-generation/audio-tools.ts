/**
 * AI 生成工具 — 音频类（Audio Tools）
 *
 * 包含工具：
 * - generate_music：生成配乐（当前不支持，优雅降级）
 * - generate_voiceover：生成旁白配音（当前不支持，优雅降级）
 * - text_to_speech：文字转语音（TTS，OpenAI 兼容 /audio/speech）
 * - transcribe_audio：音频转文字（STT，OpenAI 兼容 /audio/transcriptions）
 *
 * 设计要点：
 * - 音频类能力依赖 container.audioProvider
 * - 未配置时返回清晰错误信息和配置建议（unsupportedAudioResult）
 * - 错误消息脱敏（防止泄露 API key / endpoint）
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { container } from "@/infrastructure/di";

/** 构建音频类工具不支持的统一返回结果 */
function unsupportedAudioResult(capability: string, suggestion: string): {
  success: false;
  error: string;
  data: { suggestion: string; capability: string };
} {
  return {
    success: false,
    error: `当前未配置支持${capability}的 provider。请在设置中配置支持 ${capability} 能力的 API。`,
    data: { suggestion, capability },
  };
}

/** 生成配乐 */
export const generateMusicTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_music",
      description:
        "生成背景配乐。当前项目暂未集成音频生成 provider，调用会返回不支持提示和配置建议。" +
        "适用于：用户要求「生成背景音乐」、「配乐」、「BGM」等场景。",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            maxLength: 5000,
            description: "音乐风格描述，如「悬疑紧张的背景音乐」、「温馨欢快的旋律」",
          },
          duration: { type: "number", minimum: 1, maximum: 300, description: "时长（秒），默认 30", default: 30 },
          providerId: { type: "string", maxLength: 100, description: "指定音频 provider ID" },
          modelId: { type: "string", maxLength: 100, description: "指定音频 model ID" },
        },
        required: ["prompt"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute() {
    return unsupportedAudioResult(
      "音频生成",
      "可配置 Suno API 或类似音频生成服务，并在能力映射中添加 audio 能力。",
    );
  },
};

/** 生成旁白配音 */
export const generateVoiceoverTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "generate_voiceover",
      description:
        "生成旁白配音。当前项目暂未集成语音合成 provider，调用会返回不支持提示和配置建议。" +
        "适用于：用户要求「生成旁白」、「配音」、「朗读这段文字」等场景。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "旁白文本（必填）" },
          voice: {
            type: "string",
            description: "声音类型，如「男声」、「女声」、「中性」",
          },
          speed: {
            type: "number",
            description: "语速（0.5-2.0），默认 1.0",
            default: 1.0,
          },
          providerId: { type: "string", description: "指定语音 provider ID" },
          modelId: { type: "string", description: "指定语音 model ID" },
        },
        required: ["text"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute() {
    return unsupportedAudioResult(
      "语音合成",
      "可配置 TTS 服务（如 Azure TTS、阿里云语音合成）并在能力映射中添加 audio 能力。",
    );
  },
};

/** 文字转语音 */
export const textToSpeechTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "text_to_speech",
      description:
        "文字转语音（TTS）。通过已配置的 audio provider 调用 OpenAI 兼容的 /audio/speech 端点。" +
        "若未配置 audio 能力，返回清晰错误和配置建议。" +
        "适用于：用户要求「把这段文字转成语音」、「朗读」等场景。",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "要转换的文本（必填）" },
          voice: { type: "string", description: "声音类型（如 alloy/echo/nova/fable/onyx/shimmer，OpenAI 标准）" },
          format: { type: "string", description: "输出格式（mp3/wav/opus），默认 mp3" },
          speed: { type: "number", description: "语速（0.5-2.0），默认 1.0" },
          providerId: { type: "string", description: "指定 TTS provider ID" },
          modelId: { type: "string", description: "指定 TTS model ID" },
        },
        required: ["text"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args: { text: string; voice?: string; format?: string; speed?: number; providerId?: string; modelId?: string }) {
    try {
      const result = await container.audioProvider.synthesizeSpeech(args.text, {
        voice: args.voice,
        format: args.format,
        speed: args.speed,
        providerId: args.providerId,
        modelId: args.modelId,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "TTS 失败",
          data: { suggestion: "请确认已在设置中配置支持 audio 能力的 provider（如 OpenAI TTS）" },
        };
      }

      return {
        success: true,
        data: {
          audioUrl: result.data.audioUrl,
          duration: result.data.duration,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("没有配置") || message.includes("CONFIG_MISSING")) {
        return unsupportedAudioResult(
          "文字转语音",
          "可配置 TTS 服务（如 OpenAI TTS、Azure 语音服务）并在能力映射中添加 audio 能力。",
        );
      }
      // 脱敏错误消息（防止泄露 API key / endpoint）
      const safeMsg = message.replace(/(?:sk|key|token|api[_-]?key|bearer)[-_:\s=]+[a-zA-Z0-9]{8,}/gi, "[REDACTED]").slice(0, 300);
      return { success: false, error: `TTS 调用失败：${safeMsg}` };
    }
  },
};

/** 音频转文字 */
export const transcribeAudioTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "transcribe_audio",
      description:
        "音频转文字（语音识别/转写 STT）。通过已配置的 audio provider 调用 OpenAI 兼容的 /audio/transcriptions 端点。" +
        "若未配置 audio 能力，返回清晰错误和配置建议。" +
        "适用于：用户要求「把这段音频转成文字」、「识别语音」等场景。",
      parameters: {
        type: "object",
        properties: {
          audioUrl: { type: "string", maxLength: 2048, description: "音频文件 URL（必填，支持 local://、http(s)://、本地路径）" },
          language: { type: "string", maxLength: 200, description: "音频语言代码，如 zh、en" },
          providerId: { type: "string", maxLength: 100, description: "指定 ASR provider ID" },
          modelId: { type: "string", maxLength: 100, description: "指定 ASR model ID" },
        },
        required: ["audioUrl"],
      },
    },
  },
  domain: "generation",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.generation,
  async execute(args: { audioUrl: string; language?: string; providerId?: string; modelId?: string }) {
    try {
      const transcribe = container.audioProvider.transcribeAudio;
      if (!transcribe) {
        return unsupportedAudioResult(
          "语音识别",
          "当前 audio provider 未实现 transcribeAudio 方法。",
        );
      }

      const result = await transcribe(args.audioUrl, {
        language: args.language,
        providerId: args.providerId,
        modelId: args.modelId,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || "STT 失败",
          data: { suggestion: "请确认已在设置中配置支持 audio 能力的 provider（如 OpenAI Whisper）" },
        };
      }

      return {
        success: true,
        data: {
          text: result.data.text,
          segments: result.data.segments,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("没有配置") || message.includes("CONFIG_MISSING")) {
        return unsupportedAudioResult(
          "语音识别",
          "可配置 ASR 服务（如 OpenAI Whisper、阿里云语音识别）并在能力映射中添加 audio 能力。",
        );
      }
      // 脱敏错误消息（防止泄露 API key / endpoint）
      const safeMsg = message.replace(/(?:sk|key|token|api[_-]?key|bearer)[-_:\s=]+[a-zA-Z0-9]{8,}/gi, "[REDACTED]").slice(0, 300);
      return { success: false, error: `语音识别调用失败：${safeMsg}` };
    }
  },
};
