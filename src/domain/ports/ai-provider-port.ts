import type {
  ApiResponse,
  VideoGenerationResult,
  ImageGenerationResult,
} from "@/domain/schemas/api";

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
