/**
 * ffmpeg-service 单元测试
 *
 * 覆盖 13 个公共 API + 缓存 + 错误路径 + 组合操作：
 * - A. checkFfmpegAvailable + resetFfmpegCache（缓存 TTL 行为）
 * - B. 参数构造逻辑（验证 fetch 调用参数）
 * - C. 错误路径（HTTP 非 200、result.success=false、getCacheDirectory 失败、writeFile 失败、splitAudio 中断）
 * - D. composeFinalVideo（步骤串联）
 *
 * Mock 策略：
 * - vi.stubGlobal("fetch", ...) — mock HTTP 调用（/api/ffmpeg/execute、/api/ffmpeg/probe）
 * - vi.mock("@/shared/file-http") — mock getConfig / getCacheDirectory / writeFile / deleteFile
 * - beforeEach 中调用 resetFfmpegCache() 清除模块级缓存
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getCacheDirectory: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock("@/shared/file-http", () => ({
  getConfig: mocks.getConfig,
  getCacheDirectory: mocks.getCacheDirectory,
  writeFile: mocks.writeFile,
  deleteFile: mocks.deleteFile,
}));

import {
  checkFfmpegAvailable,
  resetFfmpegCache,
  executeFfmpeg,
  mixAudio,
  adjustAudioSpeed,
  normalizeAudio,
  removeNoise,
  splitAudio,
  mergeVideos,
  trimVideo,
  addTransition,
  addSubtitle,
  adjustVideoSpeed,
  extractAudio,
  replaceAudio,
  generateThumbnail,
  composeFinalVideo,
} from "../services/ffmpeg-service";

// ============= 辅助函数 =============

/** 构造 mock fetch Response 对象 */
function mockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
}): Response {
  const ok = options.ok ?? true;
  return {
    ok,
    status: options.status ?? (ok ? 200 : 500),
    statusText: options.statusText ?? (ok ? "OK" : "Error"),
    json: options.json ?? (async () => ({})),
  } as unknown as Response;
}

/** ffmpeg execute 成功响应 */
function ffmpegSuccessResponse(duration = 1.5) {
  return mockResponse({
    json: async () => ({
      success: true,
      data: { exitCode: 0, stdout: "", stderr: "stderr output", duration },
    }),
  });
}

/** ffmpeg execute 失败响应（HTTP 200 但 result.success=false） */
function ffmpegFailureResponse(error: string) {
  return mockResponse({
    json: async () => ({
      success: false,
      error,
      data: { exitCode: 1, stdout: "", stderr: "ffmpeg stderr", duration: 0.5 },
    }),
  });
}

/** ffmpeg probe 成功响应 */
function probeSuccessResponse() {
  return mockResponse({
    json: async () => ({
      success: true,
      data: {
        available: true,
        path: "/usr/bin/ffmpeg",
        version: "6.0",
      },
    }),
  });
}

/** probe duration 响应（用于 mergeVideos 探测时长） */
function probeDurationResponse(durationSec: number | null) {
  let stderr: string;
  if (durationSec === null) {
    stderr = "no duration info";
  } else {
    const hours = Math.floor(durationSec / 3600);
    const minutes = Math.floor((durationSec % 3600) / 60);
    const seconds = durationSec % 60;
    const secStr = seconds.toFixed(2).padStart(5, "0");
    stderr = `Duration: ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${secStr}`;
  }
  return mockResponse({
    json: async () => ({
      success: true,
      data: { exitCode: 0, stdout: "", stderr, duration: 0.1 },
    }),
  });
}

