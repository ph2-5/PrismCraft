import { describe, it, expect, vi } from "vitest";

describe("R83: Parallel Related-Entity Updates Regression Tests", () => {
  it("should update all related stories in parallel, not serial", async () => {
    const callTimes: number[] = [];
    const storyService = {
      update: vi.fn(async (id: string) => {
        callTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { ok: true, value: { id } };
      }),
    };

    const affectedStories = [
      { id: "s1", title: "Story 1" },
      { id: "s2", title: "Story 2" },
      { id: "s3", title: "Story 3" },
    ];

    const start = Date.now();
    const results = await Promise.allSettled(
      affectedStories.map((story) => storyService.update(story.id, story)),
    );
    const elapsed = Date.now() - start;

    expect(storyService.update).toHaveBeenCalledTimes(3);
    expect(storyService.update).toHaveBeenCalledWith("s1", affectedStories[0]);
    expect(storyService.update).toHaveBeenCalledWith("s2", affectedStories[1]);
    expect(storyService.update).toHaveBeenCalledWith("s3", affectedStories[2]);

    expect(elapsed).toBeLessThan(120);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("should collect failures from Promise.allSettled without short-circuiting", async () => {
    const storyService = {
      update: vi.fn(async (id: string) => {
        if (id === "s2") throw new Error("DB error");
        if (id === "s3") return { ok: false, error: "Conflict" };
        return { ok: true, value: { id } };
      }),
    };

    const affectedStories = [
      { id: "s1", title: "Story 1" },
      { id: "s2", title: "Story 2" },
      { id: "s3", title: "Story 3" },
    ];

    const failedStories: string[] = [];
    const results = await Promise.allSettled(
      affectedStories.map((story) => storyService.update(story.id, story)),
    );

    results.forEach((result, i) => {
      if (result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok)) {
        failedStories.push(affectedStories[i]!.title);
      }
    });

    expect(failedStories).toEqual(["Story 2", "Story 3"]);
    expect(storyService.update).toHaveBeenCalledTimes(3);
  });

  it("should be faster than serial for 10 stories", async () => {
    const storyService = {
      update: vi.fn(async (id: string) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { ok: true, value: { id } };
      }),
    };

    const affectedStories = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      title: `Story ${i}`,
    }));

    const parallelStart = Date.now();
    await Promise.allSettled(
      affectedStories.map((story) => storyService.update(story.id, story)),
    );
    const parallelElapsed = Date.now() - parallelStart;

    const serialStart = Date.now();
    for (const story of affectedStories) {
      await storyService.update(story.id, story);
    }
    const serialElapsed = Date.now() - serialStart;

    expect(parallelElapsed).toBeLessThan(serialElapsed / 2);
  });
});
