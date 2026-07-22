import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Scene, Story, StoryBeat } from "@/domain/schemas";
import type { Result } from "@/domain/types";
import { ok, err, AppError } from "@/domain/types";

const { mockStoryService, mockErrorLogger, mockT } = vi.hoisted(() => ({
  mockStoryService: {
    update: vi.fn<(id: string, input: Partial<Story>) => Promise<Result<void>>>(),
  },
  mockErrorLogger: { warn: vi.fn() },
  mockT: vi.fn((key: string, params?: Record<string, string>) => {
    if (key === "story.partialUpdateFailedDetail" && params?.items) return `部分更新失败：${params.items}`;
    return key;
  }),
}));

vi.mock("@/modules/storyboard", () => ({
  storyService: mockStoryService,
  useStories: vi.fn(),
}));

vi.mock("@/modules/scene", () => ({
  sceneService: { update: vi.fn() },
  defaultScene: { id: "", name: "", description: "" },
  useScenes: vi.fn(),
  useSceneImage: vi.fn(),
  useSceneCRUD: vi.fn(),
}));

vi.mock("@/modules/asset", () => ({
  useMediaAssets: vi.fn(),
  useCreateMediaAsset: vi.fn(),
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

vi.mock("@/shared/constants/messages", () => ({
  t: mockT,
}));

import {
  updateStoriesAfterSceneDelete,
  computeReferencedBeatsForScene,
  filterScenesByQuery,
} from "../hooks/use-scenes-page";

// ── Test data builders ──

function buildBeat(overrides: Partial<StoryBeat> = {}): StoryBeat {
  return {
    id: "beat_1",
    sequence: 1,
    description: "",
    characterIds: [],
    elementIds: [],
    ...overrides,
  } as StoryBeat;
}

function buildStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story_1",
    title: "默认故事",
    description: "",
    characters: [],
    scenes: [],
    createdAt: 0,
    updatedAt: 0,
    beats: [],
    elementIds: [],
    ...overrides,
  } as Story;
}

function buildScene(overrides: Partial<Scene> = {}): Scene {
  return {
    id: "scene_1",
    name: "场景一",
    description: "",
    type: "室内",
    timeOfDay: "",
    weather: "",
    mood: "",
    lighting: "",
    elements: [],
    colors: [],
    prompt: "",
    ...overrides,
  } as Scene;
}

// ── updateStoriesAfterSceneDelete ──

describe("updateStoriesAfterSceneDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoryService.update.mockResolvedValue(ok(undefined));
  });

  it("场景被 story beats 引用时，清理 beats 中的 sceneId 与 scenes 列表", async () => {
    const sceneId = "scene_target";
    const stories = [
      buildStory({
        id: "story_a",
        title: "故事A",
        beats: [
          buildBeat({ id: "b1", sequence: 1, sceneId: "scene_target" }),
          buildBeat({ id: "b2", sequence: 2, sceneId: "other_scene" }),
        ],
        scenes: ["scene_target", "other_scene"],
      }),
    ];
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete(sceneId, stories, showError);

    expect(mockStoryService.update).toHaveBeenCalledTimes(1);
    const [calledId, calledInput] = mockStoryService.update.mock.calls[0]!;
    expect(calledId).toBe("story_a");
    // beats 中 sceneId 被清除（删除属性）
    expect(calledInput.beats![0].sceneId).toBeUndefined();
    // 未引用的 beat 保持不变
    expect(calledInput.beats![1].sceneId).toBe("other_scene");
    // scenes 列表中移除目标 sceneId
    expect(calledInput.scenes).toEqual(["other_scene"]);
    // 全部成功，不报错
    expect(showError).not.toHaveBeenCalled();
  });

  it("场景仅被 scenes 列表引用（无 beat 引用）时，仍触发更新", async () => {
    const sceneId = "scene_target";
    const stories = [
      buildStory({
        id: "story_b",
        title: "故事B",
        beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "other" })],
        scenes: ["scene_target"],
      }),
    ];
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete(sceneId, stories, showError);

    expect(mockStoryService.update).toHaveBeenCalledTimes(1);
    const [, calledInput] = mockStoryService.update.mock.calls[0]!;
    expect(calledInput.scenes).toEqual([]);
  });

  it("Promise.allSettled 容错：部分 story 更新 reject 时，调用 showError 上报失败列表", async () => {
    const sceneId = "scene_target";
    const stories = [
      buildStory({
        id: "story_ok",
        title: "成功故事",
        beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "scene_target" })],
      }),
      buildStory({
        id: "story_fail",
        title: "失败故事",
        beats: [buildBeat({ id: "b2", sequence: 2, sceneId: "scene_target" })],
      }),
    ];
    mockStoryService.update
      .mockResolvedValueOnce(ok(undefined))
      .mockRejectedValueOnce(new Error("network down"));
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete(sceneId, stories, showError);

    expect(mockStoryService.update).toHaveBeenCalledTimes(2);
    expect(showError).toHaveBeenCalledTimes(1);
    const [title, desc] = showError.mock.calls[0]!;
    expect(title).toBe("story.partialUpdateFailed");
    expect(desc).toContain("失败故事");
  });

  it("Promise.allSettled 容错：部分 story 更新返回 ok=false 时，调用 showError 上报失败列表", async () => {
    const sceneId = "scene_target";
    const stories = [
      buildStory({
        id: "story_fail",
        title: "失败故事",
        beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "scene_target" })],
      }),
    ];
    mockStoryService.update.mockResolvedValueOnce(err(new AppError("VALIDATION_ERROR", "校验失败")));
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete(sceneId, stories, showError);

    expect(mockStoryService.update).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledTimes(1);
    const [, desc] = showError.mock.calls[0]!;
    expect(desc).toContain("失败故事");
    // errorLogger.warn 应被调用记录失败原因
    expect(mockErrorLogger.warn).toHaveBeenCalled();
  });

  it("失败 story 无 title 时，使用 id 前 8 位作为标识", async () => {
    const sceneId = "scene_target";
    const longId = "story_abcdefgh1234";
    const stories = [
      buildStory({
        id: longId,
        title: "",
        beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "scene_target" })],
      }),
    ];
    mockStoryService.update.mockResolvedValueOnce(err(new AppError("DB_ERROR", "fail")));
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete(sceneId, stories, showError);

    expect(showError).toHaveBeenCalledTimes(1);
    const [, desc] = showError.mock.calls[0]!;
    // id 前 8 位: "story_ab"
    expect(desc).toContain("story_ab");
  });

  it("场景未被任何 story 引用时，不触发更新与报错", async () => {
    const sceneId = "scene_orphan";
    const stories = [
      buildStory({
        id: "story_x",
        beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "other_scene" })],
        scenes: ["other_scene"],
      }),
    ];
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete(sceneId, stories, showError);

    expect(mockStoryService.update).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });

  it("空故事列表时，无任何操作", async () => {
    const showError = vi.fn();

    await updateStoriesAfterSceneDelete("scene_any", [], showError);

    expect(mockStoryService.update).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  });
});