/** 获取第 N 次 fetch 调用的 body（已 JSON.parse） */
function getFetchBody(callIdx = 0): {
  url: string;
  body: { args?: string[]; ffmpegPath?: string; timeout?: number };
} {
  const fetchMock = vi.mocked(fetch);
  expect(fetchMock).toHaveBeenCalled();
  const call = fetchMock.mock.calls[callIdx]!;
  const init = call[1] as RequestInit;
  return {
    url: call[0] as string,
    body: init?.body ? JSON.parse(init.body as string) : {},
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  resetFfmpegCache();
  // 默认：未配置 ffmpegPath
  mocks.getConfig.mockResolvedValue(null);
  // 默认：缓存目录可用
  mocks.getCacheDirectory.mockResolvedValue({ success: true, path: "/cache" });
  // 默认：writeFile/deleteFile 成功
  mocks.writeFile.mockResolvedValue({ success: true });
  mocks.deleteFile.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ============================================================
// A. checkFfmpegAvailable + resetFfmpegCache（缓存 TTL 行为）
// ============================================================

describe("checkFfmpegAvailable + 缓存", () => {
  it("首次调用发起 HTTP probe", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(probeSuccessResponse());

    const result = await checkFfmpegAvailable();

    expect(result.available).toBe(true);
    expect(result.path).toBe("/usr/bin/ffmpeg");
    expect(result.version).toBe("6.0");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getFetchBody(0).url).toContain("/api/ffmpeg/probe");
  });

  it("1 分钟内重复调用不重复 probe（缓存命中）", async () => {
    vi.mocked(fetch).mockResolvedValue(probeSuccessResponse());

    await checkFfmpegAvailable();
    await checkFfmpegAvailable();
    await checkFfmpegAvailable();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resetFfmpegCache 后强制重新 probe", async () => {
    vi.mocked(fetch).mockResolvedValue(probeSuccessResponse());

    await checkFfmpegAvailable();
    expect(fetch).toHaveBeenCalledTimes(1);

    resetFfmpegCache();

    await checkFfmpegAvailable();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("缓存 TTL 过期后重新 probe", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockResolvedValue(probeSuccessResponse());

      await checkFfmpegAvailable();
      expect(fetch).toHaveBeenCalledTimes(1);

      // TTL 内（30s）— 缓存命中
      vi.advanceTimersByTime(30_000);
      await checkFfmpegAvailable();
      expect(fetch).toHaveBeenCalledTimes(1);

      // 超过 TTL（累计 61s > 60s）— 重新 probe
      vi.advanceTimersByTime(31_000);
      await checkFfmpegAvailable();
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("probe 返回 available=false 时返回 false", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({
        json: async () => ({
          success: true,
          data: { available: false, error: "not found" },
        }),
      }),
    );

    const result = await checkFfmpegAvailable();
    expect(result.available).toBe(false);
    expect(result.path).toBeUndefined();
  });

  it("HTTP 非 200 时返回 available=false 并缓存结果", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ ok: false, status: 500, statusText: "Server Error" }),
    );

    const result = await checkFfmpegAvailable();
    expect(result.available).toBe(false);

    // 第二次调用应命中缓存（不再 fetch）
    const result2 = await checkFfmpegAvailable();
    expect(result2.available).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("fetch 抛异常时返回 available=false", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const result = await checkFfmpegAvailable();
    expect(result.available).toBe(false);
  });

  it("使用用户配置的 ffmpegPath 作为 probe 参数", async () => {
    mocks.getConfig.mockResolvedValue("/custom/ffmpeg");
    vi.mocked(fetch).mockResolvedValueOnce(probeSuccessResponse());

    await checkFfmpegAvailable();

    expect(getFetchBody(0).body.ffmpegPath).toBe("/custom/ffmpeg");
  });
});

// ============================================================
// B. 参数构造逻辑
// ============================================================

