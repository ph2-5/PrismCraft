import { describe, it, expect } from "vitest";
import {
  mediaAssetSchema,
  videoTemplateSchema,
  collectionSchema,
  batchTaskSchema,
  searchResultSchema,
  asaExportDataSchema,
  apiConfigSchema,
  apiErrorCodeSchema,
  apiResponseSchema,
  imageGenerationResultSchema,
  videoGenerationResultSchema,
  videoTaskStatusSchema,
  videoTaskSchema,
  healthStatusSchema,
  userApiConfigSchema,
  characterOutfitSchema,
  characterAppearanceSchema,
  characterSchema,
  createCharacterInputSchema,
  updateCharacterInputSchema,
  sceneCameraSchema,
  sceneSchema,
  sceneElementTypeSchema,
  sceneElementSchema,
  createSceneInputSchema,
  updateSceneInputSchema,
  chainModeSchema,
  beatInputSchema,
  frameInputSchema,
  videoInputSchema,
  referenceImageWeightSchema,
  promptLabSchema,
  storyBeatKeyframeSchema,
  storyBeatFramePairSchema,
  storyBeatVideoSchema,
  elementBindingSchema,
  beatCameraSchema,
  storyBeatSchema,
  storySchema,
  createStoryInputSchema,
  updateStoryInputSchema,
  shotInstructionSchema,
  featureAnchorItemSchema,
  featureAnchoringSchema,
  consistencyCheckResultSchema,
  shotReferenceSchema,
  shotGenerationStatusSchema,
  shotGenerationResultSchema,
  fixedImageSchema,
  referenceVideoSchema,
  templateConfigSchema,
  elementTypeSchema,
  assetTypeSchema,
  assetBindingSchema,
  referenceImageQualitySchema,
  elementFeatureAnchorSchema,
  storyElementSchema,
  elementLibrarySchema,
} from "@/domain/schemas";

