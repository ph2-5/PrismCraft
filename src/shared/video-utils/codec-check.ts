import type { VideoModelFormat } from "@/domain/types";
import type { VideoCodecInfo } from "./video-codec";
import { getProviderSupportedCodecs, getProviderMaxDuration } from "./provider-codecs";
import { t } from "@/shared/constants";

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
      reason: t("error.codecNotSupported", {
        provider: providerFormat,
        codec: codecInfo.videoCodec.toUpperCase(),
        supported: allowed.map((c) => c.toUpperCase()).join(", "),
      }),
    };
  }

  const maxDur = getProviderMaxDuration(providerFormat);
  if (maxDur && codecInfo.duration > maxDur) {
    return {
      supported: false,
      reason: t("error.durationExceeds", {
        provider: providerFormat,
        max: maxDur,
        current: Math.round(codecInfo.duration),
      }),
    };
  }

  return { supported: true };
}