describe("mixAudio", () => {
  it("构建 amix filter，inputs 数量与 volume 调整正确", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await mixAudio(
      ["/a.wav", "/b.wav", "/c.wav"],
      [0.5, 1.0, 0.8],
    );

    expect(result.success).toBe(true);
    expect(result.outputPath).toBeDefined();
    expect(result.metadata).toEqual({
      trackCount: 3,
      volumes: [0.5, 1.0, 0.8],
    });

    const { body } = getFetchBody(0);
    expect(body.args!.slice(0, 6)).toEqual([
      "-i", "/a.wav", "-i", "/b.wav", "-i", "/c.wav",
    ]);

    const args = body.args!;
    const filterIdx = args.indexOf("-filter_complex");
    const filter = args[filterIdx + 1]!;

    // 各路音量调整
    expect(filter).toContain("[0:a]volume=0.5[a0]");
    expect(filter).toContain("[1:a]volume=1[a1]");
    expect(filter).toContain("[2:a]volume=0.8[a2]");
    // amix 合并
    expect(filter).toContain("[a0][a1][a2]amix=inputs=3:duration=longest[aout]");

    // map 输出
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("[aout]");
  });

  it("volume 缺省时使用 1", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await mixAudio(["/a.wav", "/b.wav"], [0.5]);

    const { body } = getFetchBody(0);
    const filter = body.args![body.args!.indexOf("-filter_complex") + 1]!;
    expect(filter).toContain("[1:a]volume=1[a1]");
  });

  it("少于 2 个音频文件返回错误", async () => {
    const result = await mixAudio(["/a.wav"], [1.0]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("至少需要 2 个");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("mergeVideos", () => {
  it("transition=none 使用 concat demuxer，写入并清理列表文件", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await mergeVideos(["/v1.mp4", "/v2.mp4"], "none", 0.5);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      videoCount: 2,
      transition: "none",
    });

    // 列表文件写入 + 清理
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFile).toHaveBeenCalledTimes(1);

    // 写入内容包含 file 'xxx' 行
    const writeCall = mocks.writeFile.mock.calls[0]!;
    expect(writeCall[1]).toContain("file '/v1.mp4'");
    expect(writeCall[1]).toContain("file '/v2.mp4'");

    // ffmpeg 参数：concat demuxer
    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args.slice(0, 4)).toEqual(["-f", "concat", "-safe", "0"]);
    expect(args).toContain("-c");
    expect(args).toContain("copy");
  });

  it("带转场效果时构建 xfade 链，offset 累计正确", async () => {
    // 3 个视频，每个时长 10s；前 3 次 probe，第 4 次 execute
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await mergeVideos(
      ["/v1.mp4", "/v2.mp4", "/v3.mp4"],
      "fade",
      0.5,
    );

    expect(result.success).toBe(true);
    expect(result.metadata).toMatchObject({
      videoCount: 3,
      transition: "fade",
      transitionDuration: 0.5,
      durations: [10, 10, 10],
    });

    // 第 4 次 fetch 是实际执行
    const { body } = getFetchBody(3);
    const args = body.args!;
    const filter = args[args.indexOf("-filter_complex") + 1]!;

    // offset[1] = d0 - 0.5 = 9.5
    // offset[2] = d0 + d1 - 2 * 0.5 = 19.0
    expect(filter).toContain("xfade=transition=fade:duration=0.5:offset=9.500");
    expect(filter).toContain("xfade=transition=fade:duration=0.5:offset=19.000");
    // 最后一段输出 [out]
    expect(filter).toContain("[out]");
    expect(args).toContain("-map");
    expect(args[args.indexOf("-map") + 1]).toBe("[out]");
  });

  it("cut 类型使用极短 duration (0.01) 模拟硬切", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await mergeVideos(["/v1.mp4", "/v2.mp4"], "cut", 0.5);

    const { body } = getFetchBody(2);
    const filter = body.args![body.args!.indexOf("-filter_complex") + 1]!;

    expect(filter).toContain("duration=0.01");
    // offset = 10 - 0.01 = 9.99
    expect(filter).toContain("offset=9.990");
    // 仍然是 fade 类型
    expect(filter).toContain("transition=fade");
  });

  it("未知 transition 类型回退到 fade", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(10));
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await mergeVideos(["/v1.mp4", "/v2.mp4"], "unknown_type", 0.5);

    const { body } = getFetchBody(2);
    const filter = body.args![body.args!.indexOf("-filter_complex") + 1]!;
    expect(filter).toContain("transition=fade");
  });

  it("probe 无法探测时长时返回错误", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(probeDurationResponse(null));

    const result = await mergeVideos(["/v1.mp4", "/v2.mp4"], "fade");

    expect(result.success).toBe(false);
    expect(result.error).toContain("无法探测视频时长");
    expect(result.error).toContain("/v1.mp4");
  });

  it("concat 列表文件写入失败时返回错误", async () => {
    mocks.writeFile.mockResolvedValueOnce({ success: false, error: "disk full" });

    const result = await mergeVideos(["/v1.mp4", "/v2.mp4"], "none");

    expect(result.success).toBe(false);
    expect(result.error).toBe("无法创建合并列表文件");
  });
});

