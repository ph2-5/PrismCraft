import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Story, StoryBeat, StoryVersion } from "@/domain/schemas";

vi.mock("@/infrastructure/di", () => ({
  container: {
    versionStorage: {
      getStoryVersions: vi.fn(),
      createStoryVersion: vi.fn(),
      deleteStoryVersion: vi.fn(),
      deleteOldStoryVersions: vi.fn(),
    },
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: { warn: vi.fn(), error: vi.fn() },
}));

import {
  getVersions,
  saveVersion,
  restoreVersion,
  deleteVersion,
  cleanupVersions,
  getVersionStats,
  compareVersions,
  formatVersionTime,
} from "../version-control";
import { container } from "@/infrastructure/di";

const versionStorage = vi.mocked(container.versionStorage);

const mockStory: Story = {
  id: "story-1",
  title: "测试故事",
  description: "测试描述",
  characters: ["char-1"],
  scenes: ["scene-1"],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  beats: [],
  elementIds: [],
  genre: "drama",
  tone: "neutral",
  targetDuration: 60,
  status: "in_progress",
};

const mockBeats: StoryBeat[] = [
  {
    id: "beat-1",
    sequence: 0,
    description: "分镜描述",
    duration: 5,
    characterIds: [],
    enhancedGeneration: false,
    elementIds: [],
  },
];

function makeVersion(overrides: Partial<StoryVersion> = {}): StoryVersion {
  return {
    id: "ver-1",
    storyId: "story-1",
    timestamp: Date.now(),
    beats: mockBeats,
    title: "测试故事",
    description: "测试描述",
    genre: "drama",
    tone: "neutral",
    targetDuration: 60,
    characters: ["char-1"],
    scenes: ["scene-1"],
    changeSummary: "手动保存",
    autoSaved: false,
    ...overrides,
  };
}

describe("getVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应返回故事版本列表", async () => {
    const versions = [makeVersion(), makeVersion({ id: "ver-2" })];
    versionStorage.getStoryVersions.mockResolvedValue(versions);

    const result = await getVersions("story-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
    expect(versionStorage.getStoryVersions).toHaveBeenCalledWith("story-1");
  });

  it("异常时应返回 err Result", async () => {
    versionStorage.getStoryVersions.mockRejectedValue(new Error("DB error"));

    const result = await getVersions("story-1");

    expect(result.ok).toBe(false);
  });
});

describe("saveVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应创建版本并清理旧版本", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const result = await saveVersion(mockStory, mockBeats, "测试保存");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.storyId).toBe("story-1");
      expect(result.value!.changeSummary).toBe("测试保存");
      expect(result.value!.autoSaved).toBe(false);
      expect(result.value!.beats).toEqual(mockBeats);
    }
    expect(versionStorage.createStoryVersion).toHaveBeenCalled();
    expect(versionStorage.deleteOldStoryVersions).toHaveBeenCalledWith("story-1", 20);
  });

  it("自动保存时应设置 autoSaved 为 true", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const result = await saveVersion(mockStory, mockBeats, "", true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.autoSaved).toBe(true);
      expect(result.value!.changeSummary).toBe("自动保存");
    }
  });

  it("无 changeSummary 且非自动保存时应使用默认值", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const result = await saveVersion(mockStory, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.changeSummary).toBe("手动保存");
    }
  });

  it("应深拷贝 beats", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const result = await saveVersion(mockStory, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.beats).toEqual(mockBeats);
      expect(result.value!.beats).not.toBe(mockBeats);
    }
  });

  it("故事缺少可选字段时应使用默认值", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const minimalStory = { ...mockStory, genre: undefined, tone: undefined, targetDuration: undefined, characters: undefined, scenes: undefined } as unknown as Story;
    const result = await saveVersion(minimalStory, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value!.genre).toBe("drama");
      expect(result.value!.tone).toBe("neutral");
      expect(result.value!.targetDuration).toBe(60);
      expect(result.value!.characters).toEqual([]);
      expect(result.value!.scenes).toEqual([]);
    }
  });

  it("存储失败时应返回 ok(null)", async () => {
    versionStorage.createStoryVersion.mockRejectedValue(new Error("存储失败"));

    const result = await saveVersion(mockStory, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("故事没有 id 时应生成稳定 id", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const storyWithoutId = { ...mockStory, id: "" };
    const result = await saveVersion(storyWithoutId, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.storyId).toMatch(/^new_/);
    }
  });
});

