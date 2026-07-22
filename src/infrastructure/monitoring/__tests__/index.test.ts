import { describe, it, expect } from "vitest";
import { performanceMonitor as reExportedMonitor } from "../index";
import { performanceMonitor as directMonitor } from "../performance-monitor";

describe("infrastructure/monitoring/index", () => {
  it("导出 performanceMonitor 实例", () => {
    expect(reExportedMonitor).toBeDefined();
  });

  it("从 index 导出的 monitor 与直接导入的是同一引用", () => {
    expect(reExportedMonitor).toBe(directMonitor);
  });

  it("performanceMonitor 暴露所有公开方法", () => {
    expect(typeof reExportedMonitor.measure).toBe("function");
    expect(typeof reExportedMonitor.onAlert).toBe("function");
    expect(typeof reExportedMonitor.getMetrics).toBe("function");
    expect(typeof reExportedMonitor.getStats).toBe("function");
    expect(typeof reExportedMonitor.clear).toBe("function");
  });
});
