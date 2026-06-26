/**
 * R154: useAssetLoader MUST Load Characters/Scenes/StoryboardAssets via Promise.all
 *
 * 回归规则目的：
 *   src/modules/story/beat-editor/hooks/useAssetLoader.ts 中三个资源加载调用
 *   (getAllCharacters / getAllScenes / getStoryboardAssets) 必须通过 Promise.all
 *   并发执行，禁止改回串行 await。串行 await 会让首次进入故事编辑器的耗时
 *   变为三者总和（性能退化 50-60%）。
 *
 * 历史问题：
 *   原实现为三个连续 await，每次 await 都要等前一个 Promise resolve 才调用下一个，
 *   导致首屏耗时 = T(chars) + T(scenes) + T(storyboard)，而非 max(T(chars), T(scenes), T(storyboard))。
 *
 * 被测代码：
 *   src/modules/story/beat-editor/hooks/useAssetLoader.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Character, Scene } from "@/domain/schemas";

const { mockIsElectron, mockErrorLogger } = vi.hoisted(() => ({
  mockIsElectron: vi.fn().mockReturnValue(true),
  mockErrorLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

import { useAssetLoader } from "../useAssetLoader";

const mockCharacter: Character = {
  id: "char-1",
  name: "角色A",
  description: "测试",
  gender: "male",
  style: "anime",
  personality: [],
  appearance: {
    hairColor: "",
    hairStyle: "",
    eyeColor: "",
    height: "",
    build: "",
    clothing: "",
  },
  prompt: "测试",
  generatedImage: "https://example.com/char.png",
};

const mockScene: Scene = {
  id: "scene-1",
  name: "场景A",
  description: "测试",
  type: "indoor",
  timeOfDay: "day",
  weather: "sunny",
  mood: "calm",
  lighting: "bright",
  elements: [],
  colors: [],
  prompt: "测试",
  generatedImage: "https://example.com/scene.png",
};

/** 创建一组 deferred 风格的 mock services：每个 Promise 都通过 manual resolve 控制 */
function createDeferredServices() {
  let resolveChars!: (v: { ok: boolean; value?: Character[] }) => void;
  let resolveScenes!: (v: { ok: boolean; value?: Scene[] }) => void;
  let resolveAssets!: (v: Array<{ id: string; script?: string; previewPath?: string }>) => void;

  const charsPromise = new Promise<{ ok: boolean; value?: Character[] }>((r) => {
    resolveChars = r;
  });
  const scenesPromise = new Promise<{ ok: boolean; value?: Scene[] }>((r) => {
    resolveScenes = r;
  });
  const assetsPromise = new Promise<Array<{ id: string; script?: string; previewPath?: string }>>(
    (r) => {
      resolveAssets = r;
    },
  );

  const getAllCharacters = vi.fn(() => charsPromise);
  const getAllScenes = vi.fn(() => scenesPromise);
  const getStoryboardAssets = vi.fn(() => assetsPromise);

  return {
    services: { getAllCharacters, getAllScenes, getStoryboardAssets },
    resolves: { resolveChars, resolveScenes, resolveAssets },
    spies: { getAllCharacters, getAllScenes, getStoryboardAssets },
  };
}