describe("restoreVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应先保存当前版本再恢复目标版本", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const version = makeVersion();
    const result = await restoreVersion(version, mockStory, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.story.id).toBe("story-1");
      expect(result.value.story.title).toBe("测试故事");
      expect(result.value.beats).toEqual(version.beats);
      expect(result.value.beats).not.toBe(version.beats);
    }
    expect(versionStorage.createStoryVersion).toHaveBeenCalled();
  });

  it("恢复的故事应包含版本中的字段", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const version = makeVersion({
      title: "版本标题",
      description: "版本描述",
      genre: "comedy",
      tone: "humorous",
      targetDuration: 120,
      characters: ["char-2"],
      scenes: ["scene-2"],
    });
    const result = await restoreVersion(version, mockStory, mockBeats);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.story.title).toBe("版本标题");
      expect(result.value.story.description).toBe("版本描述");
      expect(result.value.story.genre).toBe("comedy");
      expect(result.value.story.tone).toBe("humorous");
      expect(result.value.story.targetDuration).toBe(120);
      expect(result.value.story.characters).toEqual(["char-2"]);
      expect(result.value.story.scenes).toEqual(["scene-2"]);
    }
  });

  it("恢复的故事应有正确的 updatedAt", async () => {
    versionStorage.createStoryVersion.mockResolvedValue(undefined);
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const version = makeVersion();
    const before = Math.floor(Date.now() / 1000);
    const result = await restoreVersion(version, mockStory, mockBeats);
    const after = Math.floor(Date.now() / 1000);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.story.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.value.story.updatedAt).toBeLessThanOrEqual(after);
    }
  });
});

describe("deleteVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应调用 storage 删除版本", async () => {
    versionStorage.deleteStoryVersion.mockResolvedValue(undefined);

    const result = await deleteVersion("story-1", "ver-1");

    expect(result.ok).toBe(true);
    expect(versionStorage.deleteStoryVersion).toHaveBeenCalledWith("ver-1");
  });

  it("存储失败时不应抛出错误", async () => {
    versionStorage.deleteStoryVersion.mockRejectedValue(new Error("删除失败"));

    const result = await deleteVersion("story-1", "ver-1");

    expect(result.ok).toBe(true);
  });
});

describe("cleanupVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应使用指定保留数量清理版本", async () => {
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const result = await cleanupVersions("story-1", 5);

    expect(result.ok).toBe(true);
    expect(versionStorage.deleteOldStoryVersions).toHaveBeenCalledWith("story-1", 5);
  });

  it("默认保留 10 个版本", async () => {
    versionStorage.deleteOldStoryVersions.mockResolvedValue(undefined);

    const result = await cleanupVersions("story-1");

    expect(result.ok).toBe(true);
    expect(versionStorage.deleteOldStoryVersions).toHaveBeenCalledWith("story-1", 10);
  });

  it("存储失败时不应抛出错误", async () => {
    versionStorage.deleteOldStoryVersions.mockRejectedValue(new Error("清理失败"));

    const result = await cleanupVersions("story-1");

    expect(result.ok).toBe(true);
  });
});

describe("getVersionStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应正确统计版本信息", async () => {
    const versions = [
      makeVersion({ autoSaved: true, timestamp: 3000 }),
      makeVersion({ autoSaved: false, timestamp: 2000 }),
      makeVersion({ autoSaved: true, timestamp: 1000 }),
    ];
    versionStorage.getStoryVersions.mockResolvedValue(versions);

    const result = await getVersionStats("story-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.total).toBe(3);
      expect(result.value.autoSaved).toBe(2);
      expect(result.value.manualSaved).toBe(1);
    }
  });

  it("没有版本时 newestVersion 和 oldestVersion 应为 null", async () => {
    versionStorage.getStoryVersions.mockResolvedValue([]);

    const result = await getVersionStats("story-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.total).toBe(0);
      expect(result.value.autoSaved).toBe(0);
      expect(result.value.manualSaved).toBe(0);
      expect(result.value.newestVersion).toBeNull();
      expect(result.value.oldestVersion).toBeNull();
    }
  });

  it("应返回最新和最旧版本的时间戳", async () => {
    const versions = [
      makeVersion({ timestamp: 3000 }),
      makeVersion({ timestamp: 1000 }),
    ];
    versionStorage.getStoryVersions.mockResolvedValue(versions);

    const result = await getVersionStats("story-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.newestVersion).toBe(3000);
      expect(result.value.oldestVersion).toBe(1000);
    }
  });
});

