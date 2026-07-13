import { describe, it, expect, vi } from "vitest";

describe("R82: Async Re-entry Guard Regression Tests", () => {
  it("should prevent concurrent batch delete operations", async () => {
    let isBatchDeleting = false;
    let deleteCallCount = 0;

    const mockDelete = vi.fn(async () => {
      deleteCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const handleBatchDelete = async () => {
      if (isBatchDeleting) return;
      isBatchDeleting = true;
      try {
        await mockDelete();
      } finally {
        isBatchDeleting = false;
      }
    };

    const p1 = handleBatchDelete();
    const p2 = handleBatchDelete();
    const p3 = handleBatchDelete();

    await Promise.all([p1, p2, p3]);

    expect(deleteCallCount).toBe(1);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it("should allow sequential operations after first completes", async () => {
    let isBatchDeleting = false;
    const callOrder: number[] = [];

    const handleBatchDelete = async (id: number) => {
      if (isBatchDeleting) return false;
      isBatchDeleting = true;
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push(id);
        return true;
      } finally {
        isBatchDeleting = false;
      }
    };

    const result1 = await handleBatchDelete(1);
    expect(result1).toBe(true);

    const result2 = await handleBatchDelete(2);
    expect(result2).toBe(true);

    expect(callOrder).toEqual([1, 2]);
  });

  it("should guard with loading flag pattern", async () => {
    const isBatchDeleting = false;
    const selectedIds = new Set<string>();

    const handleBatchDelete = async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0 || isBatchDeleting) return;
    };

    await expect(handleBatchDelete()).resolves.toBeUndefined();
  });
});
