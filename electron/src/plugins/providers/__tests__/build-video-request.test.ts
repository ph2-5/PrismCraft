import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../logging/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../utils", () => ({
  ensureAccessibleUrl: vi.fn((url: string) => url),
  downloadAsBase64: vi.fn(() => Promise.resolve("base64data")),
  resolveLocalUrlToBase64: vi.fn(() => Promise.resolve("data:image/png;base64,localdata")),
  stripDataUriPrefix: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
  urlToPureBase64: vi.fn((s: string) => s.replace(/^data:[^;]+;base64,/, "")),
}));

import { VolcenginePlugin } from "../volcengine";
import { KuaishouPlugin } from "../kuaishou";
import { MiniMaxPlugin } from "../minimax";
import { GooglePlugin } from "../google";
import { ZhipuPlugin } from "../zhipu";
import { SeedancePlugin } from "../seedance";
import { PixversePlugin } from "../pixverse";
import { OpenAICompatiblePlugin } from "../openai-compatible";
import type { VideoBuildContext, ImageBuildContext } from "../../types";

describe("buildVideoRequest & buildImageRequest", () => {
  describe("VolcenginePlugin", () => {
    let plugin: VolcenginePlugin;

    beforeEach(() => {
      plugin = new VolcenginePlugin();
    });

    it("pro model + first+last frame → content has role:first_frame and role:last_frame, NO reference_image", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "doubao-seedance-1-0-pro-250528",
        firstFrameUrl: "https://img.example.com/first.png",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const content = result.body.content as Record<string, unknown>[];

      const firstFrame = content.find((c) => c.role === "first_frame");
      const lastFrame = content.find((c) => c.role === "last_frame");
      const refImage = content.find((c) => c.role === "reference_image");

      expect(firstFrame).toBeDefined();
      expect(lastFrame).toBeDefined();
      expect(refImage).toBeUndefined();
    });

    it("pro model + characterRef → characterRef NOT in content (bake_into_first)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "doubao-seedance-1-0-pro-250528",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const content = result.body.content as Record<string, unknown>[];

      const refImage = content.find((c) => c.role === "reference_image");
      expect(refImage).toBeUndefined();
    });

    it("lite-i2v model + characterRef → characterRef in content with role:reference_image", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "doubao-seedance-1-0-lite-i2v",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const content = result.body.content as Record<string, unknown>[];

      const refImage = content.find((c) => c.role === "reference_image");
      expect(refImage).toBeDefined();
      expect((refImage as Record<string, unknown>).type).toBe("image_url");
    });

    it("lite-i2v model + sceneRef → sceneRef in content with role:reference_image", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "doubao-seedance-1-0-lite-i2v",
        sceneRef: "https://img.example.com/scene.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const content = result.body.content as Record<string, unknown>[];

      const refImage = content.find((c) => c.role === "reference_image");
      expect(refImage).toBeDefined();
      expect((refImage as Record<string, unknown>).type).toBe("image_url");
    });

    it("lite-i2v + multiple refs → max 4 reference_image entries", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "doubao-seedance-1-0-lite-i2v",
        characterRefs: [
          "https://img.example.com/char1.png",
          "https://img.example.com/char2.png",
          "https://img.example.com/char3.png",
        ],
        sceneRef: "https://img.example.com/scene.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const content = result.body.content as Record<string, unknown>[];

      const refImages = content.filter((c) => c.role === "reference_image");
      expect(refImages).toHaveLength(4);
    });

    it("buildImageRequest with characterRef → body.ref_image is set", () => {
      const ctx: ImageBuildContext = {
        prompt: "a cat",
        size: "1920x1920",
        referenceImages: [],
        characterRef: "https://img.example.com/char.png",
      };
      const result = plugin.buildImageRequest(ctx);
      expect(result.body.ref_image).toBe("https://img.example.com/char.png");
    });

    it("buildImageRequest with sceneRef → body.ref_image is set", () => {
      const ctx: ImageBuildContext = {
        prompt: "a cat",
        size: "1920x1920",
        referenceImages: [],
        sceneRef: "https://img.example.com/scene.png",
      };
      const result = plugin.buildImageRequest(ctx);
      expect(result.body.ref_image).toBe("https://img.example.com/scene.png");
    });

    it("buildImageRequest without refs → body.ref_image is NOT set", () => {
      const ctx: ImageBuildContext = {
        prompt: "a cat",
        size: "1920x1920",
        referenceImages: [],
      };
      const result = plugin.buildImageRequest(ctx);
      expect(result.body.ref_image).toBeUndefined();
    });

    it("buildImageRequest with both characterRef and sceneRef → ref_image uses characterRef, prompt includes scene reference", () => {
      const ctx: ImageBuildContext = {
        prompt: "a cat in a forest",
        size: "1920x1920",
        referenceImages: [],
        characterRef: "https://img.example.com/char.png",
        sceneRef: "https://img.example.com/scene.png",
      };
      const result = plugin.buildImageRequest(ctx);
      expect(result.body.ref_image).toBe("https://img.example.com/char.png");
      expect(result.body.prompt).toContain("[场景参考]");
    });
  });

  describe("KuaishouPlugin", () => {
    let plugin: KuaishouPlugin;

    beforeEach(() => {
      plugin = new KuaishouPlugin();
    });

    it("kling-v1 + characterRef → NO subject_reference (V1 doesn't support it)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "kling-v1",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.subject_reference).toBeUndefined();
    });

    it("kling-v2-master + characterRef → subject_reference is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "kling-v2-master",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.subject_reference).toBe("https://img.example.com/char.png");
    });

    it("kling-v1 + lastFrameUrl → NO tail_image (V1 doesn't support it)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "kling-v1",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.tail_image).toBeUndefined();
    });

    it("kling-v2-master + lastFrameUrl → tail_image is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "kling-v2-master",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.tail_image).toBe("https://img.example.com/last.png");
    });

    it("sceneRef → prompt contains scene reference text", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "kling-v2-master",
        sceneRef: "https://img.example.com/scene.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.prompt).toContain("[场景参考]");
    });
  });

  describe("MiniMaxPlugin", () => {
    let plugin: MiniMaxPlugin;

    beforeEach(() => {
      plugin = new MiniMaxPlugin();
    });

    it("S2V-01 + characterRef → subject_image_url is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "S2V-01",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.subject_image_url).toBe("https://img.example.com/char.png");
    });

    it("Hailuo-02 + characterRef → NO subject_image_url (only S2V-01 supports it)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "MiniMax-Hailuo-02",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.subject_image_url).toBeUndefined();
    });

    it("firstFrameUrl → image_url is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "MiniMax-Hailuo-02",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBe("https://img.example.com/first.png");
    });
  });

  describe("GooglePlugin", () => {
    let plugin: GooglePlugin;

    beforeEach(() => {
      plugin = new GooglePlugin();
    });

    it("veo-3 + firstFrameUrl → body.image with gcsUri and mimeType", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "veo-3",
        firstFrameUrl: "https://storage.googleapis.com/bucket/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const image = result.body.image as Record<string, unknown>;
      expect(image).toBeDefined();
      expect(image.gcsUri).toBe("https://storage.googleapis.com/bucket/first.png");
      expect(image.mimeType).toBe("image/png");
    });

    it("veo-3 + lastFrameUrl → NO lastFrame in body (Veo doesn't support it)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "veo-3",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.lastFrame).toBeUndefined();
      expect(result.body.last_frame).toBeUndefined();
      expect(result.body.last_frame_image).toBeUndefined();
    });

    it("veo-3 + characterRef → NO characterRef in body (Veo doesn't support it)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "veo-3",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.characterRef).toBeUndefined();
      expect(result.body.character_ref).toBeUndefined();
      expect(result.body.subject_reference).toBeUndefined();
    });
  });

  describe("ZhipuPlugin", () => {
    let plugin: ZhipuPlugin;

    beforeEach(() => {
      plugin = new ZhipuPlugin();
    });

    it("cogvideox + firstFrameUrl → image_url is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "cogvideox-4",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBe("https://img.example.com/first.png");
    });

    it("cogvideox + characterRef → NO characterRef in body", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "cogvideox-4",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.characterRef).toBeUndefined();
      expect(result.body.character_ref).toBeUndefined();
      expect(result.body.subject_reference).toBeUndefined();
      expect(result.body.subject_image_url).toBeUndefined();
    });
  });

  describe("SeedancePlugin", () => {
    let plugin: SeedancePlugin;

    beforeEach(() => {
      plugin = new SeedancePlugin();
    });

    it("firstFrameUrl → first_frame_image is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "seedance-1.5-pro",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.first_frame_image).toBe("https://img.example.com/first.png");
    });

    it("lastFrameUrl → last_frame_image is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "seedance-1.5-pro",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.last_frame_image).toBe("https://img.example.com/last.png");
    });

    it("characterRef → NO ref_image in body (bake_into_first)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "seedance-1.5-pro",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.ref_image).toBeUndefined();
    });

    it("lite-i2v model + characterRef → reference_images is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "seedance-lite-i2v",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.reference_images).toEqual(["https://img.example.com/char.png"]);
      expect(result.body.last_frame_image).toBeUndefined();
    });

    it("lite-i2v model + characterRefs + sceneRef → reference_images includes all", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "seedance-lite-i2v",
        characterRefs: ["https://img.example.com/char1.png", "https://img.example.com/char2.png"],
        sceneRef: "https://img.example.com/scene.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.reference_images).toEqual([
        "https://img.example.com/char1.png",
        "https://img.example.com/char2.png",
        "https://img.example.com/scene.png",
      ]);
    });

    it("pro model + first+last frame → both frame images set, NO reference_images", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "seedance-1.5-pro",
        firstFrameUrl: "https://img.example.com/first.png",
        lastFrameUrl: "https://img.example.com/last.png",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.first_frame_image).toBe("https://img.example.com/first.png");
      expect(result.body.last_frame_image).toBe("https://img.example.com/last.png");
      expect(result.body.reference_images).toBeUndefined();
    });

    it("buildImageRequest with characterRef → body.ref_image is set", () => {
      const ctx: ImageBuildContext = {
        prompt: "a cat",
        size: "1920x1920",
        referenceImages: [],
        characterRef: "https://img.example.com/char.png",
      };
      const result = plugin.buildImageRequest(ctx);
      expect(result.body.ref_image).toBe("https://img.example.com/char.png");
    });
  });

  describe("PixversePlugin", () => {
    let plugin: PixversePlugin;

    beforeEach(() => {
      plugin = new PixversePlugin();
    });

    it("firstFrameUrl → input.image_url is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "pixverse/pixverse-v6-t2v",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const input = result.body.input as Record<string, unknown>;
      expect(input.image_url).toBe("https://img.example.com/first.png");
    });

    it("characterRef → input.ref_img is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "pixverse/pixverse-v6-t2v",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      const input = result.body.input as Record<string, unknown>;
      expect(input.ref_img).toBe("https://img.example.com/char.png");
    });
  });

  describe("OpenAICompatiblePlugin", () => {
    let plugin: OpenAICompatiblePlugin;

    beforeEach(() => {
      plugin = new OpenAICompatiblePlugin();
    });

    it("firstFrameUrl → image_url is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "video-01",
        firstFrameUrl: "https://img.example.com/first.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.image_url).toBe("https://img.example.com/first.png");
    });

    it("lastFrameUrl → last_frame_url is set", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "video-01",
        lastFrameUrl: "https://img.example.com/last.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.last_frame_url).toBe("https://img.example.com/last.png");
    });

    it("characterRef → NO ref_image in body (generic format)", () => {
      const ctx: VideoBuildContext = {
        prompt: "a cat running",
        model: "video-01",
        characterRef: "https://img.example.com/char.png",
        duration: 5,
      };
      const result = plugin.buildVideoRequest(ctx);
      expect(result.body.ref_image).toBeUndefined();
      expect(result.body.characterRef).toBeUndefined();
      expect(result.body.subject_reference).toBeUndefined();
    });
  });
});
