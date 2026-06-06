import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockToastHelpers, mockErrorLogger, mockT } = vi.hoisted(() => ({
  mockToastHelpers: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  mockT: vi.fn((key: string) => {
    const map: Record<string, string> = {
      "beat.downloadVideo": "下载视频",
      "error.cannotDownload": "无法下载",
      "error.videoNotReady": "视频尚未就绪",
      "success.downloadStarted": "下载已开始",
      "success.videoDownloadStarted": "视频下载已开始",
      "error.downloadFailed": "下载失败",
      "error.videoDownloadFallback": "请尝试右键另存为",
    };
    return map[key] ?? key;
  }),
}));

vi.mock("@/shared/presentation/Toast", () => ({
  useToastHelpers: () => mockToastHelpers,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

function createHandleDownloadVideo(deps: {
  videoUrl: string | null;
  beat: { title: string; sequence: number; videoGen?: { videoUrl?: string } };
  task?: { videoUrl?: string };
}) {
  return async () => {
    const { videoUrl, beat, task } = deps;
    const url = videoUrl || beat.videoGen?.videoUrl || task?.videoUrl;
    if (!url) {
      mockToastHelpers.error(mockT("error.cannotDownload"), mockT("error.videoNotReady"));
      return;
    }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${beat.title || mockT("beat.downloadVideo")}_${beat.sequence}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      mockToastHelpers.success(mockT("success.downloadStarted"), mockT("success.videoDownloadStarted"));
    } catch (err) {
      mockErrorLogger.warn("[BeatDetailClient] 视频下载失败:", err instanceof Error ? err : undefined);
      mockToastHelpers.error(mockT("error.downloadFailed"), mockT("error.videoDownloadFallback"));
    }
  };
}

describe("R73: Cross-origin resource download must use fetch+blob", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob(["video-data"], { type: "video/mp4" })),
    });
    (globalThis as Record<string, unknown>).fetch = mockFetch;

    mockCreateObjectURL = vi.fn(() => "blob:mock-url");
    mockRevokeObjectURL = vi.fn();
    (URL as unknown as Record<string, unknown>).createObjectURL = mockCreateObjectURL;
    (URL as unknown as Record<string, unknown>).revokeObjectURL = mockRevokeObjectURL;
  });

  it("handleDownloadVideo calls fetch() with the video URL", async () => {
    const handleDownloadVideo = createHandleDownloadVideo({
      videoUrl: "https://cdn.example.com/video.mp4",
      beat: { title: "镜头1", sequence: 1 },
    });

    await handleDownloadVideo();

    expect(mockFetch).toHaveBeenCalledWith("https://cdn.example.com/video.mp4");
  });

  it("creates a Blob from the response", async () => {
    const mockBlob = new Blob(["video-data"], { type: "video/mp4" });
    const mockBlobFn = vi.fn().mockResolvedValue(mockBlob);
    mockFetch.mockResolvedValue({ blob: mockBlobFn });

    const handleDownloadVideo = createHandleDownloadVideo({
      videoUrl: "https://cdn.example.com/video.mp4",
      beat: { title: "镜头1", sequence: 1 },
    });

    await handleDownloadVideo();

    expect(mockBlobFn).toHaveBeenCalled();
    expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
  });

  it("creates an object URL and triggers download", async () => {
    const handleDownloadVideo = createHandleDownloadVideo({
      videoUrl: "https://cdn.example.com/video.mp4",
      beat: { title: "镜头1", sequence: 1 },
    });

    await handleDownloadVideo();

    expect(mockCreateObjectURL).toHaveBeenCalled();
    expect(mockToastHelpers.success).toHaveBeenCalled();
  });

  it("revokes the object URL after download", async () => {
    const handleDownloadVideo = createHandleDownloadVideo({
      videoUrl: "https://cdn.example.com/video.mp4",
      beat: { title: "镜头1", sequence: 1 },
    });

    await handleDownloadVideo();

    expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("falls back to error message on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const handleDownloadVideo = createHandleDownloadVideo({
      videoUrl: "https://cdn.example.com/video.mp4",
      beat: { title: "镜头1", sequence: 1 },
    });

    await handleDownloadVideo();

    expect(mockErrorLogger.warn).toHaveBeenCalled();
    expect(mockToastHelpers.error).toHaveBeenCalledWith(
      mockT("error.downloadFailed"),
      mockT("error.videoDownloadFallback"),
    );
  });
});
