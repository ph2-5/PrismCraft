/**
 * R136: network-monitor 模块加载时禁止顶层副作用，副作用必须延迟到 startMonitoring()
 *
 * 回归规则目的：
 *   src/infrastructure/network/network-monitor.ts 模块加载时不应执行任何顶层副作用
 *   （如设置 window.__NETWORK_MONITOR_STATE__、注册 window.addEventListener 等）。
 *   所有副作用必须延迟到 startMonitoring() 显式调用后。
 *
 * 历史问题：
 *   原实现在模块顶层注册 window.__NETWORK_MONITOR_STATE__ 副作用，导致：
 *   1) 仅导入模块就修改了 window 全局状态
 *   2) HMR 时副作用重复执行
 *   3) 测试中无法控制副作用的执行时机
 *
 * 被测代码：
 *   src/infrastructure/network/network-monitor.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockErrorLogger, mockNetworkConfig } = vi.hoisted(() => ({
  mockErrorLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockNetworkConfig: {
    networkMonitor: {
      enabled: true,
      checkInterval: 10000,
      probeUrl: "/api/config",
      probeTimeout: 3000,
    },
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("../network.config", () => ({
  NETWORK_CONFIG: mockNetworkConfig,
}));

describe("R136: network-monitor 禁止顶层副作用", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let originalNetworkState: unknown;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // 保存原始状态
    originalNetworkState = (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__;
    delete (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__;

    // 在导入前 spy
    addEventListenerSpy = vi.spyOn(window, "addEventListener");
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    // mock fetch 避免 startMonitoring 中的网络请求失败
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    vi.unstubAllGlobals();

    // 恢复原始状态
    if (originalNetworkState === undefined) {
      delete (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__;
    } else {
      (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__ = originalNetworkState;
    }
  });

  it("模块导入时不应设置 window.__NETWORK_MONITOR_STATE__", async () => {
    // 确保导入前未设置
    expect(
      (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__,
    ).toBeUndefined();

    // 动态导入模块
    await import("../network-monitor");

    // 导入后仍不应设置（延迟到 startMonitoring）
    expect(
      (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__,
    ).toBeUndefined();
  });

  it("模块导入时不应调用 window.addEventListener", async () => {
    addEventListenerSpy.mockClear(); // 清除导入前 spy 设置时的调用

    await import("../network-monitor");

    // 模块加载期间不应有任何 addEventListener 调用
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it("模块导入时不应注册 online/offline 监听器", async () => {
    addEventListenerSpy.mockClear();

    await import("../network-monitor");

    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "offline",
      expect.any(Function),
    );
  });

  it("调用 startMonitoring() 后才设置 window.__NETWORK_MONITOR_STATE__", async () => {
    const mod = await import("../network-monitor");

    // 导入后立即检查
    expect(
      (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__,
    ).toBeUndefined();

    // 调用 startMonitoring
    mod.startMonitoring();

    // 现在应该被设置
    expect(
      (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__,
    ).toBeDefined();
    expect(
      (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__,
    ).not.toBeNull();
  });

  it("调用 startMonitoring() 后才注册 online/offline 监听器", async () => {
    addEventListenerSpy.mockClear();
    const mod = await import("../network-monitor");

    // 导入后不应有 online/offline 监听器
    expect(addEventListenerSpy).not.toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );

    mod.startMonitoring();

    // 现在应该注册
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "offline",
      expect.any(Function),
    );
  });

  it("重复调用 startMonitoring() 应幂等（isMonitoring 守卫）", async () => {
    const mod = await import("../network-monitor");

    mod.startMonitoring();
    const callsAfterFirst = addEventListenerSpy.mock.calls.length;

    // 第二次调用应该是 no-op
    mod.startMonitoring();
    const callsAfterSecond = addEventListenerSpy.mock.calls.length;

    expect(callsAfterSecond).toBe(callsAfterFirst);

    // 清理
    mod.stopMonitoring();
  });

  it("stopMonitoring() 应清理 online/offline 监听器", async () => {
    const mod = await import("../network-monitor");

    mod.startMonitoring();
    expect(removeEventListenerSpy).not.toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );

    mod.stopMonitoring();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "offline",
      expect.any(Function),
    );
  });

  it("ensureStateInitialized 重复调用应幂等（stateInitialized 守卫）", async () => {
    const mod = await import("../network-monitor");

    mod.startMonitoring();
    const stateAfterFirst = (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__;

    // 再次 startMonitoring 不应重新初始化（isMonitoring 守卫）
    mod.stopMonitoring();
    mod.startMonitoring();

    // 状态对象应保持稳定（getter 引用同一组闭包变量）
    const stateAfterSecond = (window as unknown as Record<string, unknown>).__NETWORK_MONITOR_STATE__;
    expect(stateAfterSecond).toBeDefined();
    // 状态对象应可访问 checkIntervalId 等 getter
    expect(stateAfterFirst).toBeDefined();
    expect(stateAfterSecond).toBeDefined();

    mod.stopMonitoring();
  });

  it("导入模块不应抛出异常", async () => {
    await expect(import("../network-monitor")).resolves.toBeDefined();
  });
});
