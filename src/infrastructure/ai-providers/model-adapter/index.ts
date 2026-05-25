import type { VideoCodec } from "@/shared/video-utils/video-codec";
export type { VideoCodec };

const PROVIDER_CODEC_SUPPORT: Record<string, VideoCodec[]> = {
  volcengine: ["h264", "h265"],
  kuaishou: ["h264", "h265"],
  zhipu: ["h264"],
  pixverse: ["h264", "h265"],
  seedance: ["h264", "h265"],
  google: ["h264", "h265", "vp9"],
  anthropic: ["h264", "h265"],
  "openai-sora": ["h264", "h265"],
  minimax: ["h264", "h265"],
  "openai-compatible": ["h264", "h265"],
  openai: ["h264", "h265"],
};

const PROVIDER_MAX_DURATION: Record<string, number> = {
  volcengine: 12,
  kuaishou: 10,
  zhipu: 10,
  pixverse: 10,
  seedance: 12,
  google: 8,
  "openai-sora": 20,
  minimax: 10,
  "openai-compatible": 12,
};

export function getProviderSupportedCodecs(format: string): VideoCodec[] {
  return PROVIDER_CODEC_SUPPORT[format] || PROVIDER_CODEC_SUPPORT["openai-compatible"] || [];
}

export function getProviderMaxDuration(format: string): number | undefined {
  return PROVIDER_MAX_DURATION[format];
}