describe("adjustAudioSpeed", () => {
  it("speed 在 [0.5, 2.0] 范围内使用单个 atempo", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await adjustAudioSpeed("/a.wav", 1.5);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ speed: 1.5, preservePitch: true });

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args[0]).toBe("-i");
    expect(args[1]).toBe("/a.wav");
    const filterIdx = args.indexOf("-filter:a");
    expect(args[filterIdx + 1]).toBe("atempo=1.5");
  });

  it("speed > 2 时链式拆分 atempo", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await adjustAudioSpeed("/a.wav", 4);

    const { body } = getFetchBody(0);
    const filter = body.args![body.args!.indexOf("-filter:a") + 1]!;
    // 4 = 2.0 * 2.0 → atempo=2.0,atempo=2（JS 中 (2.0).toString() === "2"）
    expect(filter).toBe("atempo=2.0,atempo=2");
  });

  it("speed < 0.5 时链式拆分 atempo", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await adjustAudioSpeed("/a.wav", 0.25);

    const { body } = getFetchBody(0);
    const filter = body.args![body.args!.indexOf("-filter:a") + 1]!;
    // 0.25 = 0.5 * 0.5 → atempo=0.5,atempo=0.5
    expect(filter).toBe("atempo=0.5,atempo=0.5");
  });

  it("preservePitch=false 使用 asetrate 变速不变调", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await adjustAudioSpeed("/a.wav", 1.5, false);

    const { body } = getFetchBody(0);
    const filter = body.args![body.args!.indexOf("-filter:a") + 1]!;
    expect(filter).toBe("asetrate=44100*1.5,aresample=44100");
  });
});

describe("adjustVideoSpeed", () => {
  it("组合 setpts + atempo 滤镜", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await adjustVideoSpeed("/v.mp4", 2.0);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ speed: 2.0, preserveAudio: true });

    const { body } = getFetchBody(0);
    const args = body.args!;
    const filterIdx = args.indexOf("-filter_complex");
    const filter = args[filterIdx + 1]!;

    expect(filter).toBe("[0:v]setpts=PTS/2[v];[0:a]atempo=2[a]");
    expect(args).toContain("[v]");
    expect(args).toContain("[a]");
  });

  it("speed=4 时 atempo 链式拆分", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await adjustVideoSpeed("/v.mp4", 4, true);

    const { body } = getFetchBody(0);
    const filter = body.args![body.args!.indexOf("-filter_complex") + 1]!;
    expect(filter).toBe("[0:v]setpts=PTS/4[v];[0:a]atempo=2.0,atempo=2[a]");
  });

  it("preserveAudio=false 使用 atempo=speed", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await adjustVideoSpeed("/v.mp4", 1.5, false);

    const { body } = getFetchBody(0);
    const filter = body.args![body.args!.indexOf("-filter_complex") + 1]!;
    expect(filter).toBe("[0:v]setpts=PTS/1.5[v];[0:a]atempo=1.5[a]");
  });
});

