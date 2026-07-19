import type {
  ApiResponse,
  VideoGenerationResult,
  ImageGenerationResult,
} from "@/domain/schemas/api";
import type { LLMMessage } from "@/domain/schemas/llm-message";

export interface IVideoProvider {
  generateVideo(
    prompt: string,
    options?: {
      firstFrameUrl?: string;
      lastFrameUrl?: string;
      characterRefs?: string[];
      characterRef?: string;
      sceneRef?: string;
      duration?: number;
      referenceVideo?: string | null;
      providerId?: string;
      modelId?: string;
      format?: string;
    },
  ): Promise<ApiResponse<VideoGenerationResult>>;

  queryVideoStatus(
    taskId: string,
    options?: {
      providerId?: string;
      modelId?: string;
      format?: string;
    },
  ): Promise<
    ApiResponse<{
      status: "pending" | "generating" | "completed" | "failed";
      videoUrl?: string;
      progress?: number;
      message?: string;
    }>
  >;

  generateKeyframe(params: {
    characterRefs?: string[];
    characterRef?: string;
    sceneRef?: string;
    prevKeyframe?: string;
    shotRequirement?: {
      shotType?: string;
      cameraAngle?: string;
      cameraMovement?: string;
      action?: string;
    };
    content?: string;
    providerId?: string;
    modelId?: string;
    format?: string;
  }): Promise<
    ApiResponse<{
      imageUrl: string;
      source?: string;
      prompt?: string;
    }>
  >;

  generateFramePair(params: {
    keyframeUrl: string;
    keyframePrompt?: string;
    characterRefs?: string[];
    characterRef?: string;
    sceneRef?: string;
    prevLastFrameUrl?: string;
    actionDescription?: string;
    duration?: number;
    providerId?: string;
    modelId?: string;
    format?: string;
  }): Promise<
    ApiResponse<{
      firstFrame: {
        imageUrl: string;
        prompt: string;
        derivedFrom: string;
      };
      lastFrame: {
        imageUrl: string;
        prompt: string;
        derivedFrom: string;
      };
      generatedAt: number;
    }>
  >;

  generateVideoWithFrames(params: {
    prompt: string;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    characterRefs?: string[];
    characterRef?: string;
    sceneRef?: string;
    duration?: number;
    providerId?: string;
    modelId?: string;
    format?: string;
    referenceVideo?: string | null;
  }): Promise<ApiResponse<VideoGenerationResult>>;

  /**
   * Task 2A.22: 局部重绘（Seedance 2.5 局部编辑 API）
   *
   * 在已生成视频上做局部重绘 — 保持 mask 外像素不变，仅修改 mask 内区域。
   * 仅 supportsPartialEdit=true 的模型支持（如 Seedance 2.5）。
   *
   * 实现端通过此方法走局部编辑专用 API（不同于 generateVideo）。
   * 不改 generateVideo() — 隔离新功能。
   *
   * @param input.sourceVideoUrl 原视频 URL
   * @param input.maskBase64 mask 的 base64 PNG（白色=重绘，黑色=保留）
   * @param input.prompt 完整重绘指令（含"保持背景"等约束）
   * @param input.videoTimestamp 标记帧的时间戳（秒）
   * @param input.preserveUnmasked 是否保持 mask 外不变（默认 true）
   */
  generatePartialEdit?(input: {
    sourceVideoUrl: string;
    maskBase64: string;
    prompt: string;
    videoTimestamp: number;
    preserveUnmasked: boolean;
    providerId?: string;
    modelId?: string;
    format?: string;
    duration?: number;
  }): Promise<ApiResponse<VideoGenerationResult>>;

  /**
   * Best-effort server-side task cancellation.
   * Implementations that support cancellation SHOULD override this;
   * callers treat failure as non-fatal (best-effort).
   */
  cancelTask?(taskId: string): Promise<void>;
}

export interface IImageProvider {
  generateImage(
    prompt: string,
    type?: string,
    options?: {
      size?: string;
      providerId?: string;
      modelId?: string;
      purpose?: string;
    },
  ): Promise<ApiResponse<ImageGenerationResult>>;

  analyzeImage(
    imageUrl: string,
    type?: "character" | "scene",
    prompt?: string,
    options?: {
      providerId?: string;
      modelId?: string;
    },
  ): Promise<
    ApiResponse<{
      analysis: string;
      analyzed?: Record<string, unknown>;
    }>
  >;
}

export interface ITextProvider {
  generateText(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ text: string }>>;

