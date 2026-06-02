import { describe, it, expect } from "vitest";

describe("R32: Batch generation loops must check cancellation on component unmount", () => {
  it("should stop batch loop when cancelledRef is set to true", async () => {
    const cancelledRef = { current: false };
    const processedIds: string[] = [];
    const beats = [
      { id: "beat-1" },
      { id: "beat-2" },
      { id: "beat-3" },
    ];

    const generateKeyframe = vi.fn(async (beatId: string) => {
      processedIds.push(beatId);
      if (beatId === "beat-2") {
        cancelledRef.current = true;
      }
      return { id: beatId };
    });

    for (let i = 0; i < beats.length; i++) {
      if (cancelledRef.current) break;
      await generateKeyframe(beats[i].id);
      if (cancelledRef.current) break;
    }

    expect(processedIds).toEqual(["beat-1", "beat-2"]);
    expect(processedIds).not.toContain("beat-3");
  });

  it("should process all beats when cancelledRef stays false", async () => {
    const cancelledRef = { current: false };
    const processedIds: string[] = [];
    const beats = [
      { id: "beat-1" },
      { id: "beat-2" },
      { id: "beat-3" },
    ];

    const generateKeyframe = vi.fn(async (beatId: string) => {
      processedIds.push(beatId);
      return { id: beatId };
    });

    for (let i = 0; i < beats.length; i++) {
      if (cancelledRef.current) break;
      await generateKeyframe(beats[i].id);
      if (cancelledRef.current) break;
    }

    expect(processedIds).toEqual(["beat-1", "beat-2", "beat-3"]);
  });

  it("should not process any beats if cancelledRef is true before loop starts", async () => {
    const cancelledRef = { current: true };
    const processedIds: string[] = [];
    const beats = [{ id: "beat-1" }];

    const generateKeyframe = vi.fn(async (beatId: string) => {
      processedIds.push(beatId);
    });

    for (let i = 0; i < beats.length; i++) {
      if (cancelledRef.current) break;
      await generateKeyframe(beats[i].id);
      if (cancelledRef.current) break;
    }

    expect(processedIds).toEqual([]);
    expect(generateKeyframe).not.toHaveBeenCalled();
  });
});
