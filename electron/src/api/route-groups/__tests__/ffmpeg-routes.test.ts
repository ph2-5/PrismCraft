/**
 * ffmpeg-routes.ts 路由 handler 测试
 *
 * 重点验证：
 * 1. 路由注册：ffmpeg/probe、ffmpeg/execute
 * 2. schema 校验：execute 必须有 args（非空数组），probe 可选 ffmpegPath，timeout 边界
 * 3. handler 调用：mock ffmpeg-handler 的 probeFfmpeg / executeFfmpeg，验证透传
 * 4. 错误传播：handler 内部 try/catch 捕获异常并返回 { success: false, error }
 *
 * 参考 generation-routes.test.ts 的 vi.hoisted + vi.mock 模式。
 * 注：ffmpeg-routes 内的 probeSchema/executeSchema 为模块内部常量（未导出），
 *     通过 route.schema 访问以做 schema 校验测试。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type http from "http";

// ── hoisted mocks ──────────────────────────────────────────────────────
const { mockProbeFfmpeg, mockExecuteFfmpeg } = vi.hoisted(() => ({
  mockProbeFfmpeg: vi.fn(),
  mockExecuteFfmpeg: vi.fn(),
}));

vi.mock("../../../handlers/ffmpeg-handler", () => ({
  probeFfmpeg: mockProbeFfmpeg,
  executeFfmpeg: mockExecuteFfmpeg,
}));

import { ffmpegRoutes } from "../ffmpeg-routes";

const mockReq = {} as http.IncomingMessage;

describe("ffmpeg-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 路由注册 ───────────────────────────────────────────────────────
  describe("路由注册", () => {
    it("应注册 ffmpeg/probe 和 ffmpeg/execute 路由", () => {
      expect(ffmpegRoutes["ffmpeg/probe"]).toBeDefined();
      expect(ffmpegRoutes["ffmpeg/execute"]).toBeDefined();
      expect(ffmpegRoutes["ffmpeg/probe"].methods).toContain("POST");
      expect(ffmpegRoutes["ffmpeg/execute"].methods).toContain("POST");
    });

    it("两个路由都应有 schema", () => {
      expect(ffmpegRoutes["ffmpeg/probe"].schema).toBeDefined();
      expect(ffmpegRoutes["ffmpeg/execute"].schema).toBeDefined();
    });
  });

  // ── schema 校验 ─────────────────────────────────────────────────
  describe("schema 校验", () => {
    describe("ffmpeg/probe schema", () => {
      it("空 body 时 schema 应接受（ffmpegPath 可选）", () => {
        const schema = ffmpegRoutes["ffmpeg/probe"].schema!;
        expect(schema.safeParse({}).success).toBe(true);
      });

      it("带 ffmpegPath 时 schema 应接受", () => {
        const schema = ffmpegRoutes["ffmpeg/probe"].schema!;
        expect(schema.safeParse({ ffmpegPath: "/usr/bin/ffmpeg" }).success).toBe(true);
      });

      it("ffmpegPath 为空字符串时 schema 应拒绝（min(1)）", () => {
        const schema = ffmpegRoutes["ffmpeg/probe"].schema!;
        const result = schema.safeParse({ ffmpegPath: "" });
        expect(result.success).toBe(false);
      });
    });

    describe("ffmpeg/execute schema", () => {
      it("缺少 args 时 schema 应拒绝", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        const result = schema.safeParse({ ffmpegPath: "/usr/bin/ffmpeg" });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(
            result.error.issues.some((i) => i.path.includes("args")),
          ).toBe(true);
        }
      });

      it("args 为空数组时 schema 应拒绝（min(1)）", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        const result = schema.safeParse({ args: [] });
        expect(result.success).toBe(false);
      });

      it("仅 args 时 schema 应接受", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        expect(schema.safeParse({ args: ["-version"] }).success).toBe(true);
      });

      it("完整参数 schema 应接受", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        const result = schema.safeParse({
          args: ["-i", "input.mp4", "-y", "output.mp4"],
          ffmpegPath: "/usr/bin/ffmpeg",
          timeout: 60000,
        });
        expect(result.success).toBe(true);
      });

      it("timeout 超过 30 分钟时 schema 应拒绝", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        const result = schema.safeParse({
          args: ["-version"],
          timeout: 30 * 60 * 1000 + 1,
        });
        expect(result.success).toBe(false);
      });

      it("timeout 为非正数时 schema 应拒绝", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        expect(schema.safeParse({ args: ["-version"], timeout: 0 }).success).toBe(false);
        expect(schema.safeParse({ args: ["-version"], timeout: -1 }).success).toBe(false);
      });

      it("timeout 为非整数时 schema 应拒绝", () => {
        const schema = ffmpegRoutes["ffmpeg/execute"].schema!;
        expect(schema.safeParse({ args: ["-version"], timeout: 1.5 }).success).toBe(false);
      });
    });
  });

  // ── ffmpeg/probe handler ──────────────────────────────────────────
  describe("ffmpeg/probe handler", () => {
    it("成功路径：应调用 probeFfmpeg(ffmpegPath) 并透传结果", async () => {
      mockProbeFfmpeg.mockResolvedValue({
        available: true,
        version: "6.0",
        path: "/usr/bin/ffmpeg",
      });
      const route = ffmpegRoutes["ffmpeg/probe"];
      const result = (await route.handler("POST", { ffmpegPath: "/usr/bin/ffmpeg" }, mockReq)) as {
        success: boolean;
        data?: { available?: boolean; version?: string; path?: string };
      };

      expect(mockProbeFfmpeg).toHaveBeenCalledWith("/usr/bin/ffmpeg");
      expect(result.success).toBe(true);
      expect(result.data?.available).toBe(true);
      expect(result.data?.version).toBe("6.0");
      expect(result.data?.path).toBe("/usr/bin/ffmpeg");
    });

    it("不传 ffmpegPath 时应调用 probeFfmpeg(undefined)", async () => {
      mockProbeFfmpeg.mockResolvedValue({ available: false, error: "not found" });
      const route = ffmpegRoutes["ffmpeg/probe"];
      const result = (await route.handler("POST", {}, mockReq)) as {
        success: boolean;
        data?: { available?: boolean; error?: string };
      };

      expect(mockProbeFfmpeg).toHaveBeenCalledWith(undefined);
      expect(result.success).toBe(true);
      expect(result.data?.available).toBe(false);
      expect(result.data?.error).toBe("not found");
    });

    it("probe 返回不可用时仍应包装为 success:true（路由层不判别 available）", async () => {
      mockProbeFfmpeg.mockResolvedValue({ available: false, error: "ENOENT" });
      const route = ffmpegRoutes["ffmpeg/probe"];
      const result = (await route.handler("POST", {}, mockReq)) as {
        success: boolean;
        data?: { available?: boolean };
      };

      expect(result.success).toBe(true);
      expect(result.data?.available).toBe(false);
    });

    it("probeFfmpeg 抛出异常时应返回 success:false 并包含错误信息", async () => {
      mockProbeFfmpeg.mockRejectedValue(new Error("spawn failed"));
      const route = ffmpegRoutes["ffmpeg/probe"];
      const result = (await route.handler("POST", {}, mockReq)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("spawn failed");
    });

    it("probeFfmpeg 抛出非 Error 值时应提取为字符串错误信息", async () => {
      mockProbeFfmpeg.mockRejectedValue("string error");
      const route = ffmpegRoutes["ffmpeg/probe"];
      const result = (await route.handler("POST", {}, mockReq)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("string error");
    });
  });

  // ── ffmpeg/execute handler ────────────────────────────────────────
  describe("ffmpeg/execute handler", () => {
    it("成功路径：应调用 executeFfmpeg(args, options) 并返回 stdout/stderr/exitCode", async () => {
      mockExecuteFfmpeg.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "output",
        stderr: "",
        duration: 1500,
      });
      const body = {
        args: ["-i", "input.mp4", "-y", "output.mp4"],
        ffmpegPath: "/usr/bin/ffmpeg",
        timeout: 60000,
      };
      const route = ffmpegRoutes["ffmpeg/execute"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        data?: { exitCode?: number; stdout?: string; stderr?: string; duration?: number };
      };

      expect(mockExecuteFfmpeg).toHaveBeenCalledWith(body.args, {
        ffmpegPath: body.ffmpegPath,
        timeout: body.timeout,
      });
      expect(result.success).toBe(true);
      expect(result.data?.exitCode).toBe(0);
      expect(result.data?.stdout).toBe("output");
      expect(result.data?.stderr).toBe("");
      expect(result.data?.duration).toBe(1500);
    });

    it("未传 timeout/ffmpegPath 时应将 undefined 透传给 executeFfmpeg", async () => {
      mockExecuteFfmpeg.mockResolvedValue({
        success: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        duration: 10,
      });
      const body = { args: ["-version"] };
      const route = ffmpegRoutes["ffmpeg/execute"];
      await route.handler("POST", body, mockReq);

      expect(mockExecuteFfmpeg).toHaveBeenCalledWith(body.args, {
        ffmpegPath: undefined,
        timeout: undefined,
      });
    });

    it("executeFfmpeg 返回 success:false 时应返回 success:false 并附带 data", async () => {
      mockExecuteFfmpeg.mockResolvedValue({
        success: false,
        exitCode: 1,
        stdout: "",
        stderr: "Invalid data found",
        duration: 200,
        error: "ffmpeg exited with code 1",
      });
      const body = { args: ["-i", "bad.mp4"] };
      const route = ffmpegRoutes["ffmpeg/execute"];
      const result = (await route.handler("POST", body, mockReq)) as {
        success: boolean;
        error?: string;
        data?: { exitCode?: number; stderr?: string };
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("ffmpeg exited with code 1");
      expect(result.data?.exitCode).toBe(1);
      expect(result.data?.stderr).toBe("Invalid data found");
    });

    it("executeFfmpeg 返回 success:false 且无 error 字段时应使用默认错误信息", async () => {
      mockExecuteFfmpeg.mockResolvedValue({
        success: false,
        exitCode: 2,
        stdout: "",
        stderr: "",
        duration: 10,
      });
      const route = ffmpegRoutes["ffmpeg/execute"];
      const result = (await route.handler("POST", { args: ["-x"] }, mockReq)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("ffmpeg execution failed");
    });

    it("executeFfmpeg 抛出异常时应返回 success:false 并包含错误信息", async () => {
      mockExecuteFfmpeg.mockRejectedValue(new Error("timeout reached"));
      const route = ffmpegRoutes["ffmpeg/execute"];
      const result = (await route.handler("POST", { args: ["-version"] }, mockReq)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("timeout reached");
    });

    it("executeFfmpeg 抛出非 Error 值时应提取为字符串错误信息", async () => {
      mockExecuteFfmpeg.mockRejectedValue({ code: "EAGAIN" });
      const route = ffmpegRoutes["ffmpeg/execute"];
      const result = (await route.handler("POST", { args: ["-version"] }, mockReq)) as {
        success: boolean;
        error?: string;
      };

      expect(result.success).toBe(false);
      // extractErrorMessage 对带属性的对象会 JSON.stringify
      expect(typeof result.error).toBe("string");
      expect(result.error).toContain("EAGAIN");
    });
  });
});
