import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { StoryBeat, Story } from "@/domain/schemas";
import { useStoryState } from "../useStoryState";
import { useDirtyState } from "@/shared/hooks/use-dirty-state";

vi.mock("@/modules/prompt", () => ({
  useModelSelection: () => [null, vi.fn()],
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    storyStorage: {},
  },
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("useStoryState", () => {
  let uuidCounter: number;

  beforeEach(() => {
    useDirtyState.setState({ dirtyKeys: new Set() });
    uuidCounter = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => `uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`);
  });

  describe("initialization", () => {
    it("initializes stories as empty array", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.stories).toEqual([]);
    });

    it("initializes currentStory with DEFAULT_STORY", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.currentStory.id).toBe("");
      expect(result.current.currentStory.title).toBe("");
      expect(result.current.currentStory.beats).toEqual([]);
    });

    it("initializes beats as empty array", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.beats).toEqual([]);
    });

    it("initializes generationEnhanced as true", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.generationEnhanced).toBe(true);
    });

    it("initializes hasUnsavedChanges as false", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("initializes beatsRef with empty array", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.beatsRef.current).toEqual([]);
    });

    it("initializes selectedVideoModel as null", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.selectedVideoModel).toBeNull();
    });

    it("initializes selectedImageModel as null", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.selectedImageModel).toBeNull();
    });
  });

  describe("addBeat", () => {
    it("adds a new beat to empty beats array", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
    });

    it("defaults type to 'scene' when no type provided", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats[0]!.type).toBe("scene");
    });

    it("uses provided type when specified", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat("dialogue");
      });

      expect(result.current.beats[0]!.type).toBe("dialogue");
    });

    it("supports all beat types", () => {
      const types: Array<"action" | "dialogue" | "scene" | "transition" | "effect"> = [
        "action",
        "dialogue",
        "scene",
        "transition",
        "effect",
      ];
      const { result } = renderHook(() => useStoryState());

      types.forEach((type) => {
        act(() => {
          result.current.addBeat(type);
        });
      });

      expect(result.current.beats).toHaveLength(5);
      expect(result.current.beats[0]!.type).toBe("action");
      expect(result.current.beats[1]!.type).toBe("dialogue");
      expect(result.current.beats[2]!.type).toBe("scene");
      expect(result.current.beats[3]!.type).toBe("transition");
      expect(result.current.beats[4]!.type).toBe("effect");
    });

    it("increments sequence and order for each added beat", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });
      act(() => {
        result.current.addBeat();
      });
      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats).toHaveLength(3);
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
      expect(result.current.beats[1]!.sequence).toBe(2);
      expect(result.current.beats[1]!.order).toBe(2);
      expect(result.current.beats[2]!.sequence).toBe(3);
      expect(result.current.beats[2]!.order).toBe(3);
    });

    it("assigns unique id via crypto.randomUUID", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });
      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[1]!.id).toBe("uuid-2");
    });

    it("initializes new beat with default values", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      const beat = result.current.beats[0]!;
      expect(beat.description).toBe("");
      expect(beat.title).toBe("");
      expect(beat.content).toBe("");
      expect(beat.duration).toBe(5);
      expect(beat.elementIds).toEqual([]);
      expect(beat.characterIds).toEqual([]);
      expect(beat.enhancedGeneration).toBe(true);
      expect(beat.scene).toBeUndefined();
      expect(beat.sceneId).toBeUndefined();
      expect(beat.generationPrompt).toBeUndefined();
      expect(beat.imageUrl).toBeUndefined();
      expect(beat.transition).toBeUndefined();
    });

    it("captures generationEnhanced value at add time", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setGenerationEnhanced(false);
      });
      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats[0]!.enhancedGeneration).toBe(false);
    });

    it("updates beatsRef after adding", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beatsRef.current).toHaveLength(1);
      expect(result.current.beatsRef.current[0]!.id).toBe("uuid-1");
    });

    it("updates currentStory.beats after adding", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.currentStory.beats).toHaveLength(1);
    });
  });

  describe("updateBeat", () => {
    it("updates a single field on an existing beat", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      const beatId = result.current.beats[0]!.id;

      act(() => {
        result.current.updateBeat(beatId, { title: "Updated Title" });
      });

      expect(result.current.beats[0]!.title).toBe("Updated Title");
    });

    it("preserves non-updated fields", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat("dialogue");
      });

      const beatId = result.current.beats[0]!.id;

      act(() => {
        result.current.updateBeat(beatId, { title: "New Title" });
      });

      const beat = result.current.beats[0]!;
      expect(beat.title).toBe("New Title");
      expect(beat.type).toBe("dialogue");
      expect(beat.sequence).toBe(1);
      expect(beat.duration).toBe(5);
    });

    it("updates multiple fields at once", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      const beatId = result.current.beats[0]!.id;

      act(() => {
        result.current.updateBeat(beatId, {
          title: "Title",
          content: "Content",
          duration: 10,
        });
      });

      const beat = result.current.beats[0]!;
      expect(beat.title).toBe("Title");
      expect(beat.content).toBe("Content");
      expect(beat.duration).toBe(10);
    });

    it("does not affect other beats", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.updateBeat("uuid-1", { title: "Only First" });
      });

      expect(result.current.beats[0]!.title).toBe("Only First");
      expect(result.current.beats[1]!.title).toBe("");
    });

    it("is no-op for non-existent beat id", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      [...result.current.beats];

      act(() => {
        result.current.updateBeat("non-existent-id", { title: "Nope" });
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.title).toBe("");
    });
  });

  describe("deleteBeat", () => {
    it("removes the specified beat", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-2");
      });

      expect(result.current.beats).toHaveLength(2);
      expect(result.current.beats.find((b) => b.id === "uuid-2")).toBeUndefined();
    });

    it("re-sequences remaining beats after deletion", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-2");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
      expect(result.current.beats[1]!.id).toBe("uuid-3");
      expect(result.current.beats[1]!.sequence).toBe(2);
      expect(result.current.beats[1]!.order).toBe(2);
    });

    it("deleting first beat re-sequences correctly", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-1");
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.id).toBe("uuid-2");
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
    });

    it("deleting last beat leaves others unchanged", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-2");
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
    });

    it("deleting only beat results in empty array", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-1");
      });

      expect(result.current.beats).toEqual([]);
    });

    it("deleting non-existent beat is no-op", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("non-existent");
      });

      expect(result.current.beats).toHaveLength(1);
    });
  });

  describe("moveBeat", () => {
    it("moves a beat up by swapping with previous", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-2", "up");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-2");
      expect(result.current.beats[1]!.id).toBe("uuid-1");
      expect(result.current.beats[2]!.id).toBe("uuid-3");
    });

    it("moves a beat down by swapping with next", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-2", "down");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[1]!.id).toBe("uuid-3");
      expect(result.current.beats[2]!.id).toBe("uuid-2");
    });

    it("re-sequences order and sequence after move", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-1", "down");
      });

      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
      expect(result.current.beats[1]!.sequence).toBe(2);
      expect(result.current.beats[1]!.order).toBe(2);
      expect(result.current.beats[2]!.sequence).toBe(3);
      expect(result.current.beats[2]!.order).toBe(3);
    });

    it("moving first beat up is no-op", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-1", "up");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[1]!.id).toBe("uuid-2");
    });

    it("moving last beat down is no-op", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-2", "down");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[1]!.id).toBe("uuid-2");
    });

    it("moving non-existent beat is no-op", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("non-existent", "up");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[1]!.id).toBe("uuid-2");
    });

    it("can move beat multiple times", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-1", "down");
      });
      act(() => {
        result.current.moveBeat("uuid-1", "down");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-2");
      expect(result.current.beats[1]!.id).toBe("uuid-3");
      expect(result.current.beats[2]!.id).toBe("uuid-1");
    });
  });

  describe("dirty state tracking", () => {
    it("starts with hasUnsavedChanges as false", () => {
      const { result } = renderHook(() => useStoryState());
      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("setCurrentStory marks dirty by default", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStory({ ...result.current.currentStory, title: "New" });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("setCurrentStory with skipDirty does not mark dirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStory(
          { ...result.current.currentStory, title: "New" },
          true,
        );
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("addBeat marks dirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("updateBeat marks dirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      useDirtyState.setState({ dirtyKeys: new Set() });

      act(() => {
        result.current.updateBeat("uuid-1", { title: "Changed" });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("deleteBeat marks dirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      useDirtyState.setState({ dirtyKeys: new Set() });

      act(() => {
        result.current.deleteBeat("uuid-1");
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("moveBeat marks dirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      useDirtyState.setState({ dirtyKeys: new Set() });

      act(() => {
        result.current.moveBeat("uuid-1", "down");
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("markClean clears hasUnsavedChanges", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.hasUnsavedChanges).toBe(true);

      act(() => {
        result.current.markClean("story");
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("setBeats marks dirty by default", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setBeats([{ id: "b1", sequence: 1, order: 1, type: "scene", title: "", content: "", description: "", duration: 5, elementIds: [], characterIds: [], enhancedGeneration: true }] as unknown as StoryBeat[]);
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("setBeats with skipDirty does not mark dirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setBeats([{ id: "b1", sequence: 1, order: 1, type: "scene", title: "", content: "", description: "", duration: 5, characters: [], elementIds: [], characterIds: [], enhancedGeneration: true }] as unknown as StoryBeat[], true);
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe("setCurrentStory", () => {
    it("accepts direct value", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStory({
          ...result.current.currentStory,
          title: "Direct",
        });
      });

      expect(result.current.currentStory.title).toBe("Direct");
    });

    it("accepts updater function", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStory((prev) => ({
          ...prev,
          title: "Updated via fn",
        }));
      });

      expect(result.current.currentStory.title).toBe("Updated via fn");
    });

    it("setCurrentStoryRaw bypasses dirty tracking", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStoryRaw({
          ...result.current.currentStory,
          title: "Raw",
        });
      });

      expect(result.current.currentStory.title).toBe("Raw");
      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe("setStories", () => {
    it("updates stories array", () => {
      const { result } = renderHook(() => useStoryState());

      const mockStories = [
        { id: "s1", title: "Story 1", beats: [] },
        { id: "s2", title: "Story 2", beats: [] },
      ];

      act(() => {
        result.current.setStories(mockStories as unknown as Story[]);
      });

      expect(result.current.stories).toHaveLength(2);
      expect(result.current.stories[0]!.id).toBe("s1");
    });
  });

  describe("setBeats", () => {
    it("directly sets beats array", () => {
      const { result } = renderHook(() => useStoryState());

      const mockBeats = [
        {
          id: "b1",
          sequence: 1,
          order: 1,
          description: "",
          duration: 5,
          type: "scene" as const,
          title: "Beat 1",
          content: "",
          elementIds: [],
          characterIds: [],
          enhancedGeneration: true,
        },
      ];

      act(() => {
        result.current.setBeats(mockBeats);
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.id).toBe("b1");
    });

    it("setBeats marks dirty by default", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      useDirtyState.setState({ dirtyKeys: new Set() });

      act(() => {
        result.current.setBeats([]);
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });
  });

  describe("generationEnhanced", () => {
    it("can be toggled to false", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setGenerationEnhanced(false);
      });

      expect(result.current.generationEnhanced).toBe(false);
    });

    it("can be toggled back to true", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setGenerationEnhanced(false);
      });
      act(() => {
        result.current.setGenerationEnhanced(true);
      });

      expect(result.current.generationEnhanced).toBe(true);
    });

    it("affects newly added beats", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setGenerationEnhanced(false);
      });
      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats[0]!.enhancedGeneration).toBe(false);

      act(() => {
        result.current.setGenerationEnhanced(true);
      });
      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats[1]!.enhancedGeneration).toBe(true);
    });
  });

  describe("currentStory.beats sync", () => {
    it("currentStory.beats stays in sync with beats", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.currentStory.beats).toHaveLength(1);
      expect(result.current.currentStory.beats[0]!.id).toBe("uuid-1");
    });

    it("currentStory.beats reflects deletions", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-1");
      });

      expect(result.current.currentStory.beats).toHaveLength(1);
      expect(result.current.currentStory.beats[0]!.id).toBe("uuid-2");
    });

    it("currentStory.beats reflects updates", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      act(() => {
        result.current.updateBeat("uuid-1", { title: "Synced" });
      });

      expect(result.current.currentStory.beats[0]!.title).toBe("Synced");
    });
  });

  describe("beatsRef", () => {
    it("stays in sync with beats state", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      expect(result.current.beatsRef.current).toEqual(result.current.beats);
    });

    it("reflects deletions", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-1");
      });

      expect(result.current.beatsRef.current).toHaveLength(1);
      expect(result.current.beatsRef.current[0]!.id).toBe("uuid-2");
    });
  });

  describe("moveBeat 边界条件", () => {
    it("向上移动第一个 beat 应不变化", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      const beforeIds = result.current.beats.map((b) => b.id);

      act(() => {
        result.current.moveBeat("uuid-1", "up");
      });

      expect(result.current.beats.map((b) => b.id)).toEqual(beforeIds);
    });

    it("向下移动最后一个 beat 应不变化", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      const beforeIds = result.current.beats.map((b) => b.id);

      act(() => {
        result.current.moveBeat("uuid-3", "down");
      });

      expect(result.current.beats.map((b) => b.id)).toEqual(beforeIds);
    });

    it("只有一个 beat 时向上移动应不变化", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-1", "up");
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.id).toBe("uuid-1");
    });

    it("只有一个 beat 时向下移动应不变化", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-1", "down");
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.id).toBe("uuid-1");
    });

    it("向上移动中间 beat 应与上一个交换", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-2", "up");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-2");
      expect(result.current.beats[1]!.id).toBe("uuid-1");
      expect(result.current.beats[2]!.id).toBe("uuid-3");
    });

    it("向下移动中间 beat 应与下一个交换", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-2", "down");
      });

      expect(result.current.beats[0]!.id).toBe("uuid-1");
      expect(result.current.beats[1]!.id).toBe("uuid-3");
      expect(result.current.beats[2]!.id).toBe("uuid-2");
    });

    it("移动后 sequence 和 order 应正确重排", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.moveBeat("uuid-1", "down");
      });

      result.current.beats.forEach((b, i) => {
        expect(b.sequence).toBe(i + 1);
        expect(b.order).toBe(i + 1);
      });
    });

    it("不存在的 beatId 应不变化", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      const beforeIds = result.current.beats.map((b) => b.id);

      act(() => {
        result.current.moveBeat("non-existent-id", "up");
      });

      expect(result.current.beats.map((b) => b.id)).toEqual(beforeIds);
    });
  });

  describe("skipDirty 路径", () => {
    it("setCurrentStory 默认应调用 markDirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStory({ ...result.current.currentStory, title: "New" });
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("setCurrentStory skipDirty=true 时不应调用 markDirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setCurrentStory(
          { ...result.current.currentStory, title: "New" },
          true,
        );
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });

    it("setBeats 默认应调用 markDirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setBeats([]);
      });

      expect(result.current.hasUnsavedChanges).toBe(true);
    });

    it("setBeats skipDirty=true 时不应调用 markDirty", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.setBeats([], true);
      });

      expect(result.current.hasUnsavedChanges).toBe(false);
    });
  });

  describe("addBeat 位置", () => {
    it("不指定参数应添加到末尾", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      expect(result.current.beats).toHaveLength(2);
      expect(result.current.beats[1]!.id).toBe("uuid-2");
    });

    it("指定 type 参数应添加到末尾并设置类型", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat("scene");
        result.current.addBeat("dialogue");
      });

      expect(result.current.beats).toHaveLength(2);
      expect(result.current.beats[0]!.type).toBe("scene");
      expect(result.current.beats[1]!.type).toBe("dialogue");
      expect(result.current.beats[1]!.id).toBe("uuid-2");
    });

    it("空数组添加应成为唯一 beat", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
      });

      expect(result.current.beats).toHaveLength(1);
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
    });

    it("多次添加应依次追加到末尾", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      expect(result.current.beats.map((b) => b.id)).toEqual(["uuid-1", "uuid-2", "uuid-3"]);
    });
  });

  describe("deleteBeat 重排", () => {
    it("删除中间 beat 后 sequence 应连续", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-2");
      });

      expect(result.current.beats).toHaveLength(3);
      expect(result.current.beats.map((b) => b.sequence)).toEqual([1, 2, 3]);
      expect(result.current.beats.map((b) => b.order)).toEqual([1, 2, 3]);
    });

    it("删除第一个 beat 后 sequence 应从 1 开始", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
        result.current.addBeat();
      });

      act(() => {
        result.current.deleteBeat("uuid-1");
      });

      expect(result.current.beats).toHaveLength(2);
      expect(result.current.beats[0]!.sequence).toBe(1);
      expect(result.current.beats[0]!.order).toBe(1);
      expect(result.current.beats[1]!.sequence).toBe(2);
      expect(result.current.beats[1]!.order).toBe(2);
    });

    it("删除不存在的 beatId 应不变化", () => {
      const { result } = renderHook(() => useStoryState());

      act(() => {
        result.current.addBeat();
        result.current.addBeat();
      });

      const beforeIds = result.current.beats.map((b) => b.id);

      act(() => {
        result.current.deleteBeat("non-existent-id");
      });

      expect(result.current.beats.map((b) => b.id)).toEqual(beforeIds);
      expect(result.current.beats).toHaveLength(2);
    });
  });
});