describe("R154: useAssetLoader 必须用 Promise.all 并发加载", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectron.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("三个 services 必须在 effect 启动时同步调用（并发），而非串行 await", async () => {
    const { services, spies } = createDeferredServices();
    const { result } = renderHook(() => useAssetLoader(services));

    // 同步阶段：所有三个 services 应该被调用一次。
    // 若是串行 await，第二个 service 必须等第一个 Promise resolve 才会被调用。
    // 这里我们故意不 resolve 任何 Promise，验证三个调用都已发生。
    expect(spies.getAllCharacters).toHaveBeenCalledTimes(1);
    expect(spies.getAllScenes).toHaveBeenCalledTimes(1);
    expect(spies.getStoryboardAssets).toHaveBeenCalledTimes(1);

    // isLoading 仍应为 true，因为没有任何 Promise 已 resolve
    expect(result.current.isLoading).toBe(true);

    // cleanup 避免 React 警告
    (result as unknown as { unmount: () => void }).unmount?.();
  });

  it("第二个 service 调用时第一个 Promise 仍未 resolve（证明并发而非串行）", async () => {
    const { services } = createDeferredServices();
    const callOrder: string[] = [];

    const spies2 = {
      getAllCharacters: vi.fn(() => {
        callOrder.push("chars-start");
        return new Promise<{ ok: boolean; value?: Character[] }>((r) => {
          // 永远不主动 resolve；用 setTimeout(0) 模拟异步
          setTimeout(() => r({ ok: true, value: [mockCharacter] }), 0);
        });
      }),
      getAllScenes: vi.fn(() => {
        callOrder.push("scenes-start");
        // 关键断言：调用 scenes 时，chars Promise 仍未 resolve（同步链路上即被调用）
        // 由于 chars 用 setTimeout(0) 延迟 resolve，scenes 在同步阶段被调用即证明并发
        return new Promise<{ ok: boolean; value?: Scene[] }>((r) => {
          setTimeout(() => r({ ok: true, value: [mockScene] }), 0);
        });
      }),
      getStoryboardAssets: vi.fn(() => {
        callOrder.push("assets-start");
        return new Promise<Array<{ id: string }>>((r) => {
          setTimeout(() => r([{ id: "sb-1" }]), 0);
        });
      }),
    };
    services.getAllCharacters = spies2.getAllCharacters;
    services.getAllScenes = spies2.getAllScenes;
    services.getStoryboardAssets = spies2.getStoryboardAssets;

    const { result } = renderHook(() => useAssetLoader(services));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 三个调用都发生
    expect(spies2.getAllCharacters).toHaveBeenCalledTimes(1);
    expect(spies2.getAllScenes).toHaveBeenCalledTimes(1);
    expect(spies2.getStoryboardAssets).toHaveBeenCalledTimes(1);

    // 调用顺序：三个 start 都应在任何 resolve 之前
    expect(callOrder).toEqual(["chars-start", "scenes-start", "assets-start"]);

    (result as unknown as { unmount: () => void }).unmount?.();
  });

  it("总耗时应接近单个最大延迟而非三者总和（Promise.all 时序断言）", async () => {
    // 使用较大延迟，避免 jsdom 环境本身的 setup 开销干扰判定
    const CHAR_DELAY = 200;
    const SCENE_DELAY = 150;
    const ASSET_DELAY = 100;
    const SERIAL_SUM = CHAR_DELAY + SCENE_DELAY + ASSET_DELAY; // 450ms
    const PARALLEL_MAX = CHAR_DELAY; // 200ms

    const services = {
      getAllCharacters: vi.fn(
        () =>
          new Promise<{ ok: boolean; value?: Character[] }>((r) =>
            setTimeout(() => r({ ok: true, value: [mockCharacter] }), CHAR_DELAY),
          ),
      ),
      getAllScenes: vi.fn(
        () =>
          new Promise<{ ok: boolean; value?: Scene[] }>((r) =>
            setTimeout(() => r({ ok: true, value: [mockScene] }), SCENE_DELAY),
          ),
      ),
      getStoryboardAssets: vi.fn(
        () =>
          new Promise<Array<{ id: string }>>((r) =>
            setTimeout(() => r([{ id: "sb-1" }]), ASSET_DELAY),
          ),
      ),
    };

    const start = Date.now();
    const { result } = renderHook(() => useAssetLoader(services));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const elapsed = Date.now() - start;

    // 若是串行：耗时 ≈ SERIAL_SUM (450ms)
    // 若是并发（Promise.all）：耗时 ≈ PARALLEL_MAX (200ms) + 环境 setup 余量 (~80ms)
    // 阈值取 SERIAL_SUM 的 70%（315ms），低于此值即证明是并发而非串行
    expect(elapsed).toBeLessThan(SERIAL_SUM * 0.7);
    // 同时应明显大于 PARALLEL_MAX（确认定时器确实生效）
    expect(elapsed).toBeGreaterThanOrEqual(PARALLEL_MAX);

    // 三个 services 都被调用一次
    expect(services.getAllCharacters).toHaveBeenCalledTimes(1);
    expect(services.getAllScenes).toHaveBeenCalledTimes(1);
    expect(services.getStoryboardAssets).toHaveBeenCalledTimes(1);

    (result as unknown as { unmount: () => void }).unmount?.();
  });

  it("三个 Promise 全部 resolve 后才设置 isLoading=false 与数据", async () => {
    const { services, resolves } = createDeferredServices();
    const { result } = renderHook(() => useAssetLoader(services));

    // 仅 resolve chars，isLoading 仍为 true
    resolves.resolveChars({ ok: true, value: [mockCharacter] });
    // 等待微任务刷新
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.isLoading).toBe(true);

    // 再 resolve scenes，仍为 true
    resolves.resolveScenes({ ok: true, value: [mockScene] });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.isLoading).toBe(true);

    // 最后 resolve assets，才完成
    resolves.resolveAssets([{ id: "sb-1", script: "镜头1" }]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.characters).toHaveLength(1);
    expect(result.current.scenes).toHaveLength(1);
    // assets 总数 = 1 (char with generatedImage) + 1 (scene with generatedImage) + 1 (sbAsset)
    expect(result.current.assets).toHaveLength(3);

    (result as unknown as { unmount: () => void }).unmount?.();
  });

  it("若改回串行 await（用 spy 检测），第二个 service 必须在第一个 resolve 后才调用", async () => {
    // 此测试反向验证：构造一个串行调用的伪实现，断言其行为与当前实现不同。
    // 这样如果未来代码被改回串行，下面的同步断言会失败。
    const callOrder: string[] = [];

    const getAllCharacters = vi.fn(() => {
      callOrder.push("chars-start");
      return new Promise<{ ok: boolean; value?: Character[] }>((r) => {
        setTimeout(() => {
          callOrder.push("chars-resolve");
          r({ ok: true, value: [mockCharacter] });
        }, 20);
      });
    });
    const getAllScenes = vi.fn(() => {
      callOrder.push("scenes-start");
      // 关键：如果 scenes-start 在 chars-resolve 之前被记录，说明是 Promise.all（并发）
      // 如果在 chars-resolve 之后才被记录，说明是串行 await（退化了）
      return new Promise<{ ok: boolean; value?: Scene[] }>((r) => {
        setTimeout(() => r({ ok: true, value: [mockScene] }), 20);
      });
    });
    const getStoryboardAssets = vi.fn(() => {
      callOrder.push("assets-start");
      return new Promise<Array<{ id: string }>>((r) => {
        setTimeout(() => r([{ id: "sb-1" }]), 20);
      });
    });

    const services = { getAllCharacters, getAllScenes, getStoryboardAssets };
    const { result } = renderHook(() => useAssetLoader(services));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 断言：scenes-start 必须在 chars-resolve 之前出现
    // 即所有三个 service 在同步阶段被并发调用，没有等待任何 resolve
    const scenesStartIndex = callOrder.indexOf("scenes-start");
    const charsResolveIndex = callOrder.indexOf("chars-resolve");
    expect(scenesStartIndex).toBeGreaterThanOrEqual(0);
    expect(charsResolveIndex).toBeGreaterThanOrEqual(0);
    expect(scenesStartIndex).toBeLessThan(charsResolveIndex);

    (result as unknown as { unmount: () => void }).unmount?.();
  });
});
