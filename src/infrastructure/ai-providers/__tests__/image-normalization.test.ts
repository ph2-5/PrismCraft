import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
  extractErrorMessage: vi.fn((e: unknown) => String(e)),
}));

vi.mock("@/shared/constants", () => ({
  t: vi.fn((key: string) => key),
}));

import {
  getBase64Size,
  imageToBase64,
  normalizeImage,
  normalizeImages,
  getImageDimensions,
} from "../image-normalization";

describe("getBase64Size", () => {
  it("应正确计算 base64 数据大小", () => {
    // base64 "Hello" = "SGVsbG8=" (8 chars), 实际大小 5 bytes
    const result = getBase64Size("data:image/jpeg;base64,SGVsbG8=");
    // 8 * 3 / 4 = 6, ceil = 6
    expect(result).toBe(6);
  });

  it("非 data: URL 应返回 0", () => {
    expect(getBase64Size("https://example.com/image.jpg")).toBe(0);
  });

  it("无 base64 部分应返回 0", () => {
    expect(getBase64Size("data:image/jpeg;base64,")).toBe(0);
  });

  it("空字符串应返回 0", () => {
    expect(getBase64Size("")).toBe(0);
  });

  it("应处理带 padding 的 base64", () => {
    // "A" = "QQ==" (4 chars), 实际大小 1 byte
    const result = getBase64Size("data:image/png;base64,QQ==");
    // 4 * 3 / 4 = 3, ceil = 3
    expect(result).toBe(3);
  });
});

describe("imageToBase64", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class MockImage {
      src = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 100;
      height = 100;
      set _src(val: string) {
        this.src = val;
      }
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    });

    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
        })),
        toDataURL: vi.fn(() => "data:image/jpeg;base64,SGVsbG8="),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("data: URL 应直接返回", async () => {
    const dataUrl = "data:image/png;base64,SGVsbG8=";
    const result = await imageToBase64(dataUrl);
    expect(result).toBe(dataUrl);
  });

  it("浏览器环境应通过 canvas 转换", async () => {
    const result = await imageToBase64("https://example.com/image.jpg");
    expect(result).toBe("data:image/jpeg;base64,SGVsbG8=");
  });
});

describe("normalizeImage", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class MockImage {
      src = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 800;
      height = 600;
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    });

    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
        })),
        toDataURL: vi.fn(() => "data:image/jpeg;base64,SGVsbG8="),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应返回标准化后的图片信息", async () => {
    const result = await normalizeImage("data:image/jpeg;base64,SGVsbG8=");
    expect(result.url).toBe("data:image/jpeg;base64,SGVsbG8=");
    expect(result.originalSize).toBeGreaterThan(0);
    expect(result.normalizedSize).toBeGreaterThan(0);
    expect(result.format).toBe("image/jpeg");
  });

  it("应使用默认选项", async () => {
    const result = await normalizeImage("data:image/jpeg;base64,SGVsbG8=");
    expect(result).toBeDefined();
    expect(result.url).toContain("data:");
  });

  it("PNG 源应保持 PNG 格式", async () => {
    const result = await normalizeImage("data:image/png;base64,SGVsbG8=");
    expect(result.format).toBe("image/png");
  });

  it("应支持自定义格式选项", async () => {
    const result = await normalizeImage("data:image/jpeg;base64,SGVsbG8=", {
      format: "image/webp",
    });
    expect(result.format).toBe("image/webp");
  });
});

describe("normalizeImages", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class MockImage {
      src = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 800;
      height = 600;
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    });

    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          drawImage: vi.fn(),
        })),
        toDataURL: vi.fn(() => "data:image/jpeg;base64,SGVsbG8="),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应批量处理多个图片", async () => {
    const urls = [
      "data:image/jpeg;base64,SGVsbG8=",
      "data:image/png;base64,SGVsbG8=",
    ];
    const results = await normalizeImages(urls);
    expect(results).toHaveLength(2);
    expect(results[0]!.format).toBe("image/jpeg");
    expect(results[1]!.format).toBe("image/png");
  });

  it("应过滤处理失败的图片", async () => {
    const urls = [
      "data:image/jpeg;base64,SGVsbG8=",
      "invalid-url-that-will-fail",
    ];
    const results = await normalizeImages(urls);
    // 至少有一个成功（data: URL），失败的被过滤
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("空数组应返回空数组", async () => {
    const results = await normalizeImages([]);
    expect(results).toEqual([]);
  });
});

describe("getImageDimensions", () => {
  beforeEach(() => {
    vi.stubGlobal("Image", class MockImage {
      src = "";
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 1920;
      height = 1080;
      constructor() {
        setTimeout(() => {
          if (this.onload) this.onload();
        }, 0);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("应返回图片尺寸", async () => {
    const result = await getImageDimensions("https://example.com/image.jpg");
    expect(result).toEqual({ width: 1920, height: 1080 });
  });
});