// ── computeReferencedBeatsForScene ──

describe("computeReferencedBeatsForScene", () => {
  it("场景被多个 beats 引用时，返回所有引用记录", () => {
    const sceneId = "scene_target";
    const stories = [
      buildStory({
        id: "story_a",
        title: "故事A",
        beats: [
          buildBeat({ id: "b1", sequence: 1, sceneId: "scene_target", title: "开场", description: "开场描述", imageUrl: "u1", generationStatus: "completed" }),
          buildBeat({ id: "b2", sequence: 2, sceneId: "other" }),
        ],
      }),
      buildStory({
        id: "story_b",
        title: "故事B",
        beats: [
          buildBeat({ id: "b3", sequence: 3, sceneId: "scene_target", title: "高潮", description: "高潮描述" }),
        ],
      }),
    ];

    const result = computeReferencedBeatsForScene(stories, sceneId);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ storyId: "story_a", storyTitle: "故事A", sequence: 1, title: "开场", description: "开场描述", imageUrl: "u1", generationStatus: "completed" });
    expect(result[1]).toMatchObject({ storyId: "story_b", storyTitle: "故事B", sequence: 3, title: "高潮", description: "高潮描述" });
  });

  it("场景未被任何 beat 引用时，返回空数组", () => {
    const stories = [
      buildStory({
        id: "story_a",
        beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "other" })],
      }),
    ];

    const result = computeReferencedBeatsForScene(stories, "scene_target");

    expect(result).toEqual([]);
  });

  it("多个故事中查找，跨故事聚合结果", () => {
    const sceneId = "scene_shared";
    const stories = [
      buildStory({ id: "s1", title: "S1", beats: [buildBeat({ id: "b1", sequence: 1, sceneId: "scene_shared" })] }),
      buildStory({ id: "s2", title: "S2", beats: [buildBeat({ id: "b2", sequence: 2, sceneId: "scene_shared" })] }),
      buildStory({ id: "s3", title: "S3", beats: [buildBeat({ id: "b3", sequence: 3, sceneId: "unrelated" })] }),
    ];

    const result = computeReferencedBeatsForScene(stories, sceneId);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.storyId)).toEqual(["s1", "s2"]);
  });

  it("story.beats 为 undefined 时不抛错（容错）", () => {
    const stories = [buildStory({ id: "s1", beats: undefined as unknown as StoryBeat[] })];

    const result = computeReferencedBeatsForScene(stories, "scene_target");

    expect(result).toEqual([]);
  });
});

// ── filterScenesByQuery ──

describe("filterScenesByQuery", () => {
  const scenes = [
    buildScene({ id: "1", name: "森林小屋", description: "神秘" }),
    buildScene({ id: "2", name: "城市街道", description: "繁华" }),
    buildScene({ id: "3", name: "Forest Cabin", description: "mystic" }),
  ];

  it("空查询返回全部场景", () => {
    expect(filterScenesByQuery(scenes, "")).toHaveLength(3);
  });

  it("仅空白字符的查询返回全部场景", () => {
    expect(filterScenesByQuery(scenes, "   ")).toHaveLength(3);
  });

  it("按名称匹配", () => {
    const result = filterScenesByQuery(scenes, "森林");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("大小写不敏感匹配", () => {
    const result = filterScenesByQuery(scenes, "forest");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("无匹配时返回空数组", () => {
    expect(filterScenesByQuery(scenes, "不存在的内容xyz")).toEqual([]);
  });

  it("不按描述匹配（仅匹配 name 字段，锁定当前行为）", () => {
    // "神秘" 仅出现在 description 中，name 中没有，故不应匹配
    const result = filterScenesByQuery(scenes, "神秘");
    expect(result).toEqual([]);
  });
});