describe("addSubtitle", () => {
  it("自动生成 srt 文件，写入后清理", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await addSubtitle(
      "/v.mp4",
      [{ text: "你好", startTime: 0, endTime: 2 }],
      { fontSize: 30, fontColor: "yellow", position: "top" },
    );

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      subtitleCount: 1,
      fontSize: 30,
      position: "top",
    });

    // writeFile 被调用生成 srt
    expect(mocks.writeFile).toHaveBeenCalledTimes(1);
    const writeCall = mocks.writeFile.mock.calls[0]!;
    const srtPath = writeCall[0] as string;
    const srtContent = writeCall[1] as string;
    expect(srtPath).toContain(".subs.srt");
    expect(srtContent).toContain("1\n");
    expect(srtContent).toContain("00:00:00,000 --> 00:00:02,000");
    expect(srtContent).toContain("你好");

    // 执行后清理
    expect(mocks.deleteFile).toHaveBeenCalledTimes(1);
    expect(mocks.deleteFile.mock.calls[0]![0]).toBe(srtPath);

    // ffmpeg 参数包含 subtitles filter
    const { body } = getFetchBody(0);
    const args = body.args!;
    const vfIdx = args.indexOf("-vf");
    const vf = args[vfIdx + 1]!;
    expect(vf).toContain("subtitles=");
    expect(vf).toContain("FontSize=30");
    expect(vf).toContain("PrimaryColour=yellow");
    expect(vf).toContain("Alignment=6"); // top → 6
  });

  it("position=bottom 时 Alignment=2", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await addSubtitle(
      "/v.mp4",
      [{ text: "底部字幕", startTime: 1, endTime: 3 }],
    );

    const { body } = getFetchBody(0);
    const vf = body.args![body.args!.indexOf("-vf") + 1]!;
    expect(vf).toContain("Alignment=2");
    expect(vf).toContain("FontSize=24"); // 默认值
    expect(vf).toContain("PrimaryColour=white"); // 默认值
  });

  it("position=center 时 Alignment=8", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await addSubtitle(
      "/v.mp4",
      [{ text: "中间", startTime: 0, endTime: 1 }],
      { position: "center" },
    );

    const { body } = getFetchBody(0);
    const vf = body.args![body.args!.indexOf("-vf") + 1]!;
    expect(vf).toContain("Alignment=8");
  });

  it("提供 subtitlePath 时不生成 srt 文件", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await addSubtitle(
      "/v.mp4",
      [{ text: "外部字幕", startTime: 0, endTime: 1 }],
      { subtitlePath: "/custom.srt" },
    );

    // 不应调用 writeFile / deleteFile
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.deleteFile).not.toHaveBeenCalled();

    const { body } = getFetchBody(0);
    const vf = body.args![body.args!.indexOf("-vf") + 1]!;
    expect(vf).toContain("subtitles='/custom.srt'");
  });

  it("空字幕数组且无 subtitlePath 时返回错误", async () => {
    const result = await addSubtitle("/v.mp4", []);

    expect(result.success).toBe(false);
    expect(result.error).toBe("无字幕文件");
  });

  it("srt 写入失败时返回错误", async () => {
    mocks.writeFile.mockResolvedValueOnce({ success: false, error: "disk full" });

    const result = await addSubtitle(
      "/v.mp4",
      [{ text: "x", startTime: 0, endTime: 1 }],
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("无法创建字幕文件");
  });
});

describe("trimVideo", () => {
  it("构造 -ss / -to / -c copy 参数", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await trimVideo("/v.mp4", 5, 10);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      startTime: 5,
      endTime: 10,
      duration: 5,
    });

    const { body } = getFetchBody(0);
    expect(body.args).toEqual([
      "-i", "/v.mp4",
      "-ss", "5",
      "-to", "10",
      "-c", "copy",
      "-y", expect.any(String),
    ]);
  });

  it("指定 outputPath 时直接使用", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await trimVideo("/v.mp4", 0, 5, "/custom/trim.mp4");

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe("/custom/trim.mp4");
    // 不应调用 getCacheDirectory
    expect(mocks.getCacheDirectory).not.toHaveBeenCalled();
  });
});

describe("addTransition", () => {
  it("position=start 使用 fade=t=in", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await addTransition("/v.mp4", "fade", "start", 0.5);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      transitionType: "fade",
      position: "start",
      duration: 0.5,
    });

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args[args.indexOf("-vf") + 1]).toBe("fade=t=in:st=0:d=0.5");
    expect(args).toContain("-c:a");
    expect(args).toContain("copy");
  });

  it("position=end 使用 fade=t=out", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await addTransition("/v.mp4", "fade", "end", 1.0);

    const { body } = getFetchBody(0);
    expect(body.args![body.args!.indexOf("-vf") + 1]).toBe("fade=t=out:st=0:d=1");
  });

  it("position=between 使用 fade in + fade out 组合", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await addTransition("/v.mp4", "fade", "between", 0.5);

    const { body } = getFetchBody(0);
    expect(body.args![body.args!.indexOf("-vf") + 1]).toBe(
      "fade=t=in:st=0:d=0.5,fade=t=out:st=0:d=0.5",
    );
  });
});