  /**
   * 流式文本生成（Task 1.0）。
   * 通过 onChunk 回调逐块返回内容，避免等待完整响应。
   * 用于 Agent Loop 的实时推理输出。
   */
  generateTextStream(
    prompt: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
      tools?: ToolDef[];
      onChunk: (chunk: StreamChunk) => void;
      /** P1-1 修复：支持外部 abort，让用户取消按钮在 LLM 推理期间生效 */
      signal?: AbortSignal;
    },
  ): Promise<ApiResponse<{ text: string }>>;

  /**
   * 原生对话补全（Chat Completion）。
   *
   * 与 generateTextStream 的区别：
   * - 接收结构化 messages 数组（含 role/tool_calls/tool_call_id），而非单字符串 prompt
   * - 支持原生 function calling，LLM 以结构化格式理解工具调用历史
   * - 流式 + 非流式统一入口（onChunk 可选：有则流式，无则非流式）
   *
   * 能力自适应：当 provider 支持原生 function calling 时，AgentLoop 优先调用此方法；
   * 不支持时降级到 generateTextStream + serializeMessages。
   */
  generateChat(
    messages: LLMMessage[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      providerId?: string;
      modelId?: string;
      tools?: ToolDef[];
      onChunk?: (chunk: StreamChunk) => void;
      signal?: AbortSignal;
    },
  ): Promise<ApiResponse<{ text: string }>>;
}

/**
 * 工具定义（OpenAI function-calling 格式）。
 * 供 Agent Loop 在推理时声明可调用的工具。
 */
export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * 工具调用请求（模型生成）。
 * arguments 是 JSON 字符串，需在执行前 parse。
 */
export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 流式生成的单个 chunk。
 * - delta: 本次新增的文本片段
 * - toolCalls: 模型请求调用的工具（仅在 finishReason === "tool_calls" 时有值）
 * - finishReason: 结束原因（stop=正常结束 / tool_calls=请求工具 / length=达到 maxTokens）
 */
export interface StreamChunk {
  delta: string;
  toolCalls?: ToolCall[];
  finishReason?: "stop" | "tool_calls" | "length";
}

export interface IFileUploader {
  uploadFile(file: File): Promise<
    | { success: true; data: { url: string; [key: string]: unknown }; source?: string; error?: string; message?: string }
    | { success: false; error: string; message?: string; data?: { url: string; [key: string]: unknown } }
  >;
}

/**
 * Embedding Provider 接口（向量嵌入生成）
 *
 * 用途：
 * - 记忆系统的语义检索（将文本转为向量后做余弦相似度匹配）
 * - 跨会话内容去重与相关性排序
 * - 未来可扩展到图片/多模态 embedding
 *
 * 实现端点：调用本地 Electron HTTP 服务 `/api/generate-embedding`，
 * 由 api-gateway 转发到 OpenAI 兼容的 `/embeddings` 接口。
 */
export interface IEmbeddingProvider {
  /**
   * 生成单段文本的向量嵌入
   * @param input 文本内容
   * @returns 向量数组（维度由模型决定，OpenAI text-embedding-3-small 为 1536 维）
   */
  generateEmbedding(
    input: string,
    options?: {
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ embedding: number[] }>>;

  /**
   * 批量生成向量嵌入（提升网络效率）
   * @param inputs 文本数组（建议单批 <= 64 条，避免超时）
   * @returns 向量数组的数组，与输入顺序一一对应
   */
  generateEmbeddings?(
    inputs: string[],
    options?: {
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ embeddings: number[][] }>>;
}

/**
 * 音频能力类型
 * - tts：文字转语音（Text-to-Speech）
 * - stt：语音转文字（Speech-to-Text，转写）
 * - music：配乐生成（异步任务，类似视频生成）
 * - voiceover：旁白配音（基于 TTS 但带情感与语速控制）
 */
export type AudioCapability = "tts" | "stt" | "music" | "voiceover";

/**
 * 音频 Provider 接口
 *
 * 实现端点：调用本地 Electron HTTP 服务 `/api/generate-audio` 与 `/api/transcribe-audio`。
 * 由于各家 provider 的音频 API 差异较大，当前实现以 OpenAI 兼容格式为主
 * （`/audio/speech` 与 `/audio/transcriptions`），其他格式通过插件扩展。
 */
export interface IAudioProvider {
  /**
   * 文字转语音（同步返回音频 URL）
   * @param text 待合成语音的文本
   * @param options.voice 音色（如 "alloy"/"echo"/"nova"，OpenAI 标准）
   * @param options.format 输出格式（"mp3"/"wav"/"opus"）
   * @returns 音频文件 URL（本地缓存路径或远程 URL）
   */
  synthesizeSpeech(
    text: string,
    options?: {
      voice?: string;
      format?: string;
      speed?: number;
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ audioUrl: string; duration?: number }>>;

  /**
   * 语音转文字（转写）
   * @param audioUrl 音频文件 URL
   * @returns 转写后的文本
   */
  transcribeAudio?(
    audioUrl: string,
    options?: {
      language?: string;
      providerId?: string;
      modelId?: string;
    },
  ): Promise<ApiResponse<{ text: string; segments?: Array<{ start: number; end: number; text: string }> }>>;
}
