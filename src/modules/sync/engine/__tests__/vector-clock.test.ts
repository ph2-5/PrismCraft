import { describe, it, expect } from "vitest";
import {
  compareVectorClocks,
  mergeVectorClocks,
  isVectorClockConflict,
  type VectorClock,
} from "../../engine/types";

describe("Vector Clock 向量时钟", () => {
  describe("compareVectorClocks", () => {
    it("空时钟应相等", () => {
      expect(compareVectorClocks({}, {})).toBe(0);
    });

    it("相同时钟应相等", () => {
      const vc: VectorClock = { device1: 1, device2: 2 };
      expect(compareVectorClocks(vc, { ...vc })).toBe(0);
    });

    it("a 完全大于 b 时应返回 1", () => {
      const a: VectorClock = { device1: 2, device2: 3 };
      const b: VectorClock = { device1: 1, device2: 2 };
      expect(compareVectorClocks(a, b)).toBe(1);
    });

    it("a 完全小于 b 时应返回 -1", () => {
      const a: VectorClock = { device1: 1, device2: 1 };
      const b: VectorClock = { device1: 2, device2: 3 };
      expect(compareVectorClocks(a, b)).toBe(-1);
    });

    it("并发时钟应返回 0（既不大于也不小于）", () => {
      const a: VectorClock = { device1: 2, device2: 1 };
      const b: VectorClock = { device1: 1, device2: 2 };
      expect(compareVectorClocks(a, b)).toBe(0);
    });

    it("a 有额外设备但其他都大于等于时应返回 1", () => {
      const a: VectorClock = { device1: 2, device2: 3, device3: 1 };
      const b: VectorClock = { device1: 1, device2: 2 };
      expect(compareVectorClocks(a, b)).toBe(1);
    });

    it("b 有额外设备且 a 不大于时应返回 -1", () => {
      const a: VectorClock = { device1: 1 };
      const b: VectorClock = { device1: 1, device2: 1 };
      expect(compareVectorClocks(a, b)).toBe(-1);
    });
  });

  describe("mergeVectorClocks", () => {
    it("应合并两个时钟取最大值", () => {
      const a: VectorClock = { device1: 2, device2: 1 };
      const b: VectorClock = { device1: 1, device2: 3 };
      const merged = mergeVectorClocks(a, b);

      expect(merged.device1).toBe(2);
      expect(merged.device2).toBe(3);
    });

    it("空时钟合并应返回原时钟", () => {
      const a: VectorClock = { device1: 1 };
      expect(mergeVectorClocks(a, {})).toEqual(a);
      expect(mergeVectorClocks({}, a)).toEqual(a);
    });

    it("两个空时钟合并应返回空时钟", () => {
      expect(mergeVectorClocks({}, {})).toEqual({});
    });
  });

  describe("isVectorClockConflict", () => {
    it("并发时钟应检测为冲突", () => {
      const a: VectorClock = { device1: 2, device2: 1 };
      const b: VectorClock = { device1: 1, device2: 2 };
      expect(isVectorClockConflict(a, b)).toBe(true);
    });

    it("有序时钟不应检测为冲突", () => {
      const a: VectorClock = { device1: 2, device2: 2 };
      const b: VectorClock = { device1: 1, device2: 1 };
      expect(isVectorClockConflict(a, b)).toBe(false);
    });

    it("相同时钟不应检测为冲突", () => {
      const a: VectorClock = { device1: 1, device2: 2 };
      expect(isVectorClockConflict(a, { ...a })).toBe(false);
    });
  });
});