describe("media schemas", () => {
  const validMediaAsset = {
    id: "asset-1",
    name: "Test Asset",
    type: "image" as const,
    url: "https://example.com/image.png",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };

  describe("mediaAssetSchema", () => {
    it("should parse valid data successfully", () => {
      const result = mediaAssetSchema.parse(validMediaAsset);
      expect(result.id).toBe("asset-1");
      expect(result.name).toBe("Test Asset");
      expect(result.type).toBe("image");
    });

    it("should apply default values", () => {
      const result = mediaAssetSchema.parse(validMediaAsset);
      expect(result.description).toBe("");
      expect(result.tags).toEqual([]);
    });

    it("should handle optional fields", () => {
      const result = mediaAssetSchema.parse({
        ...validMediaAsset,
        thumbnailUrl: "https://example.com/thumb.png",
        fileSize: 1024,
        mimeType: "image/png",
        width: 1920,
        height: 1080,
        duration: 30,
        boundTo: { type: "character", id: "char-1", name: "Hero" },
      });
      expect(result.thumbnailUrl).toBe("https://example.com/thumb.png");
      expect(result.fileSize).toBe(1024);
      expect(result.boundTo?.type).toBe("character");
    });

    it("should fail when required fields are missing", () => {
      expect(() => mediaAssetSchema.parse({})).toThrow();
      expect(() => mediaAssetSchema.parse({ id: "1", name: "Test" })).toThrow();
      expect(() =>
        mediaAssetSchema.parse({ ...validMediaAsset, type: undefined })
      ).toThrow();
    });

    it("should reject invalid enum values for type", () => {
      expect(() =>
        mediaAssetSchema.parse({ ...validMediaAsset, type: "audio" })
      ).toThrow();
    });

    it("should reject invalid enum values for boundTo.type", () => {
      expect(() =>
        mediaAssetSchema.parse({
          ...validMediaAsset,
          boundTo: { type: "weapon", id: "1", name: "Sword" },
        })
      ).toThrow();
    });
  });

  describe("videoTemplateSchema", () => {
    const validTemplate = {
      id: "tpl-1",
      name: "Action Template",
      description: "Fast-paced action",
      category: "action",
      totalDuration: 60,
      shots: [
        {
          id: "shot-1",
          sequence: 1,
          description: "Opening shot",
          duration: 10,
          cameraAngle: "wide",
          cameraMovement: "pan",
        },
      ],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("should parse valid data successfully", () => {
      const result = videoTemplateSchema.parse(validTemplate);
      expect(result.id).toBe("tpl-1");
      expect(result.shots).toHaveLength(1);
    });

    it("should apply default values for tags", () => {
      const result = videoTemplateSchema.parse(validTemplate);
      expect(result.tags).toEqual([]);
    });

    it("should handle optional fields", () => {
      const result = videoTemplateSchema.parse({
        ...validTemplate,
        thumbnailUrl: "https://example.com/thumb.png",
        tags: ["action", "fast"],
      });
      expect(result.thumbnailUrl).toBe("https://example.com/thumb.png");
      expect(result.tags).toEqual(["action", "fast"]);
    });

    it("should fail when required fields are missing", () => {
      expect(() =>
        videoTemplateSchema.parse({ ...validTemplate, shots: undefined })
      ).toThrow();
      expect(() =>
        videoTemplateSchema.parse({ ...validTemplate, totalDuration: undefined })
      ).toThrow();
    });

    it("should handle optional transition in shots", () => {
      const result = videoTemplateSchema.parse({
        ...validTemplate,
        shots: [
          { ...validTemplate.shots[0], transition: "fade" },
        ],
      });
      expect(result.shots[0]!.transition).toBe("fade");
    });
  });

  describe("collectionSchema", () => {
    const validCollection = {
      id: "col-1",
      name: "My Collection",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("should parse valid data successfully", () => {
      const result = collectionSchema.parse(validCollection);
      expect(result.id).toBe("col-1");
      expect(result.name).toBe("My Collection");
    });

    it("should fail when required fields are missing", () => {
      expect(() => collectionSchema.parse({})).toThrow();
      expect(() =>
        collectionSchema.parse({ id: "1", name: "Test" })
      ).toThrow();
    });
  });

  describe("batchTaskSchema", () => {
    const validBatchTask = {
      id: "task-1",
      itemId: "item-1",
      itemName: "Generate Image",
      status: "pending" as const,
      progress: 0,
    };

    it("should parse valid data successfully", () => {
      const result = batchTaskSchema.parse(validBatchTask);
      expect(result.id).toBe("task-1");
      expect(result.status).toBe("pending");
    });

    it("should handle optional fields", () => {
      const result = batchTaskSchema.parse({
        ...validBatchTask,
        error: "Something went wrong",
        result: { imageUrl: "https://example.com/img.png", source: "ai", prompt: "test" },
      });
      expect(result.error).toBe("Something went wrong");
      expect(result.result?.imageUrl).toBe("https://example.com/img.png");
    });

    it("should fail when required fields are missing", () => {
      expect(() => batchTaskSchema.parse({})).toThrow();
      expect(() =>
        batchTaskSchema.parse({ id: "1", itemId: "1" })
      ).toThrow();
    });

    it("should reject invalid enum values for status", () => {
      expect(() =>
        batchTaskSchema.parse({ ...validBatchTask, status: "running" })
      ).toThrow();
    });

    it("should reject progress outside 0-100 range", () => {
      expect(() =>
        batchTaskSchema.parse({ ...validBatchTask, progress: -1 })
      ).toThrow();
      expect(() =>
        batchTaskSchema.parse({ ...validBatchTask, progress: 101 })
      ).toThrow();
    });

    it("should accept progress at boundaries", () => {
      expect(batchTaskSchema.parse({ ...validBatchTask, progress: 0 }).progress).toBe(0);
      expect(batchTaskSchema.parse({ ...validBatchTask, progress: 100 }).progress).toBe(100);
    });
  });

  describe("searchResultSchema", () => {
    const validSearchResult = {
      type: "character" as const,
      id: "res-1",
      title: "Hero Character",
    };

    it("should parse valid data successfully", () => {
      const result = searchResultSchema.parse(validSearchResult);
      expect(result.type).toBe("character");
      expect(result.id).toBe("res-1");
    });

    it("should handle optional subtitle", () => {
      const result = searchResultSchema.parse({
        ...validSearchResult,
        subtitle: "Main protagonist",
      });
      expect(result.subtitle).toBe("Main protagonist");
    });

    it("should fail when required fields are missing", () => {
      expect(() => searchResultSchema.parse({})).toThrow();
      expect(() =>
        searchResultSchema.parse({ type: "character", id: "1" })
      ).toThrow();
    });

    it("should reject invalid enum values for type", () => {
      expect(() =>
        searchResultSchema.parse({ ...validSearchResult, type: "weapon" })
      ).toThrow();
    });
  });

  describe("asaExportDataSchema", () => {
    const validAsaExport = {
      format: "asa" as const,
      version: "1.0" as const,
      createdAt: "2024-01-01T00:00:00Z",
    };

    it("should parse valid data successfully", () => {
      const result = asaExportDataSchema.parse(validAsaExport);
      expect(result.format).toBe("asa");
      expect(result.version).toBe("1.0");
    });

    it("should handle optional fields", () => {
      const result = asaExportDataSchema.parse({
        ...validAsaExport,
        collections: [
          {
            id: "col-1",
            name: "My Collection",
            assetIds: [
              { assetType: "character", assetId: "char-1" },
            ],
          },
        ],
        characters: [{ id: "char-1" }],
        scenes: [{ id: "scene-1" }],
        storyboards: [{ id: "sb-1" }],
      });
      expect(result.collections).toHaveLength(1);
      expect(result.characters).toHaveLength(1);
    });

    it("should fail when format is not literal 'asa'", () => {
      expect(() =>
        asaExportDataSchema.parse({ ...validAsaExport, format: "json" })
      ).toThrow();
    });

    it("should fail when version is not literal '1.0'", () => {
      expect(() =>
        asaExportDataSchema.parse({ ...validAsaExport, version: "2.0" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => asaExportDataSchema.parse({})).toThrow();
    });

    it("should reject invalid assetType in collections", () => {
      expect(() =>
        asaExportDataSchema.parse({
          ...validAsaExport,
          collections: [
            {
              id: "col-1",
              name: "Col",
              assetIds: [{ assetType: "weapon", assetId: "1" }],
            },
          ],
        })
      ).toThrow();
    });
  });
});

describe("api schemas", () => {
  describe("apiConfigSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = apiConfigSchema.parse({});
      expect(result.apiUrl).toBeUndefined();
      expect(result.apiKey).toBeUndefined();
    });

    it("should parse valid data with all fields", () => {
      const result = apiConfigSchema.parse({
        apiUrl: "https://api.example.com",
        apiKey: "sk-123",
        model: "gpt-4",
        size: "1024x1024",
      });
      expect(result.apiUrl).toBe("https://api.example.com");
      expect(result.model).toBe("gpt-4");
    });
  });

  describe("apiErrorCodeSchema", () => {
    it("should accept valid error codes", () => {
      const codes = [
        "INVALID_API_KEY",
        "RATE_LIMITED",
        "ENDPOINT_NOT_FOUND",
        "API_SERVER_ERROR",
        "TIMEOUT",
        "CONNECTION_FAILED",
        "INVALID_RESPONSE",
        "POLLINATIONS_FAILED",
        "INTERNAL_ERROR",
        "UNKNOWN_ERROR",
      ];
      for (const code of codes) {
        expect(apiErrorCodeSchema.parse(code)).toBe(code);
      }
    });

    it("should reject invalid error codes", () => {
      expect(() => apiErrorCodeSchema.parse("NOT_A_CODE")).toThrow();
    });
  });

  describe("apiResponseSchema", () => {
    it("should parse success response", () => {
      const result = apiResponseSchema.parse({
        success: true,
        data: { items: [] },
      });
      expect(result.success).toBe(true);
    });

    it("should parse success response with optional fields", () => {
      const result = apiResponseSchema.parse({
        success: true,
        data: null,
        source: "cache",
        error: "warning",
        message: "from cache",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.source).toBe("cache");
      }
    });

    it("should parse failure response", () => {
      const result = apiResponseSchema.parse({
        success: false,
        error: "Something failed",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Something failed");
      }
    });

    it("should reject response without success field", () => {
      expect(() => apiResponseSchema.parse({ data: {} })).toThrow();
    });

    it("should reject success response without data", () => {
      expect(() =>
        apiResponseSchema.parse({ success: true })
      ).toThrow();
    });

    it("should reject failure response without error", () => {
      expect(() =>
        apiResponseSchema.parse({ success: false })
      ).toThrow();
    });
  });

  describe("imageGenerationResultSchema", () => {
    it("should parse valid data with required fields", () => {
      const result = imageGenerationResultSchema.parse({
        imageUrl: "https://example.com/img.png",
      });
      expect(result.imageUrl).toBe("https://example.com/img.png");
    });

    it("should handle optional fields", () => {
      const result = imageGenerationResultSchema.parse({
        imageUrl: "https://example.com/img.png",
        source: "pollinations",
        prompt: "a sunset",
      });
      expect(result.source).toBe("pollinations");
      expect(result.prompt).toBe("a sunset");
    });

    it("should fail when imageUrl is missing", () => {
      expect(() => imageGenerationResultSchema.parse({})).toThrow();
    });
  });

  describe("videoGenerationResultSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = videoGenerationResultSchema.parse({});
      expect(result.videoUrl).toBeUndefined();
    });

    it("should parse valid data with all fields", () => {
      const result = videoGenerationResultSchema.parse({
        videoUrl: "https://example.com/video.mp4",
        taskId: "task-1",
        status: "completed",
        promptWasTruncated: true,
        originalPromptLength: 500,
        providerId: "provider-1",
        providerModelId: "model-v1",
        providerFormat: "mp4",
      });
      expect(result.videoUrl).toBe("https://example.com/video.mp4");
      expect(result.promptWasTruncated).toBe(true);
    });
  });

  describe("videoTaskStatusSchema", () => {
    it("should accept valid statuses", () => {
      const statuses = ["pending", "generating", "completed", "failed", "cancelled"];
      for (const s of statuses) {
        expect(videoTaskStatusSchema.parse(s)).toBe(s);
      }
    });

    it("should reject invalid statuses", () => {
      expect(() => videoTaskStatusSchema.parse("running")).toThrow();
    });
  });

  describe("videoTaskSchema", () => {
    const validVideoTask = {
      taskId: "task-1",
      status: "pending" as const,
      progress: 0,
      createdAt: "2024-01-01T00:00:00Z",
    };

    it("should parse valid data successfully", () => {
      const result = videoTaskSchema.parse(validVideoTask);
      expect(result.taskId).toBe("task-1");
      expect(result.status).toBe("pending");
    });

    it("should apply default value for message", () => {
      const result = videoTaskSchema.parse(validVideoTask);
      expect(result.message).toBe("");
    });

    it("should handle optional fields", () => {
      const result = videoTaskSchema.parse({
        ...validVideoTask,
        videoUrl: "https://example.com/video.mp4",
        updatedAt: "2024-01-01T00:01:00Z",
        model: "model-v1",
        prompt: "A sunset scene",
        parameters: { fps: 30 },
        apiUrl: "https://api.example.com",
        apiEndpoint: "/v1/generate",
        providerId: "provider-1",
        providerModelId: "model-v1",
        providerFormat: "mp4",
        fixedImageUrl: "https://example.com/fix.png",
        fixedImageLockType: "character",
        referenceVideoUrl: "https://example.com/ref.mp4",
        referenceVideoMimicryLevel: "medium",
        templateId: "tpl-1",
        templateShots: "3",
        beatId: "beat-1",
        storyId: "story-1",
        storyTitle: "My Story",
        beatTitle: "Opening",
        cacheFailed: false,
        promptWasTruncated: false,
        pollFailureCount: 0,
        pollCount: 5,
        recoveryAttempts: 1,
        lastPolledAt: "2024-01-01T00:02:00Z",
        vectorClock: "vc-1",
        syncStatus: "synced",
      });
      expect(result.videoUrl).toBe("https://example.com/video.mp4");
      expect(result.fixedImageLockType).toBe("character");
      expect(result.referenceVideoMimicryLevel).toBe("medium");
      expect(result.syncStatus).toBe("synced");
    });

    it("should fail when required fields are missing", () => {
      expect(() => videoTaskSchema.parse({})).toThrow();
      expect(() =>
        videoTaskSchema.parse({ taskId: "1" })
      ).toThrow();
    });

    it("should reject invalid enum values", () => {
      expect(() =>
        videoTaskSchema.parse({ ...validVideoTask, status: "running" })
      ).toThrow();
      expect(() =>
        videoTaskSchema.parse({
          ...validVideoTask,
          fixedImageLockType: "weapon",
        })
      ).toThrow();
      expect(() =>
        videoTaskSchema.parse({
          ...validVideoTask,
          syncStatus: "unknown",
        })
      ).toThrow();
    });

    it("should reject progress outside 0-100 range", () => {
      expect(() =>
        videoTaskSchema.parse({ ...validVideoTask, progress: -1 })
      ).toThrow();
      expect(() =>
        videoTaskSchema.parse({ ...validVideoTask, progress: 101 })
      ).toThrow();
    });

    it("should reject negative pollFailureCount", () => {
      expect(() =>
        videoTaskSchema.parse({ ...validVideoTask, pollFailureCount: -1 })
      ).toThrow();
    });
  });

  describe("healthStatusSchema", () => {
    const validHealthStatus = {
      text: { configured: true, provider: "openai", available: true },
      image: { configured: true, provider: "pollinations", available: true },
      video: { configured: false, provider: "none", available: false },
      vision: { configured: false, provider: "none", available: false },
    };

    it("should parse valid data successfully", () => {
      const result = healthStatusSchema.parse(validHealthStatus);
      expect(result.text.configured).toBe(true);
      expect(result.video.available).toBe(false);
    });

    it("should fail when nested required fields are missing", () => {
      expect(() =>
        healthStatusSchema.parse({ text: {}, image: {}, video: {}, vision: {} })
      ).toThrow();
    });

    it("should fail when top-level keys are missing", () => {
      expect(() =>
        healthStatusSchema.parse({ text: validHealthStatus.text })
      ).toThrow();
    });
  });

  describe("userApiConfigSchema", () => {
    const validConfig = {
      imageApiUrl: "https://api.example.com/image",
      imageApiKey: "sk-img",
      imageModel: "dall-e",
      videoApiUrl: "https://api.example.com/video",
      videoApiKey: "sk-vid",
      videoModel: "model-v1",
      textApiUrl: "https://api.example.com/text",
      textApiKey: "sk-txt",
      textModel: "gpt-4",
      visionApiUrl: "https://api.example.com/vision",
      visionApiKey: "sk-vis",
      visionModel: "gpt-4-vision",
      useCustomImageApi: true,
      useCustomVideoApi: false,
      useCustomVisionApi: false,
    };

    it("should parse valid data successfully", () => {
      const result = userApiConfigSchema.parse(validConfig);
      expect(result.imageApiUrl).toBe("https://api.example.com/image");
      expect(result.useCustomImageApi).toBe(true);
    });

    it("should fail when required fields are missing", () => {
      expect(() => userApiConfigSchema.parse({})).toThrow();
      expect(() =>
        userApiConfigSchema.parse({ imageApiUrl: "https://example.com" })
      ).toThrow();
    });
  });
});

