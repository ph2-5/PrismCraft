import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { mockUseVirtualizer } = vi.hoisted(() => ({
  mockUseVirtualizer: vi.fn<(opts: Record<string, unknown>) => Record<string, unknown>>(() => ({
    getTotalSize: vi.fn(() => 5000),
    getVirtualItems: vi.fn(() => [
      { index: 0, start: 0, size: 50, key: "0" },
      { index: 1, start: 50, size: 50, key: "1" },
    ]),
  })),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: mockUseVirtualizer,
}));

import { useVirtualList } from "../use-virtual-list";

describe("useVirtualList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVirtualizer.mockReturnValue({
      getTotalSize: vi.fn(() => 5000),
      getVirtualItems: vi.fn(() => [
        { index: 0, start: 0, size: 50, key: "0" },
        { index: 1, start: 50, size: 50, key: "1" },
      ]),
    });
  });

  it("returns parentRef, virtualizer, items, totalSize, and virtualItems", () => {
    const items = ["a", "b", "c"];
    const { result } = renderHook(() =>
      useVirtualList({ items, estimateSize: 50 }),
    );

    expect(result.current.parentRef).toBeDefined();
    expect(result.current.virtualizer).toBeDefined();
    expect(result.current.items).toBe(items);
    expect(result.current.totalSize).toBe(5000);
    expect(result.current.virtualItems).toHaveLength(2);
  });

  it("passes items.length as count to useVirtualizer", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    renderHook(() => useVirtualList({ items, estimateSize: 40 }));

    expect(mockUseVirtualizer).toHaveBeenCalledWith(
      expect.objectContaining({ count: 100 }),
    );
  });

  it("passes estimateSize callback to useVirtualizer", () => {
    renderHook(() => useVirtualList({ items: [1, 2], estimateSize: 80 }));

    const config = mockUseVirtualizer.mock.calls[0]![0]! as Record<string, unknown>;
    expect((config.estimateSize as () => number)()).toBe(80);
  });

  it("uses default overscan of 5", () => {
    renderHook(() => useVirtualList({ items: [1], estimateSize: 50 }));

    expect(mockUseVirtualizer).toHaveBeenCalledWith(
      expect.objectContaining({ overscan: 5 }),
    );
  });

  it("accepts custom overscan value", () => {
    renderHook(() =>
      useVirtualList({ items: [1], estimateSize: 50, overscan: 10 }),
    );

    expect(mockUseVirtualizer).toHaveBeenCalledWith(
      expect.objectContaining({ overscan: 10 }),
    );
  });

  it("provides getScrollElement that returns parentRef", () => {
    renderHook(() => useVirtualList({ items: [1], estimateSize: 50 }));

    const config = mockUseVirtualizer.mock.calls[0]![0]! as Record<string, unknown>;
    expect((config.getScrollElement as () => null)()).toBeNull();
  });

  it("handles empty items array", () => {
    const { result } = renderHook(() =>
      useVirtualList({ items: [], estimateSize: 50 }),
    );

    expect(mockUseVirtualizer).toHaveBeenCalledWith(
      expect.objectContaining({ count: 0 }),
    );
    expect(result.current.items).toEqual([]);
  });
});