describe("extractAudio", () => {
  it("mp3 格式使用 libmp3lame", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await extractAudio("/v.mp4", "mp3");

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      outputFormat: "mp3",
      startTime: undefined,
      endTime: undefined,
    });

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args).toContain("-vn");
    expect(args).toContain("-acodec");
    expect(args[args.indexOf("-acodec") + 1]).toBe("libmp3lame");
    expect(args).toContain("-q:a");
    expect(args[args.indexOf("-q:a") + 1]).toBe("2");
  });

  it("wav 格式使用 pcm_s16le", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await extractAudio("/v.mp4", "wav");

    const { body } = getFetchBody(0);
    expect(body.args![body.args!.indexOf("-acodec") + 1]).toBe("pcm_s16le");
  });

  it("aac 格式使用 aac + 192k 码率", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await extractAudio("/v.mp4", "aac");

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args[args.indexOf("-acodec") + 1]).toBe("aac");
    expect(args).toContain("-b:a");
    expect(args[args.indexOf("-b:a") + 1]).toBe("192k");
  });

  it("指定 startTime/endTime 时添加 -ss / -to", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await extractAudio("/v.mp4", "mp3", 5, 15);

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("5");
    expect(args).toContain("-to");
    expect(args[args.indexOf("-to") + 1]).toBe("15");
  });
});

describe("generateThumbnail", () => {
  it("构造 -ss / -vframes 1 / scale 参数", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await generateThumbnail("/v.mp4", 2, 320);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ timePoint: 2, width: 320 });

    const { body } = getFetchBody(0);
    expect(body.args).toEqual([
      "-i", "/v.mp4",
      "-ss", "2",
      "-vframes", "1",
      "-vf", "scale=320:-1",
      "-y", expect.any(String),
    ]);
  });

  it("使用默认参数 timePoint=1, width=320", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await generateThumbnail("/v.mp4");

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args[args.indexOf("-ss") + 1]).toBe("1");
    expect(args[args.indexOf("-vf") + 1]).toBe("scale=320:-1");
  });
});

describe("normalizeAudio", () => {
  it("使用 loudnorm 滤镜", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await normalizeAudio("/a.wav", -16);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ targetLevel: -16 });

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args[args.indexOf("-af") + 1]).toBe("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(args).toContain("-ar");
    expect(args[args.indexOf("-ar") + 1]).toBe("44100");
  });
});

describe("removeNoise", () => {
  it("intensity=0.5 映射到 afftdn nr=24", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await removeNoise("/a.wav", 0.5);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ intensity: 0.5 });

    const { body } = getFetchBody(0);
    const args = body.args!;
    // 0.5 * 48 = 24
    expect(args[args.indexOf("-af") + 1]).toBe("afftdn=nr=24:nf=-25");
  });
});

describe("replaceAudio", () => {
  it("使用 -map 0:v -map 1:a 替换音频", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await replaceAudio("/v.mp4", "/a.wav", 0, 1);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({ audioStartTime: 0, volume: 1 });

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args.slice(0, 4)).toEqual(["-i", "/v.mp4", "-i", "/a.wav"]);
    expect(args).toContain("-c:v");
    expect(args[args.indexOf("-c:v") + 1]).toBe("copy");
    expect(args).toContain("-c:a");
    expect(args[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args).toContain("-map");
    expect(args[args.indexOf("-map") + 1]).toBe("0:v");
    expect(args[args.indexOf("-map", args.indexOf("-map") + 1) + 1]).toBe("1:a");
  });

  it("audioStartTime>0 时添加 -ss 参数", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await replaceAudio("/v.mp4", "/a.wav", 5, 1);

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args).toContain("-ss");
    expect(args[args.indexOf("-ss") + 1]).toBe("5");
  });

  it("volume≠1 时添加 -af volume 滤镜", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await replaceAudio("/v.mp4", "/a.wav", 0, 0.5);

    const { body } = getFetchBody(0);
    const args = body.args!;
    expect(args).toContain("-af");
    expect(args[args.indexOf("-af") + 1]).toBe("volume=0.5");
  });
});

