import { describe, it, expect } from "vitest";
import { flattenBeat } from "../stories/beat-transformer";
import { parseBeatRow } from "../stories/relations";

/**
 * 画布字段持久化 roundtrip 验证（可独立运行：npx vitest run src/infrastructure/storage/__tests__/beat-persistence-roundtrip.test.ts）
 *
 * 覆盖画布独有字段的落库与还原：
 * - 首尾帧衔接 keyframe.referencedPrevKeyframe（正式化到 generation 容器）
 * - 3D 导演台 blockout3D（正式化到 generation 容器）
 * - 旧数据 meta 兜底路径兼容
 */
describe("画布字段持久化 roundtrip", () => {
  const blockout3D = {
    id: "b3d-1",
    name: "3D 构图",
    version: 1,
    ground: { type: "ground" },
    props: [],
    characters: [],
    camera: { position: [0, 1, 2] },
    cameraPath: [],
    lighting: {},
  };

  it("flattenBeat：referencedPrevKeyframe 与 blockout3D 写入 generation 容器，不再进 meta 兜底", () => {
    const flat = flattenBeat(
      {
        id: "b1",
        keyframe: { imageUrl: "k.png", prompt: "p", referencedPrevKeyframe: "prev-1" },
        blockout3D,
      } as unknown as Record<string, unknown>,
      1000,
    );

    expect(flat.generationContainer.keyframeReferencedPrevKeyframe).toBe("prev-1");
    expect(flat.generationContainer.blockout3D).toEqual(blockout3D);
    // 不再作为未知字段进入 meta 兜底
    expect(flat.metaContainer?.keyframe).toBeUndefined();
    expect(flat.metaContainer?.blockout3D).toBeUndefined();
  });

  it("parseBeatRow：从 generation 容器还原 referencedPrevKeyframe 与 blockout3D", () => {
    const row: Record<string, unknown> = {
      id: "b1",
      story_id: "s1",
      sequence: 1,
      order_num: 1,
      description: "d",
      duration: 5,
      type: "scene",
      title: "t",
      content: null,
      character_ids_json: "[]",
      scene_id: null,
      camera: "{}",
      generation: JSON.stringify({
        keyframeImageUrl: "k.png",
        keyframePrompt: "p",
        keyframeGeneratedAt: 123,
        keyframeReferencedPrevKeyframe: "prev-1",
        blockout3D,
      }),
      meta: null,
      local_video_path: null,
      local_keyframe_path: null,
      local_first_frame_path: null,
      local_last_frame_path: null,
      character_variant_ids_json: null,
      scene_variant_id: null,
      owner_id: 1,
      created_at: 1,
      updated_at: 1,
    };

    const beat = parseBeatRow(row);
    const keyframe = beat.keyframe as { referencedPrevKeyframe?: string } | undefined;
    expect(keyframe?.referencedPrevKeyframe).toBe("prev-1");
    expect(beat.blockout3D).toEqual(blockout3D);
  });

  it("兼容旧数据：meta 兜底路径仍可还原（applyMetaFields 点路径）", () => {
    const row: Record<string, unknown> = {
      id: "b1",
      story_id: "s1",
      sequence: 1,
      order_num: 1,
      description: "d",
      duration: 5,
      type: "scene",
      title: "t",
      content: null,
      character_ids_json: "[]",
      scene_id: null,
      camera: "{}",
      generation: JSON.stringify({ keyframeImageUrl: "k.png" }),
      meta: JSON.stringify({
        "keyframe.referencedPrevKeyframe": "prev-old",
        blockout3D,
      }),
      local_video_path: null,
      local_keyframe_path: null,
      local_first_frame_path: null,
      local_last_frame_path: null,
      character_variant_ids_json: null,
      scene_variant_id: null,
      owner_id: 1,
      created_at: 1,
      updated_at: 1,
    };

    const beat = parseBeatRow(row);
    const keyframe = beat.keyframe as { referencedPrevKeyframe?: string } | undefined;
    expect(keyframe?.referencedPrevKeyframe).toBe("prev-old");
    expect(beat.blockout3D).toEqual(blockout3D);
  });

  it("无画布字段时：keyframe 不含空链引用，blockout3D 不还原", () => {
    const row: Record<string, unknown> = {
      id: "b1",
      story_id: "s1",
      sequence: 1,
      order_num: 1,
      description: "d",
      duration: 5,
      type: "scene",
      title: "t",
      content: null,
      character_ids_json: "[]",
      scene_id: null,
      camera: "{}",
      generation: JSON.stringify({ keyframeImageUrl: "k.png" }),
      meta: null,
      local_video_path: null,
      local_keyframe_path: null,
      local_first_frame_path: null,
      local_last_frame_path: null,
      character_variant_ids_json: null,
      scene_variant_id: null,
      owner_id: 1,
      created_at: 1,
      updated_at: 1,
    };

    const beat = parseBeatRow(row);
    const keyframe = beat.keyframe as { referencedPrevKeyframe?: string } | undefined;
    expect(keyframe?.referencedPrevKeyframe).toBeUndefined();
    expect(beat.blockout3D).toBeUndefined();
  });
});
