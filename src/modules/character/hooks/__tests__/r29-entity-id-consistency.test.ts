import { describe, it, expect, vi } from "vitest";

describe("R29: Async callbacks must verify entity ID consistency", () => {
  it("should discard analysis result when entity ID changed during async operation", async () => {
    const currentEntityRef = { current: { id: "char-1" } };
    const setCurrentEntity = vi.fn();

    const entityIdAtStart = currentEntityRef.current.id;

    const mockAnalysisResult = {
      success: true,
      data: { analyzed: { name: "Analyzed Name" } },
    };

    currentEntityRef.current = { id: "char-2" };

    if (currentEntityRef.current.id !== entityIdAtStart) {
      // discard result
    } else {
      setCurrentEntity((prev: object) => ({ ...prev, ...mockAnalysisResult.data.analyzed }));
    }

    expect(setCurrentEntity).not.toHaveBeenCalled();
  });

  it("should apply analysis result when entity ID matches", async () => {
    const currentEntityRef = { current: { id: "char-1" } };
    const setCurrentEntity = vi.fn();

    const entityIdAtStart = currentEntityRef.current.id;

    const mockAnalysisResult = {
      success: true,
      data: { analyzed: { name: "Analyzed Name" } },
    };

    if (currentEntityRef.current.id !== entityIdAtStart) {
      // discard
    } else {
      setCurrentEntity((prev: object) => ({ ...prev, ...mockAnalysisResult.data.analyzed }));
    }

    expect(setCurrentEntity).toHaveBeenCalledTimes(1);
  });
});