describe("splitAudio", () => {
  it("多段循环执行，返回所有输出路径", async () => {
    vi.mocked(fetch).mockResolvedValue(ffmpegSuccessResponse());

    const result = await splitAudio(
      "/a.wav",
      [
        { startTime: 0, endTime: 5 },
        { startTime: 5, endTime: 10 },
      ],
      "/out",
    );

    expect(result.success).toBe(true);
    expect(result.outputPaths).toEqual([
      "/out/segment_1_0s-5s.wav",
      "/out/segment_2_5s-10s.wav",
    ]);
    expect(result.metadata).toEqual({ segmentCount: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("某段失败时中断并返回已完成的路径", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ffmpegSuccessResponse()) // 段 1 成功
      .mockResolvedValueOnce(ffmpegFailureResponse("trim error")); // 段 2 失败

    const result = await splitAudio(
      "/a.wav",
      [
        { startTime: 0, endTime: 5 },
        { startTime: 5, endTime: 10 },
        { startTime: 10, endTime: 15 },
      ],
      "/out",
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("分割第 2 段失败");
    expect(result.error).toContain("trim error");
    // 返回已完成的第一段
    expect(result.outputPaths).toEqual(["/out/segment_1_0s-5s.wav"]);
    // 不应执行第 3 段
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("executeFfmpeg", () => {
  it("透传 args 到 HTTP 调用", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await executeFfmpeg(["-version"]);

    expect(result.success).toBe(true);
    const { url, body } = getFetchBody(0);
    expect(body.args).toEqual(["-version"]);
    expect(url).toContain("/api/ffmpeg/execute");
  });

  it("支持 timeout 选项", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    await executeFfmpeg(["-version"], { timeout: 5000 });

    const { body } = getFetchBody(0);
    expect(body.timeout).toBe(5000);
  });
});

// ============================================================
// C. 错误路径
// ============================================================

describe("错误路径", () => {
  it("HTTP 非 200 返回错误（executeFfmpeg）", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ ok: false, status: 500, statusText: "Internal Error" }),
    );

    const result = await executeFfmpeg(["-i", "/v.mp4"]);

    expect(result.success).toBe(false);
    expect(result.error).toBe("HTTP 500: Internal Error");
  });

  it("result.success=false 透传错误信息", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegFailureResponse("codec not found"));

    const result = await executeFfmpeg(["-i", "/v.mp4"]);

    expect(result.success).toBe(false);
    expect(result.error).toBe("codec not found");
    expect(result.stderr).toBe("ffmpeg stderr");
    expect(result.duration).toBe(0.5);
  });

  it("fetch 抛异常时返回错误", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Connection refused"));

    const result = await executeFfmpeg(["-i", "/v.mp4"]);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Connection refused");
  });

  it("getCacheDirectory 失败时返回错误（mixAudio）", async () => {
    mocks.getCacheDirectory.mockResolvedValueOnce({
      success: false,
      error: "no disk",
    });

    const result = await mixAudio(["/a.wav", "/b.wav"], [1, 1]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to get cache directory");
  });

  it("getCacheDirectory 返回无 path 时返回错误", async () => {
    mocks.getCacheDirectory.mockResolvedValueOnce({ success: true });

    const result = await mixAudio(["/a.wav", "/b.wav"], [1, 1]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to get cache directory");
  });

  it("writeFile 失败时 mergeVideos 返回错误（已在上文测试）", async () => {
    // 此场景已在 mergeVideos describe 中覆盖，这里仅做标记
    expect(true).toBe(true);
  });

  it("writeFile 失败时 addSubtitle 返回错误（已在上文测试）", async () => {
    expect(true).toBe(true);
  });
});

// ============================================================
// D. composeFinalVideo（步骤串联）
// ============================================================