describe("character schemas", () => {
  describe("characterOutfitSchema", () => {
    const validOutfit = {
      id: "outfit-1",
      name: "Casual",
      description: "Everyday wear",
      clothing: "T-shirt and jeans",
    };

    it("should parse valid data successfully", () => {
      const result = characterOutfitSchema.parse(validOutfit);
      expect(result.id).toBe("outfit-1");
      expect(result.name).toBe("Casual");
    });

    it("should apply default values", () => {
      const result = characterOutfitSchema.parse(validOutfit);
      expect(result.accessories).toEqual([]);
      expect(result.isDefault).toBe(false);
      expect(result.description).toBe("Everyday wear");
    });

    it("should handle optional fields", () => {
      const result = characterOutfitSchema.parse({
        ...validOutfit,
        imageUrl: "https://example.com/outfit.png",
        localImagePath: "/path/to/outfit.png",
        thumbnailPath: "/path/to/thumb.png",
      });
      expect(result.imageUrl).toBe("https://example.com/outfit.png");
      expect(result.localImagePath).toBe("/path/to/outfit.png");
    });

    it("should fail when name is empty", () => {
      expect(() =>
        characterOutfitSchema.parse({ ...validOutfit, name: "" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => characterOutfitSchema.parse({})).toThrow();
    });
  });

  describe("characterAppearanceSchema", () => {
    it("should apply all default values for empty object", () => {
      const result = characterAppearanceSchema.parse({});
      expect(result.hairColor).toBe("");
      expect(result.hairStyle).toBe("");
      expect(result.eyeColor).toBe("");
      expect(result.height).toBe("");
      expect(result.build).toBe("");
      expect(result.clothing).toBe("");
    });

    it("should parse valid data with all fields", () => {
      const result = characterAppearanceSchema.parse({
        hairColor: "black",
        hairStyle: "short",
        eyeColor: "brown",
        height: "180cm",
        build: "athletic",
        clothing: "armor",
      });
      expect(result.hairColor).toBe("black");
      expect(result.build).toBe("athletic");
    });
  });

  describe("characterSchema", () => {
    const validCharacter = {
      id: "char-1",
      name: "Hero",
      description: "The main character",
      gender: "male",
      style: "realistic",
      personality: ["brave", "kind"],
      appearance: {},
      prompt: "A brave hero",
    };

    it("should parse valid data with required fields", () => {
      const result = characterSchema.parse(validCharacter);
      expect(result.id).toBe("char-1");
      expect(result.name).toBe("Hero");
    });

    it("should fail when name is empty", () => {
      expect(() =>
        characterSchema.parse({ ...validCharacter, name: "" })
      ).toThrow();
    });

    it("should handle optional fields", () => {
      const result = characterSchema.parse({
        ...validCharacter,
        age: 25,
        outfits: [
          { id: "o1", name: "Casual", description: "desc", clothing: "shirt" },
        ],
        imageGenerationPrompt: "hero portrait",
        generatedImage: "https://example.com/hero.png",
        refImagePath: "/path/to/ref.png",
        generatedVideo: "https://example.com/hero.mp4",
        videoGenerationStatus: "completed",
        videoGenerationTaskId: "task-1",
        updatedAt: "2024-01-01T00:00:00Z",
        traits: ["leader"],
        avatarPath: "/path/to/avatar.png",
        thumbnailPath: "/path/to/thumb.png",
        previewPath: "/path/to/preview.png",
        source: "ai",
        tags: ["protagonist"],
        generationPrompt: "generate hero",
        generationParams: { style: "realistic" },
        useCount: 5,
        lastUsedAt: "2024-01-01T00:00:00Z",
        createdAt: "2024-01-01T00:00:00Z",
      });
      expect(result.age).toBe(25);
      expect(result.outfits).toHaveLength(1);
      expect(result.videoGenerationStatus).toBe("completed");
      expect(result.useCount).toBe(5);
    });

    it("should reject invalid enum for videoGenerationStatus", () => {
      expect(() =>
        characterSchema.parse({
          ...validCharacter,
          videoGenerationStatus: "running",
        })
      ).toThrow();
    });

    it("should reject negative age", () => {
      expect(() =>
        characterSchema.parse({ ...validCharacter, age: -1 })
      ).toThrow();
    });

    it("should reject negative useCount", () => {
      expect(() =>
        characterSchema.parse({ ...validCharacter, useCount: -1 })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => characterSchema.parse({})).toThrow();
    });
  });

  describe("createCharacterInputSchema", () => {
    const validInput = {
      name: "Hero",
      description: "Main character",
      gender: "male",
      style: "realistic",
      personality: ["brave"],
      appearance: {},
      prompt: "A hero",
    };

    it("should parse valid input", () => {
      const result = createCharacterInputSchema.parse(validInput);
      expect(result.name).toBe("Hero");
    });

    it("should not include id (picked fields only)", () => {
      const result = createCharacterInputSchema.parse(validInput);
      expect("id" in result).toBe(false);
    });

    it("should fail when required picked fields are missing", () => {
      expect(() =>
        createCharacterInputSchema.parse({ name: "Hero" })
      ).toThrow();
    });
  });

  describe("updateCharacterInputSchema", () => {
    it("should parse with only id (partial + required id)", () => {
      const result = updateCharacterInputSchema.parse({ id: "char-1" });
      expect(result.id).toBe("char-1");
    });

    it("should fail when id is missing", () => {
      expect(() => updateCharacterInputSchema.parse({ name: "Updated" })).toThrow();
    });

    it("should parse with id and some optional fields", () => {
      const result = updateCharacterInputSchema.parse({
        id: "char-1",
        name: "Updated Hero",
        description: "Updated description",
      });
      expect(result.name).toBe("Updated Hero");
    });
  });
});

describe("scene schemas", () => {
  describe("sceneCameraSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = sceneCameraSchema.parse({});
      expect(result.position).toBeUndefined();
    });

    it("should parse valid data with all fields", () => {
      const result = sceneCameraSchema.parse({
        position: "center",
        angle: "low",
        zoom: 1.5,
        distance: "far",
        movement: "tracking",
      });
      expect(result.angle).toBe("low");
      expect(result.zoom).toBe(1.5);
    });
  });

  describe("sceneSchema", () => {
    const validScene = {
      id: "scene-1",
      name: "Forest",
      description: "A dark forest",
      type: "outdoor",
      timeOfDay: "night",
      weather: "rainy",
      mood: "mysterious",
      lighting: "dim",
      elements: ["trees", "fog"],
      colors: ["dark green", "black"],
      prompt: "A dark mysterious forest at night",
    };

    it("should parse valid data successfully", () => {
      const result = sceneSchema.parse(validScene);
      expect(result.id).toBe("scene-1");
      expect(result.name).toBe("Forest");
    });

    it("should fail when name is empty", () => {
      expect(() =>
        sceneSchema.parse({ ...validScene, name: "" })
      ).toThrow();
    });

    it("should handle optional fields", () => {
      const result = sceneSchema.parse({
        ...validScene,
        imageGenerationPrompt: "forest scene",
        generatedImage: "https://example.com/forest.png",
        generatedVideo: "https://example.com/forest.mp4",
        videoGenerationStatus: "completed",
        videoGenerationTaskId: "task-1",
        updatedAt: "2024-01-01T00:00:00Z",
        camera: { angle: "low", movement: "pan" },
        imageUrl: "https://example.com/scene.png",
        scenePath: "/path/to/scene",
        refImagePath: "/path/to/ref.png",
        thumbnailPath: "/path/to/thumb.png",
        previewPath: "/path/to/preview.png",
        atmosphere: "eerie",
        source: "ai",
        tags: ["nature"],
        createdAt: "2024-01-01T00:00:00Z",
        generationPrompt: "generate forest",
        generationParams: { style: "dark" },
        useCount: 3,
        lastUsedAt: 1704067200000,
      });
      expect(result.camera?.angle).toBe("low");
      expect(result.videoGenerationStatus).toBe("completed");
      expect(result.useCount).toBe(3);
    });

    it("should reject invalid enum for videoGenerationStatus", () => {
      expect(() =>
        sceneSchema.parse({ ...validScene, videoGenerationStatus: "running" })
      ).toThrow();
    });

    it("should reject negative useCount", () => {
      expect(() =>
        sceneSchema.parse({ ...validScene, useCount: -1 })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => sceneSchema.parse({})).toThrow();
    });
  });

  describe("sceneElementTypeSchema", () => {
    it("should accept valid types", () => {
      const types = ["existing_character", "new_character", "prop", "environment"];
      for (const t of types) {
        expect(sceneElementTypeSchema.parse(t)).toBe(t);
      }
    });

    it("should reject invalid types", () => {
      expect(() => sceneElementTypeSchema.parse("vehicle")).toThrow();
    });
  });

  describe("sceneElementSchema", () => {
    const validSceneElement = {
      id: "elem-1",
      name: "Hero",
      type: "existing_character" as const,
    };

    it("should parse valid data with required fields", () => {
      const result = sceneElementSchema.parse(validSceneElement);
      expect(result.id).toBe("elem-1");
      expect(result.type).toBe("existing_character");
    });

    it("should handle optional fields", () => {
      const result = sceneElementSchema.parse({
        ...validSceneElement,
        characterId: "char-1",
        characterConfig: { style: "realistic" },
        description: "The main hero",
        imageUrl: "https://example.com/hero.png",
        dialogue: "I will save you!",
        action: "running",
        emotion: "determined",
        position: "center",
        pose: "standing",
        order: 1,
        timelineGroup: 1,
        timelineOrder: 0,
      });
      expect(result.dialogue).toBe("I will save you!");
      expect(result.order).toBe(1);
    });

    it("should reject invalid type enum", () => {
      expect(() =>
        sceneElementSchema.parse({ ...validSceneElement, type: "vehicle" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => sceneElementSchema.parse({})).toThrow();
    });
  });

  describe("createSceneInputSchema", () => {
    const validInput = {
      name: "Forest",
      description: "A dark forest",
      type: "outdoor",
      timeOfDay: "night",
      weather: "rainy",
      mood: "mysterious",
      lighting: "dim",
      elements: ["trees"],
      colors: ["green"],
      prompt: "A dark forest",
    };

    it("should parse valid input", () => {
      const result = createSceneInputSchema.parse(validInput);
      expect(result.name).toBe("Forest");
    });

    it("should not include id (picked fields only)", () => {
      const result = createSceneInputSchema.parse(validInput);
      expect("id" in result).toBe(false);
    });
  });

  describe("updateSceneInputSchema", () => {
    it("should parse with only id", () => {
      const result = updateSceneInputSchema.parse({ id: "scene-1" });
      expect(result.id).toBe("scene-1");
    });

    it("should fail when id is missing", () => {
      expect(() => updateSceneInputSchema.parse({ name: "Updated" })).toThrow();
    });
  });
});

describe("story schemas", () => {
  describe("chainModeSchema", () => {
    it("should accept valid modes", () => {
      const modes = ["auto", "isolated", "custom", "asset"];
      for (const m of modes) {
        expect(chainModeSchema.parse(m)).toBe(m);
      }
    });

    it("should apply default value 'auto'", () => {
      const result = chainModeSchema.parse(undefined);
      expect(result).toBe("auto");
    });

    it("should reject invalid modes", () => {
      expect(() => chainModeSchema.parse("manual")).toThrow();
    });
  });

  describe("beatInputSchema", () => {
    it("should apply default value 'ai'", () => {
      const result = beatInputSchema.parse(undefined);
      expect(result).toBe("ai");
    });

    it("should accept valid values", () => {
      const values = ["ai", "upload", "asset", "isolated"];
      for (const v of values) {
        expect(beatInputSchema.parse(v)).toBe(v);
      }
    });

    it("should reject invalid values", () => {
      expect(() => beatInputSchema.parse("hybrid")).toThrow();
    });
  });

  describe("frameInputSchema", () => {
    it("should apply default value 'ai'", () => {
      const result = frameInputSchema.parse(undefined);
      expect(result).toBe("ai");
    });

    it("should accept valid values", () => {
      const values = ["ai", "upload", "keyframe", "isolated"];
      for (const v of values) {
        expect(frameInputSchema.parse(v)).toBe(v);
      }
    });
  });

  describe("videoInputSchema", () => {
    it("should apply default value 'ai'", () => {
      const result = videoInputSchema.parse(undefined);
      expect(result).toBe("ai");
    });

    it("should accept valid values", () => {
      const values = ["ai", "upload", "framepair", "isolated"];
      for (const v of values) {
        expect(videoInputSchema.parse(v)).toBe(v);
      }
    });
  });

  describe("referenceImageWeightSchema", () => {
    const validWeight = {
      url: "https://example.com/ref.png",
      weight: 0.8,
      type: "portrait" as const,
      description: "Character reference",
    };

    it("should parse valid data successfully", () => {
      const result = referenceImageWeightSchema.parse(validWeight);
      expect(result.url).toBe("https://example.com/ref.png");
      expect(result.weight).toBe(0.8);
    });

    it("should reject weight below 0", () => {
      expect(() =>
        referenceImageWeightSchema.parse({ ...validWeight, weight: -0.1 })
      ).toThrow();
    });

    it("should reject weight above 1", () => {
      expect(() =>
        referenceImageWeightSchema.parse({ ...validWeight, weight: 1.1 })
      ).toThrow();
    });

    it("should reject invalid type enum", () => {
      expect(() =>
        referenceImageWeightSchema.parse({ ...validWeight, type: "abstract" })
      ).toThrow();
    });
  });

  describe("promptLabSchema", () => {
    const validPromptLab = {
      coreElements: "A hero in a forest",
      cameraAction: "slow pan",
      styleAtmosphere: "dark and moody",
    };

    it("should parse valid data successfully", () => {
      const result = promptLabSchema.parse(validPromptLab);
      expect(result.coreElements).toBe("A hero in a forest");
    });

    it("should handle optional fields", () => {
      const result = promptLabSchema.parse({
        ...validPromptLab,
        negativePrompt: "blurry",
        referenceWeights: [
          { url: "https://example.com/ref.png", weight: 0.5, type: "portrait", description: "ref" },
        ],
        targetModel: "model-v1",
        targetProvider: "provider-1",
        estimatedCost: 0.05,
        estimatedTokens: 100,
        firstFramePrompt: "hero standing",
        videoPrompt: "hero walking",
      });
      expect(result.negativePrompt).toBe("blurry");
      expect(result.referenceWeights).toHaveLength(1);
    });

    it("should fail when required fields are missing", () => {
      expect(() => promptLabSchema.parse({})).toThrow();
    });
  });

  describe("storyBeatKeyframeSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = storyBeatKeyframeSchema.parse({});
      expect(result.imageUrl).toBeUndefined();
    });

    it("should parse valid data with all fields", () => {
      const result = storyBeatKeyframeSchema.parse({
        imageUrl: "https://example.com/keyframe.png",
        prompt: "A hero standing",
        generatedAt: "2024-01-01T00:00:00Z",
        source: "ai",
        referencedPrevKeyframe: "kf-prev-1",
      });
      expect(result.source).toBe("ai");
      expect(result.referencedPrevKeyframe).toBe("kf-prev-1");
    });

    it("should reject invalid source enum", () => {
      expect(() =>
        storyBeatKeyframeSchema.parse({ source: "manual" })
      ).toThrow();
    });
  });

  describe("storyBeatFramePairSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = storyBeatFramePairSchema.parse({});
      expect(result.firstFrameUrl).toBeUndefined();
    });

    it("should parse valid data with nested frame objects", () => {
      const result = storyBeatFramePairSchema.parse({
        firstFrameUrl: "https://example.com/first.png",
        lastFrameUrl: "https://example.com/last.png",
        firstFramePrompt: "hero standing",
        lastFramePrompt: "hero running",
        generatedAt: "2024-01-01T00:00:00Z",
        source: "ai",
        firstFrame: {
          imageUrl: "https://example.com/first.png",
          prompt: "hero standing",
          derivedFrom: "kf-1",
        },
        lastFrame: {
          imageUrl: "https://example.com/last.png",
          prompt: "hero running",
          derivedFrom: "kf-2",
        },
      });
      expect(result.firstFrame?.derivedFrom).toBe("kf-1");
      expect(result.lastFrame?.derivedFrom).toBe("kf-2");
    });

    it("should reject invalid source enum", () => {
      expect(() =>
        storyBeatFramePairSchema.parse({ source: "generated" })
      ).toThrow();
    });
  });

  describe("storyBeatVideoSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = storyBeatVideoSchema.parse({});
      expect(result.videoUrl).toBeUndefined();
    });

    it("should parse valid data with all fields", () => {
      const result = storyBeatVideoSchema.parse({
        videoUrl: "https://example.com/video.mp4",
        taskId: "task-1",
        status: "completed",
        generatedAt: "2024-01-01T00:00:00Z",
        source: "upload",
        prompt: "A hero walking",
        error: undefined,
        createdAt: "2024-01-01T00:00:00Z",
      });
      expect(result.status).toBe("completed");
      expect(result.source).toBe("upload");
    });
  });

  describe("elementBindingSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = elementBindingSchema.parse({});
      expect(result.role).toBeUndefined();
    });

    it("should parse valid data with all fields", () => {
      const result = elementBindingSchema.parse({
        role: "protagonist",
        position: "center",
        action: "walking",
        emotion: "happy",
        description: "The hero",
        text: "I am here!",
        imageUrl: "https://example.com/hero.png",
      });
      expect(result.role).toBe("protagonist");
    });
  });

  describe("beatCameraSchema", () => {
    it("should parse empty object (all fields optional)", () => {
      const result = beatCameraSchema.parse({});
      expect(result.angle).toBeUndefined();
    });

    it("should parse valid data", () => {
      const result = beatCameraSchema.parse({
        angle: "low",
        movement: "tracking",
        distance: "far",
        speed: "slow",
      });
      expect(result.angle).toBe("low");
    });
  });

  describe("storyBeatSchema", () => {
    const validBeat = {
      id: "beat-1",
      sequence: 1,
      description: "Opening scene",
      duration: 5,
      elementIds: ["elem-1"],
      characterIds: ["char-1"],
      enhancedGeneration: false,
    };

    it("should parse valid data with required fields", () => {
      const result = storyBeatSchema.parse(validBeat);
      expect(result.id).toBe("beat-1");
      expect(result.sequence).toBe(1);
      expect(result.enhancedGeneration).toBe(false);
    });

    it("should reject non-positive duration", () => {
      expect(() =>
        storyBeatSchema.parse({ ...validBeat, duration: 0 })
      ).toThrow();
      expect(() =>
        storyBeatSchema.parse({ ...validBeat, duration: -1 })
      ).toThrow();
    });

    it("should handle optional fields", () => {
      const result = storyBeatSchema.parse({
        ...validBeat,
        order: 1,
        type: "action",
        title: "Opening",
        content: "The hero arrives",
        sceneId: "scene-1",
        shotType: "wide",
        elementBindings: {
          "elem-1": { role: "protagonist", position: "center" },
        },
        generationStatus: "idle",
        camera: { angle: "low", movement: "pan" },
        keyframe: { imageUrl: "https://example.com/kf.png" },
        framePair: { firstFrameUrl: "https://example.com/first.png" },
        videoGen: { videoUrl: "https://example.com/video.mp4" },
        imageGenerationPrompt: "hero standing",
        firstFramePrompt: "hero arrives",
        lastFramePrompt: "hero leaves",
        transition: "fade",
        imageUrl: "https://example.com/beat.png",
        chainMode: "auto",
      });
      expect(result.type).toBe("action");
      expect(result.shotType).toBe("wide");
      expect(result.camera?.angle).toBe("low");
      expect(result.chainMode).toBe("auto");
    });

    it("should reject invalid type enum", () => {
      expect(() =>
        storyBeatSchema.parse({ ...validBeat, type: "musical" })
      ).toThrow();
    });

    it("should convert invalid shotType to undefined", () => {
      const result = storyBeatSchema.parse({ ...validBeat, shotType: "dutch" });
      expect(result.shotType).toBeUndefined();
    });

    it("should reject invalid generationStatus enum", () => {
      expect(() =>
        storyBeatSchema.parse({ ...validBeat, generationStatus: "running" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => storyBeatSchema.parse({})).toThrow();
    });
  });

  describe("storySchema", () => {
    const validStory = {
      id: "story-1",
      title: "The Hero's Journey",
      description: "An epic adventure",
      characters: ["char-1"],
      scenes: ["scene-1"],
      createdAt: 1704067200,
      updatedAt: 1704067200,
      beats: [],
      elementIds: [],
    };

    it("should parse valid data successfully", () => {
      const result = storySchema.parse(validStory);
      expect(result.id).toBe("story-1");
      expect(result.title).toBe("The Hero's Journey");
    });

    it("should fail when title is empty", () => {
      expect(() =>
        storySchema.parse({ ...validStory, title: "" })
      ).toThrow();
    });

    it("should handle optional fields", () => {
      const result = storySchema.parse({
        ...validStory,
        genre: "fantasy",
        tone: "epic",
        targetDuration: 120,
        keyframeChainValid: true,
        elementBindings: {
          "elem-1": { role: "protagonist" },
        },
      });
      expect(result.genre).toBe("fantasy");
      expect(result.targetDuration).toBe(120);
      expect(result.keyframeChainValid).toBe(true);
    });

    it("should reject non-positive targetDuration", () => {
      expect(() =>
        storySchema.parse({ ...validStory, targetDuration: 0 })
      ).toThrow();
      expect(() =>
        storySchema.parse({ ...validStory, targetDuration: -10 })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => storySchema.parse({})).toThrow();
    });

    it("should parse with beats containing valid beat data", () => {
      const result = storySchema.parse({
        ...validStory,
        beats: [
          {
            id: "beat-1",
            sequence: 1,
            description: "Opening",
            duration: 5,
            elementIds: [],
            characterIds: ["char-1"],
            enhancedGeneration: false,
          },
        ],
      });
      expect(result.beats).toHaveLength(1);
    });
  });

  describe("createStoryInputSchema", () => {
    const validInput = {
      title: "New Story",
      description: "A new adventure",
      characters: [],
      scenes: [],
      beats: [],
      elementIds: [],
    };

    it("should parse valid input", () => {
      const result = createStoryInputSchema.parse(validInput);
      expect(result.title).toBe("New Story");
    });

    it("should not include id (picked fields only)", () => {
      const result = createStoryInputSchema.parse(validInput);
      expect("id" in result).toBe(false);
    });

    it("should fail when title is empty", () => {
      expect(() =>
        createStoryInputSchema.parse({ ...validInput, title: "" })
      ).toThrow();
    });
  });

  describe("updateStoryInputSchema", () => {
    it("should parse with only id", () => {
      const result = updateStoryInputSchema.parse({ id: "story-1" });
      expect(result.id).toBe("story-1");
    });

    it("should fail when id is missing", () => {
      expect(() => updateStoryInputSchema.parse({ title: "Updated" })).toThrow();
    });
  });
});