describe("compareVersions", () => {
  it("应检测新增的 beats", () => {
    const v1 = makeVersion({ beats: [mockBeats[0]!] });
    const v2 = makeVersion({ beats: [mockBeats[0]!, { ...mockBeats[0]!, id: "beat-2" } as StoryBeat] });

    const diff = compareVersions(v1, v2);

    expect(diff.beatsAdded).toBe(1);
    expect(diff.beatsRemoved).toBe(0);
  });

  it("应检测删除的 beats", () => {
    const v1 = makeVersion({ beats: [mockBeats[0]!, { ...mockBeats[0]!, id: "beat-2" } as StoryBeat] });
    const v2 = makeVersion({ beats: [mockBeats[0]!] });

    const diff = compareVersions(v1, v2);

    expect(diff.beatsAdded).toBe(0);
    expect(diff.beatsRemoved).toBe(1);
  });

  it("应检测修改的 beats", () => {
    const v1 = makeVersion({
      beats: [{ ...mockBeats[0]!, title: "旧标题", content: "旧内容" } as StoryBeat],
    });
    const v2 = makeVersion({
      beats: [{ ...mockBeats[0]!, title: "新标题", content: "旧内容" } as StoryBeat],
    });

    const diff = compareVersions(v1, v2);

    expect(diff.beatsModified).toBe(1);
  });

  it("beats 数量相同时 beatsAdded 和 beatsRemoved 应为 0", () => {
    const v1 = makeVersion({ beats: [mockBeats[0]!] });
    const v2 = makeVersion({
      beats: [{ ...mockBeats[0]!, title: "新标题" } as StoryBeat],
    });

    const diff = compareVersions(v1, v2);

    expect(diff.beatsAdded).toBe(0);
    expect(diff.beatsRemoved).toBe(0);
    expect(diff.beatsModified).toBe(1);
  });

  it("应检测时长变化", () => {
    const v1 = makeVersion({
      beats: [{ ...mockBeats[0]!, duration: 5 } as StoryBeat],
    });
    const v2 = makeVersion({
      beats: [{ ...mockBeats[0]!, duration: 10 } as StoryBeat],
    });

    const diff = compareVersions(v1, v2);

    expect(diff.durationChanged).toBe(5);
  });

  it("应检测角色变化", () => {
    const v1 = makeVersion({ characters: ["char-1"] });
    const v2 = makeVersion({ characters: ["char-2"] });

    const diff = compareVersions(v1, v2);

    expect(diff.charactersChanged).toBe(true);
  });

  it("角色相同时 charactersChanged 应为 false", () => {
    const v1 = makeVersion({ characters: ["char-1"] });
    const v2 = makeVersion({ characters: ["char-1"] });

    const diff = compareVersions(v1, v2);

    expect(diff.charactersChanged).toBe(false);
  });

  it("应检测场景变化", () => {
    const v1 = makeVersion({ scenes: ["scene-1"] });
    const v2 = makeVersion({ scenes: ["scene-2"] });

    const diff = compareVersions(v1, v2);

    expect(diff.scenesChanged).toBe(true);
  });

  it("场景相同时 scenesChanged 应为 false", () => {
    const v1 = makeVersion({ scenes: ["scene-1"] });
    const v2 = makeVersion({ scenes: ["scene-1"] });

    const diff = compareVersions(v1, v2);

    expect(diff.scenesChanged).toBe(false);
  });
});

describe("formatVersionTime", () => {
  it("刚刚的时间应返回 '刚刚'", () => {
    const now = Date.now();
    const result = formatVersionTime(now);
    expect(result).toBe("刚刚");
  });

  it("几分钟前应返回 'X分钟前'", () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const result = formatVersionTime(fiveMinutesAgo);
    expect(result).toContain("分钟前");
  });

  it("几小时前应返回 'X小时前'", () => {
    const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
    const result = formatVersionTime(threeHoursAgo);
    expect(result).toContain("小时前");
  });

  it("超过一天应返回日期格式", () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const result = formatVersionTime(twoDaysAgo);
    expect(result).not.toContain("分钟前");
    expect(result).not.toContain("小时前");
    expect(result).not.toBe("刚刚");
  });
});
