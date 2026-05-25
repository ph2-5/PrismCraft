import type { VideoModelFormat } from "@/domain/types";
import type { VideoCodecInfo } from "@/shared/video-utils/video-codec";
import { getProviderSupportedCodecs, getProviderMaxDuration } from "@/infrastructure/ai-providers/model-adapter";

export type { VideoCodec, AudioCodec, ContainerFormat, VideoCodecInfo } from "@/shared/video-utils/video-codec";
export { detectVideoCodec, getVideoCodecLabel, getContainerLabel } from "@/shared/video-utils/video-codec";

export function isCodecSupportedByProvider(
  codecInfo: VideoCodecInfo,
  providerFormat: VideoModelFormat,
): { supported: boolean; reason?: string } {
  const allowed = getProviderSupportedCodecs(providerFormat);
  if (!allowed || allowed.length === 0) {
    return { supported: true };
  }

  if (!allowed.includes(codecInfo.videoCodec)) {
    return {
      supported: false,
      reason: `${providerFormat} 不支持 ${codecInfo.videoCodec.toUpperCase()} 编码，支持: ${allowed.map((c) => c.toUpperCase()).join(", ")}`,
    };
  }

  const maxDur = getProviderMaxDuration(providerFormat);
  if (maxDur && codecInfo.duration > maxDur) {
    return {
      supported: false,
      reason: `${providerFormat} 最大支持 ${maxDur} 秒视频，当前视频 ${Math.round(codecInfo.duration)} 秒`,
    };
  }

  return { supported: true };
}