describe("shot-system schemas", () => {
  describe("shotInstructionSchema", () => {
    const validInstruction = {
      shotSize: "close" as const,
      cameraMovement: "static" as const,
      cameraAngle: "eye_level" as const,
    };

    it("should parse valid data successfully", () => {
      const result = shotInstructionSchema.parse(validInstruction);
      expect(result.shotSize).toBe("close");
      expect(result.cameraMovement).toBe("static");
      expect(result.cameraAngle).toBe("eye_level");
    });

    it("should reject invalid shotSize", () => {
      expect(() =>
        shotInstructionSchema.parse({ ...validInstruction, shotSize: "micro" })
      ).toThrow();
    });

    it("should reject invalid cameraMovement", () => {
      expect(() =>
        shotInstructionSchema.parse({ ...validInstruction, cameraMovement: "spin" })
      ).toThrow();
    });

    it("should reject invalid cameraAngle", () => {
      expect(() =>
        shotInstructionSchema.parse({ ...validInstruction, cameraAngle: "tilted" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => shotInstructionSchema.parse({})).toThrow();
    });
  });

  describe("featureAnchorItemSchema", () => {
    const validItem = {
      elementId: "elem-1",
      referenceImageUrl: "https://example.com/ref.png",
      featureTags: ["face", "hair"],
    };

    it("should parse valid data successfully", () => {
      const result = featureAnchorItemSchema.parse(validItem);
      expect(result.elementId).toBe("elem-1");
    });

    it("should apply default weight", () => {
      const result = featureAnchorItemSchema.parse(validItem);
      expect(result.weight).toBe(0.8);
    });

    it("should reject weight below 0", () => {
      expect(() =>
        featureAnchorItemSchema.parse({ ...validItem, weight: -0.1 })
      ).toThrow();
    });

    it("should reject weight above 1", () => {
      expect(() =>
        featureAnchorItemSchema.parse({ ...validItem, weight: 1.5 })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => featureAnchorItemSchema.parse({})).toThrow();
    });
  });

  describe("featureAnchoringSchema", () => {
    const validAnchoring = {
      enabled: true,
      characterAnchors: [
        {
          elementId: "elem-1",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: ["face"],
        },
      ],
    };

    it("should parse valid data successfully", () => {
      const result = featureAnchoringSchema.parse(validAnchoring);
      expect(result.enabled).toBe(true);
      expect(result.characterAnchors).toHaveLength(1);
    });

    it("should apply default values", () => {
      const result = featureAnchoringSchema.parse(validAnchoring);
      expect(result.disableFrameBinding).toBe(true);
      expect(result.featureConsistencyStrength).toBe(0.8);
    });

    it("should handle optional blend config with defaults", () => {
      const result = featureAnchoringSchema.parse({
        ...validAnchoring,
        blend: {},
      });
      expect(result.blend?.mode).toBe("anchor_only");
      expect(result.blend?.chainWeight).toBe(0.5);
      expect(result.blend?.anchorWeight).toBe(0.5);
      expect(result.blend?.autoFallback).toBe(true);
    });

    it("should handle optional fields", () => {
      const result = featureAnchoringSchema.parse({
        ...validAnchoring,
        propAnchors: [
          {
            elementId: "prop-1",
            referenceImageUrl: "https://example.com/prop.png",
            featureTags: ["shape"],
          },
        ],
        previewImageUrl: "https://example.com/preview.png",
      });
      expect(result.propAnchors).toHaveLength(1);
      expect(result.previewImageUrl).toBe("https://example.com/preview.png");
    });

    it("should reject invalid blend mode", () => {
      expect(() =>
        featureAnchoringSchema.parse({
          ...validAnchoring,
          blend: { mode: "invalid" },
        })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => featureAnchoringSchema.parse({})).toThrow();
    });
  });

  describe("consistencyCheckResultSchema", () => {
    const validResult = {
      passed: true,
      characterScores: [
        {
          elementId: "elem-1",
          elementName: "Hero",
          score: 0.95,
          issues: [],
        },
      ],
      overallScore: 0.95,
      recommendation: "accept" as const,
    };

    it("should parse valid data successfully", () => {
      const result = consistencyCheckResultSchema.parse(validResult);
      expect(result.passed).toBe(true);
      expect(result.overallScore).toBe(0.95);
      expect(result.recommendation).toBe("accept");
    });

    it("should reject invalid recommendation", () => {
      expect(() =>
        consistencyCheckResultSchema.parse({
          ...validResult,
          recommendation: "skip",
        })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => consistencyCheckResultSchema.parse({})).toThrow();
    });
  });

  describe("shotReferenceSchema", () => {
    const validRef = {
      direction: "previous" as const,
      contentType: "last_frame" as const,
    };

    it("should parse valid data successfully", () => {
      const result = shotReferenceSchema.parse(validRef);
      expect(result.direction).toBe("previous");
      expect(result.contentType).toBe("last_frame");
    });

    it("should handle optional fields", () => {
      const result = shotReferenceSchema.parse({
        ...validRef,
        targetShotId: "shot-1",
        segmentDuration: 2.5,
        segmentPosition: "end",
      });
      expect(result.targetShotId).toBe("shot-1");
      expect(result.segmentDuration).toBe(2.5);
      expect(result.segmentPosition).toBe("end");
    });

    it("should reject invalid direction", () => {
      expect(() =>
        shotReferenceSchema.parse({ ...validRef, direction: "random" })
      ).toThrow();
    });

    it("should reject invalid contentType", () => {
      expect(() =>
        shotReferenceSchema.parse({ ...validRef, contentType: "thumbnail" })
      ).toThrow();
    });

    it("should reject invalid segmentPosition", () => {
      expect(() =>
        shotReferenceSchema.parse({ ...validRef, segmentPosition: "middle" })
      ).toThrow();
    });
  });

  describe("shotGenerationStatusSchema", () => {
    it("should accept valid statuses", () => {
      const statuses = ["idle", "pending", "generating", "completed", "failed"];
      for (const s of statuses) {
        expect(shotGenerationStatusSchema.parse(s)).toBe(s);
      }
    });

    it("should reject invalid statuses", () => {
      expect(() => shotGenerationStatusSchema.parse("running")).toThrow();
    });
  });

  describe("shotGenerationResultSchema", () => {
    const validResult = {
      duration: 5,
      generatedAt: "2024-01-01T00:00:00Z",
      prompt: "A hero walking",
    };

    it("should parse valid data with required fields", () => {
      const result = shotGenerationResultSchema.parse(validResult);
      expect(result.duration).toBe(5);
      expect(result.prompt).toBe("A hero walking");
    });

    it("should handle optional fields", () => {
      const result = shotGenerationResultSchema.parse({
        ...validResult,
        videoUrl: "https://example.com/video.mp4",
        lastFrameUrl: "https://example.com/last.png",
        firstFrameUrl: "https://example.com/first.png",
        taskId: "task-1",
        error: undefined,
      });
      expect(result.videoUrl).toBe("https://example.com/video.mp4");
      expect(result.taskId).toBe("task-1");
    });

    it("should fail when required fields are missing", () => {
      expect(() => shotGenerationResultSchema.parse({})).toThrow();
    });
  });

  describe("fixedImageSchema", () => {
    const validFixedImage = {
      enabled: true,
      lockType: "character" as const,
    };

    it("should parse valid data successfully", () => {
      const result = fixedImageSchema.parse(validFixedImage);
      expect(result.enabled).toBe(true);
      expect(result.lockType).toBe("character");
    });

    it("should handle optional fields", () => {
      const result = fixedImageSchema.parse({
        ...validFixedImage,
        imageUrl: "https://example.com/char.png",
        name: "Hero",
        characters: [
          {
            characterId: "char-1",
            characterName: "Hero",
            imageUrl: "https://example.com/hero.png",
          },
        ],
      });
      expect(result.imageUrl).toBe("https://example.com/char.png");
      expect(result.characters).toHaveLength(1);
    });

    it("should reject invalid lockType", () => {
      expect(() =>
        fixedImageSchema.parse({ ...validFixedImage, lockType: "weapon" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => fixedImageSchema.parse({})).toThrow();
    });
  });

  describe("referenceVideoSchema", () => {
    const validRefVideo = {
      enabled: true,
      mimicryLevel: "medium" as const,
    };

    it("should parse valid data successfully", () => {
      const result = referenceVideoSchema.parse(validRefVideo);
      expect(result.enabled).toBe(true);
      expect(result.mimicryLevel).toBe("medium");
    });

    it("should handle optional fields", () => {
      const result = referenceVideoSchema.parse({
        ...validRefVideo,
        videoUrl: "https://example.com/ref.mp4",
        name: "Reference",
        duration: 10,
      });
      expect(result.videoUrl).toBe("https://example.com/ref.mp4");
      expect(result.duration).toBe(10);
    });

    it("should reject invalid mimicryLevel", () => {
      expect(() =>
        referenceVideoSchema.parse({ ...validRefVideo, mimicryLevel: "full" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => referenceVideoSchema.parse({})).toThrow();
    });
  });

  describe("templateConfigSchema", () => {
    const validTemplateConfig = {
      enabled: true,
    };

    it("should parse valid data successfully", () => {
      const result = templateConfigSchema.parse(validTemplateConfig);
      expect(result.enabled).toBe(true);
    });

    it("should handle optional fields", () => {
      const result = templateConfigSchema.parse({
        ...validTemplateConfig,
        templateId: "tpl-1",
        template: { name: "Action" },
        autoMatchStory: true,
        name: "Action Template",
        matchCamera: true,
        matchTransition: false,
        matchTiming: true,
      });
      expect(result.templateId).toBe("tpl-1");
      expect(result.autoMatchStory).toBe(true);
      expect(result.matchCamera).toBe(true);
    });

    it("should fail when enabled is missing", () => {
      expect(() => templateConfigSchema.parse({})).toThrow();
    });
  });

  describe("elementTypeSchema", () => {
    it("should accept valid types", () => {
      const types = ["character", "prop", "effect", "scene"];
      for (const t of types) {
        expect(elementTypeSchema.parse(t)).toBe(t);
      }
    });

    it("should reject invalid types", () => {
      expect(() => elementTypeSchema.parse("invalid")).toThrow();
    });
  });

  describe("assetTypeSchema", () => {
    it("should accept valid types", () => {
      const types = ["image", "video", "text"];
      for (const t of types) {
        expect(assetTypeSchema.parse(t)).toBe(t);
      }
    });

    it("should reject invalid types", () => {
      expect(() => assetTypeSchema.parse("audio")).toThrow();
    });
  });

  describe("assetBindingSchema", () => {
    const validBinding = {
      type: "image" as const,
      url: "https://example.com/img.png",
      name: "Hero Image",
      uploadedAt: "2024-01-01T00:00:00Z",
    };

    it("should parse valid data successfully", () => {
      const result = assetBindingSchema.parse(validBinding);
      expect(result.type).toBe("image");
      expect(result.name).toBe("Hero Image");
    });

    it("should handle optional isPrimary field", () => {
      const result = assetBindingSchema.parse({
        ...validBinding,
        isPrimary: true,
      });
      expect(result.isPrimary).toBe(true);
    });

    it("should reject invalid type", () => {
      expect(() =>
        assetBindingSchema.parse({ ...validBinding, type: "audio" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => assetBindingSchema.parse({})).toThrow();
    });
  });

  describe("referenceImageQualitySchema", () => {
    const validQuality = {
      isValid: true,
      resolution: { width: 1920, height: 1080 },
      minResolution: 512,
      clarityScore: 0.85,
      issues: [],
    };

    it("should parse valid data successfully", () => {
      const result = referenceImageQualitySchema.parse(validQuality);
      expect(result.isValid).toBe(true);
      expect(result.resolution.width).toBe(1920);
      expect(result.clarityScore).toBe(0.85);
    });

    it("should fail when required fields are missing", () => {
      expect(() => referenceImageQualitySchema.parse({})).toThrow();
      expect(() =>
        referenceImageQualitySchema.parse({ isValid: true, resolution: {} })
      ).toThrow();
    });
  });

  describe("elementFeatureAnchorSchema", () => {
    const validAnchor = {
      elementId: "elem-1",
      elementType: "character" as const,
      referenceImageUrl: "https://example.com/ref.png",
      featureTags: ["face", "hair"],
      extractedAt: "2024-01-01T00:00:00Z",
      confidence: 0.9,
    };

    it("should parse valid data successfully", () => {
      const result = elementFeatureAnchorSchema.parse(validAnchor);
      expect(result.elementId).toBe("elem-1");
      expect(result.confidence).toBe(0.9);
    });

    it("should handle optional characterFeatures", () => {
      const result = elementFeatureAnchorSchema.parse({
        ...validAnchor,
        characterFeatures: {
          faceShape: "oval",
          hairColor: "black",
          hairStyle: "short",
          eyeColor: "brown",
          build: "athletic",
          clothing: "armor",
          colorPalette: ["#333", "#666"],
          distinctiveMarks: ["scar on left cheek"],
        },
      });
      expect(result.characterFeatures?.faceShape).toBe("oval");
      expect(result.characterFeatures?.colorPalette).toHaveLength(2);
    });

    it("should handle optional sceneFeatures", () => {
      const result = elementFeatureAnchorSchema.parse({
        ...validAnchor,
        sceneFeatures: {
          sceneType: "forest",
          colorTone: "dark green",
          lightingType: "moonlight",
          keyElements: ["trees", "fog"],
          structureDesc: "dense canopy",
        },
      });
      expect(result.sceneFeatures?.sceneType).toBe("forest");
    });

    it("should reject invalid elementType", () => {
      expect(() =>
        elementFeatureAnchorSchema.parse({ ...validAnchor, elementType: "invalid" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => elementFeatureAnchorSchema.parse({})).toThrow();
    });
  });

  describe("storyElementSchema", () => {
    const validElement = {
      id: "elem-1",
      type: "character" as const,
      name: "Hero",
      description: "The main character",
      bindings: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    it("should parse valid data successfully", () => {
      const result = storyElementSchema.parse(validElement);
      expect(result.id).toBe("elem-1");
      expect(result.type).toBe("character");
    });

    it("should handle optional characterConfig", () => {
      const result = storyElementSchema.parse({
        ...validElement,
        characterConfig: {
          gender: "male",
          age: 25,
          style: "realistic",
          personality: ["brave"],
          appearance: {
            hairColor: "black",
            build: "athletic",
          },
        },
      });
      expect(result.characterConfig?.gender).toBe("male");
      expect(result.characterConfig?.appearance?.hairColor).toBe("black");
    });

    it("should handle optional sceneConfig", () => {
      const result = storyElementSchema.parse({
        ...validElement,
        type: "prop",
        sceneConfig: {
          timeOfDay: "night",
          weather: "rainy",
          mood: "mysterious",
          lighting: "dim",
          style: "dark",
        },
      });
      expect(result.sceneConfig?.mood).toBe("mysterious");
    });

    it("should handle optional featureAnchor and referenceImageQuality", () => {
      const result = storyElementSchema.parse({
        ...validElement,
        featureAnchor: {
          elementId: "elem-1",
          elementType: "character",
          referenceImageUrl: "https://example.com/ref.png",
          featureTags: ["face"],
          extractedAt: "2024-01-01T00:00:00Z",
          confidence: 0.9,
        },
        referenceImageQuality: {
          isValid: true,
          resolution: { width: 1024, height: 1024 },
          minResolution: 512,
          clarityScore: 0.8,
          issues: [],
        },
      });
      expect(result.featureAnchor?.confidence).toBe(0.9);
      expect(result.referenceImageQuality?.clarityScore).toBe(0.8);
    });

    it("should reject invalid type enum", () => {
      expect(() =>
        storyElementSchema.parse({ ...validElement, type: "invalid" })
      ).toThrow();
    });

    it("should fail when required fields are missing", () => {
      expect(() => storyElementSchema.parse({})).toThrow();
    });
  });

  describe("elementLibrarySchema", () => {
    const validLibrary = {
      elements: [],
      nextCode: { character: 1, prop: 1, effect: 1, scene: 1 },
    };

    it("should parse valid data successfully", () => {
      const result = elementLibrarySchema.parse(validLibrary);
      expect(result.elements).toHaveLength(0);
      expect(result.nextCode.character).toBe(1);
    });

    it("should parse with elements", () => {
      const result = elementLibrarySchema.parse({
        elements: [
          {
            id: "elem-1",
            type: "character",
            name: "Hero",
            description: "Main character",
            bindings: [],
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        ],
        nextCode: { character: 2, prop: 1, effect: 1, scene: 1 },
      });
      expect(result.elements).toHaveLength(1);
    });

    it("should fail when required fields are missing", () => {
      expect(() => elementLibrarySchema.parse({})).toThrow();
    });

    it("should reject invalid elementType in nextCode keys", () => {
      expect(() =>
        elementLibrarySchema.parse({ elements: [], nextCode: { invalid: 1 } })
      ).toThrow();
    });
  });
});