describe("composeFinalVideo", () => {
  it("videoPaths 为空时返回错误", async () => {
    const result = await composeFinalVideo([]);

    expect(result.success).toBe(false);
    expect(result.error).toBe("videoPaths 不能为空");
  });

  it("单视频无背景音乐无字幕时直接返回", async () => {
    const result = await composeFinalVideo(["/v.mp4"]);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe("/v.mp4");
    expect(result.metadata).toEqual({
      steps: [],
      videoCount: 1,
      hasBackgroundMusic: false,
      hasSubtitles: false,
    });
    // 不应调用任何 ffmpeg 操作
    expect(fetch).not.toHaveBeenCalled();
  });

  it("多视频合并成功流程", async () => {
    // mergeVideos with transition=none: 1 fetch (concat)
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse());

    const result = await composeFinalVideo(["/v1.mp4", "/v2.mp4"]);

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      steps: ["merge"],
      videoCount: 2,
      hasBackgroundMusic: false,
      hasSubtitles: false,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("合并 → 背景音乐 → 字幕 全流程成功", async () => {
    // 1. mergeVideos (concat) — 1 fetch
    // 2. replaceAudio — 1 fetch
    // 3. addSubtitle (auto srt) — 1 fetch
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse()); // merge
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse()); // audio
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse()); // subtitle

    const result = await composeFinalVideo(
      ["/v1.mp4", "/v2.mp4"],
      {
        backgroundMusic: "/bgm.wav",
        subtitles: [{ text: "hello", startTime: 0, endTime: 2 }],
      },
    );

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      steps: ["merge", "audio", "subtitle"],
      videoCount: 2,
      hasBackgroundMusic: true,
      hasSubtitles: true,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    // writeFile 调用 2 次：mergeVideos 的 concat 列表文件 + addSubtitle 的 srt 文件
    expect(mocks.writeFile).toHaveBeenCalledTimes(2);
    // deleteFile 调用 2 次：清理上述两个临时文件
    expect(mocks.deleteFile).toHaveBeenCalledTimes(2);
  });

  it("合并失败时返回错误", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegFailureResponse("merge failed"));

    const result = await composeFinalVideo(["/v1.mp4", "/v2.mp4"]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("视频合并失败");
    expect(result.error).toContain("merge failed");
    expect(result.stderr).toBe("ffmpeg stderr");
  });

  it("背景音乐替换失败时返回错误", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ffmpegSuccessResponse()) // merge ok
      .mockResolvedValueOnce(ffmpegFailureResponse("audio replace failed")); // audio fail

    const result = await composeFinalVideo(
      ["/v1.mp4", "/v2.mp4"],
      { backgroundMusic: "/bgm.wav" },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("背景音乐替换失败");
    expect(result.error).toContain("audio replace failed");
  });

  it("字幕添加失败时返回错误", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(ffmpegSuccessResponse()) // merge ok
      .mockResolvedValueOnce(ffmpegSuccessResponse()) // audio ok
      .mockResolvedValueOnce(ffmpegFailureResponse("subtitle failed")); // subtitle fail

    const result = await composeFinalVideo(
      ["/v1.mp4", "/v2.mp4"],
      {
        backgroundMusic: "/bgm.wav",
        subtitles: [{ text: "x", startTime: 0, endTime: 1 }],
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("字幕添加失败");
    expect(result.error).toContain("subtitle failed");
  });

  it("单视频 + 背景音乐 + 字幕（跳过 merge）", async () => {
    // 只有 replaceAudio + addSubtitle 两个 fetch
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse()); // audio
    vi.mocked(fetch).mockResolvedValueOnce(ffmpegSuccessResponse()); // subtitle

    const result = await composeFinalVideo(
      ["/v.mp4"],
      {
        backgroundMusic: "/bgm.wav",
        subtitles: [{ text: "hello", startTime: 0, endTime: 2 }],
      },
    );

    expect(result.success).toBe(true);
    expect(result.metadata).toEqual({
      steps: ["audio", "subtitle"],
      videoCount: 1,
      hasBackgroundMusic: true,
      hasSubtitles: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
