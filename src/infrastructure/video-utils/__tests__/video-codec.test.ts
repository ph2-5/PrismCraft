import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isCodecSupportedByProvider,
} from "@/shared/video-utils/codec-check";
import type { VideoCodecInfo } from "@/shared/video-utils/video-codec";
import { getVideoCodecLabel, getContainerLabel } from "@/shared/video-utils/video-codec";

vi.mock("@/shared/video-utils/provider-codecs", () => ({
  getProviderSupportedCodecs: vi.fn(),
  getProviderMaxDuration: vi.fn(),
}));

import { getProviderSupportedCodecs, getProviderMaxDuration } from "@/shared/video-utils/provider-codecs";
import type { VideoCodec } from "@/shared/video-utils/video-codec";

const mockedGetProviderSupportedCodecs = vi.mocked(getProviderSupportedCodecs);
const mockedGetProviderMaxDuration = vi.mocked(getProviderMaxDuration);

function makeCodecInfo(
  overrides: Partial<VideoCodecInfo> = {},
): VideoCodecInfo {
  return {
    container: "mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    width: 1920,
    height: 1080,
    duration: 10,
    fps: 30,
    bitrate: 5000000,
    ...overrides,
  };
}

describe("isCodecSupportedByProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provider 支持该编码时返回 supported: true", () => {
    mockedGetProviderSupportedCodecs.mockReturnValue(["h264", "h265"] as VideoCodec[]);
    mockedGetProviderMaxDuration.mockReturnValue(undefined);

    const result = isCodecSupportedByProvider(
      makeCodecInfo({ videoCodec: "h264" }),
      "volcengine",
    );

    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("provider 不支持该编码时返回 supported: false，reason 包含编码名", () => {
    mockedGetProviderSupportedCodecs.mockReturnValue(["h265"] as VideoCodec[]);
    mockedGetProviderMaxDuration.mockReturnValue(undefined);

    const result = isCodecSupportedByProvider(
      makeCodecInfo({ videoCodec: "h264" }),
      "kuaishou",
    );

    expect(result.supported).toBe(false);
    expect(result.reason).toContain("H264");
  });

  it("provider 返回空数组时无限制，返回 supported: true", () => {
    mockedGetProviderSupportedCodecs.mockReturnValue([] as VideoCodec[]);
    mockedGetProviderMaxDuration.mockReturnValue(undefined);

    const result = isCodecSupportedByProvider(
      makeCodecInfo({ videoCodec: "h264" }),
      "zhipu",
    );

    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("provider 返回 null 时无限制，返回 supported: true", () => {
    mockedGetProviderSupportedCodecs.mockReturnValue(null as unknown as VideoCodec[]);
    mockedGetProviderMaxDuration.mockReturnValue(undefined);

    const result = isCodecSupportedByProvider(
      makeCodecInfo({ videoCodec: "h264" }),
      "zhipu",
    );

    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("视频时长超过 provider 最大时长时返回 supported: false，reason 包含时长信息", () => {
    mockedGetProviderSupportedCodecs.mockReturnValue(["h264"] as VideoCodec[]);
    mockedGetProviderMaxDuration.mockReturnValue(15);

    const result = isCodecSupportedByProvider(
      makeCodecInfo({ videoCodec: "h264", duration: 30 }),
      "volcengine",
    );

    expect(result.supported).toBe(false);
    expect(result.reason).toContain("15");
    expect(result.reason).toContain("30");
  });

  it("视频时长在 provider 最大时长内时返回 supported: true", () => {
    mockedGetProviderSupportedCodecs.mockReturnValue(["h264"] as VideoCodec[]);
    mockedGetProviderMaxDuration.mockReturnValue(60);

    const result = isCodecSupportedByProvider(
      makeCodecInfo({ videoCodec: "h264", duration: 10 }),
      "volcengine",
    );

    expect(result.supported).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe("getVideoCodecLabel", () => {
  it('h264 应返回 "H.264/AVC"', () => {
    expect(getVideoCodecLabel("h264")).toBe("H.264/AVC");
  });

  it('h265 应返回 "H.265/HEVC"', () => {
    expect(getVideoCodecLabel("h265")).toBe("H.265/HEVC");
  });

  it('unknown 应返回 "未知"', () => {
    expect(getVideoCodecLabel("unknown")).toBe("未知");
  });
});

describe("getContainerLabel", () => {
  it('mp4 应返回 "MP4"', () => {
    expect(getContainerLabel("mp4")).toBe("MP4");
  });

  it('unknown 应返回 "未知"', () => {
    expect(getContainerLabel("unknown")).toBe("未知");
  });
});
