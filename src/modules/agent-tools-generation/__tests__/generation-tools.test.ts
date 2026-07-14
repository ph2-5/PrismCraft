/**
 * Generation Tools 单元测试
 *
 * 覆盖 9 个生成工具：
 * - generate_character_image / generate_scene_image / generate_prop_image
 * - analyze_image / generate_text
 * - generate_music / generate_voiceover / text_to_speech / transcribe_audio（音频类降级）
 *
 * Mock 策略：
 * - container（textProvider / imageProvider）
 * - characterService / sceneService（动态 import）
 * - TOOL_TIMEOUTS（../../services/tool-executor）
 *
 * 测试重点：提示词构建优先级、更新失败降级、ApiResponse 错误传播、音频工具优雅降级
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  textProvider: { generateText: vi.fn() },
  imageProvider: {
    generateImage: vi.fn(),
    analyzeImage: vi.fn(),
  },
  audioProvider: {
    synthesizeSpeech: vi.fn(),
    transcribeAudio: vi.fn(),
  },
  characterService: {
    getById: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
  },
  sceneService: {
    getById: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/infrastructure/di", () => ({
  container: {
    textProvider: mocks.textProvider,
    imageProvider: mocks.imageProvider,
    audioProvider: mocks.audioProvider,
  },
}));

vi.mock("@/modules/character", () => ({
  characterService: mocks.characterService,
}));

vi.mock("@/modules/scene", () => ({
  sceneService: mocks.sceneService,
}));

vi.mock("@/shared/constants/tool-timeouts", () => ({
  TOOL_TIMEOUTS: {
    query: 5000,
    mutation: 30000,
    generation: 120000,
    videoTask: 600000,
    download: 60000,
  },
}));

import {
  generateCharacterImageTool,
  generateSceneImageTool,
  generatePropImageTool,
  analyzeImageTool,
  generateTextTool,
  generateMusicTool,
  generateVoiceoverTool,
  textToSpeechTool,
  transcribeAudioTool,
  generationTools,
} from "../generation-tools";
import type { ToolContext } from "@/domain/types/agent-tools";

function makeCtx(): ToolContext {
  return {
    sessionId: "test-session",
    onProgress: vi.fn(),
  };
}

/** 构造成功的 Result */
function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** 构造失败的 Result */
function err(error: Error): { ok: false; error: Error } {
  return { ok: false, error };
}

/** 构造 ApiResponse 成功 */
function apiOk<T>(data: T) {
  return { success: true as const, data };
}

/** 构造 ApiResponse 失败 */
function apiErr(error: string) {
  return { success: false as const, error };
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// 1. generate_character_image
// ============================================================
describe("generate_character_image", () => {
  it("1. 正常生成角色图片（customPrompt 覆盖）", async () => {
    const character = {
      id: "c1",
      name: "艾莉",
      style: "赛博朋克",
      imageGenerationPrompt: "内置提示词",
    };
    mocks.characterService.getById.mockResolvedValue(ok(character));
    mocks.imageProvider.generateImage.mockResolvedValue(
      apiOk({ imageUrl: "https://example.com/c1.png" }),
    );
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    const result = await generateCharacterImageTool.execute(
      {
        characterId: "c1",
        customPrompt: "自定义提示词",
        size: "portrait_16_9",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      imageUrl: string;
      characterId: string;
      prompt: string;
      updated: boolean;
    };
    expect(data.imageUrl).toBe("https://example.com/c1.png");
    expect(data.characterId).toBe("c1");
    // customPrompt 优先级最高
    expect(data.prompt).toBe("自定义提示词");
    expect(data.updated).toBe(true);
    // 验证 imageProvider 调用参数
    const genArgs = mocks.imageProvider.generateImage.mock.calls[0];
    expect(genArgs[0]).toBe("自定义提示词");
    expect(genArgs[1]).toBe("character");
    expect(genArgs[2].size).toBe("portrait_16_9");
    expect(genArgs[2].purpose).toBe("character");
    // 验证更新角色 thumbnailPath
    const updateArgs = mocks.characterService.update.mock.calls[0][1];
    expect(updateArgs.thumbnailPath).toBe("https://example.com/c1.png");
  });

  it("2. 使用角色 imageGenerationPrompt（无 customPrompt）", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "T", imageGenerationPrompt: "内置提示词" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    const result = await generateCharacterImageTool.execute(
      { characterId: "c1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { prompt: string };
    expect(data.prompt).toBe("内置提示词");
  });

  it("3. 默认 size 为 portrait_4_3", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "T", imageGenerationPrompt: "p" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    await generateCharacterImageTool.execute({ characterId: "c1" }, makeCtx());

    const genArgs = mocks.imageProvider.generateImage.mock.calls[0];
    expect(genArgs[2].size).toBe("portrait_4_3");
  });

  it("4. 角色不存在时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await generateCharacterImageTool.execute(
      { characterId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取角色失败");
    expect(mocks.imageProvider.generateImage).not.toHaveBeenCalled();
  });

  it("5. 图片生成失败时返回错误", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "T", imageGenerationPrompt: "p" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiErr("图片 API 不可用"));

    const result = await generateCharacterImageTool.execute(
      { characterId: "c1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("图片 API 不可用");
    // 不应调用 update
    expect(mocks.characterService.update).not.toHaveBeenCalled();
  });

  it("6. 图片生成成功但更新角色失败时 updated=false", async () => {
    mocks.characterService.getById.mockResolvedValue(
      ok({ id: "c1", name: "T", imageGenerationPrompt: "p" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));
    mocks.characterService.update.mockResolvedValue(err(new Error("DB 写入失败")));

    const result = await generateCharacterImageTool.execute(
      { characterId: "c1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { imageUrl: string; updated: boolean };
    expect(data.imageUrl).toBe("url");
    expect(data.updated).toBe(false);
  });

  it("7. 角色无任何提示词字段且无 customPrompt 时，由 buildCharacterPromptFromFields 构建", async () => {
    // 角色仅有部分字段，触发自动构建
    mocks.characterService.getById.mockResolvedValue(
      ok({
        id: "c1",
        name: "艾莉",
        gender: "女",
        age: 25,
        style: "赛博朋克",
        description: "侦探",
        appearance: { hairColor: "银色", clothing: "皮衣" },
      }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));
    mocks.characterService.update.mockResolvedValue(ok(undefined));

    const result = await generateCharacterImageTool.execute(
      { characterId: "c1", style: "水彩" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { prompt: string };
    // 提示词应包含 style 覆盖（水彩）和角色字段
    expect(data.prompt).toContain("水彩");
    expect(data.prompt).toContain("艾莉");
    expect(data.prompt).toContain("银色");
  });
});

// ============================================================
// 2. generate_scene_image
// ============================================================
describe("generate_scene_image", () => {
  it("8. 正常生成场景图片", async () => {
    const scene = {
      id: "sc1",
      name: "雨夜街道",
      type: "室外",
      timeOfDay: "夜晚",
      weather: "雨天",
      mood: "紧张",
      lighting: "霓虹灯",
      description: "现有描述",
      imageGenerationPrompt: "场景内置提示词",
    };
    mocks.sceneService.getById.mockResolvedValue(ok(scene));
    mocks.imageProvider.generateImage.mockResolvedValue(
      apiOk({ imageUrl: "https://example.com/scene.png" }),
    );
    mocks.sceneService.update.mockResolvedValue(ok(undefined));

    const result = await generateSceneImageTool.execute(
      { sceneId: "sc1", size: "landscape_16_9" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      imageUrl: string;
      sceneId: string;
      prompt: string;
      updated: boolean;
    };
    expect(data.imageUrl).toBe("https://example.com/scene.png");
    expect(data.sceneId).toBe("sc1");
    // 使用 imageGenerationPrompt（优先于自动构建）
    expect(data.prompt).toBe("场景内置提示词");
    expect(data.updated).toBe(true);
    // 验证 imageProvider 调用
    const genArgs = mocks.imageProvider.generateImage.mock.calls[0];
    expect(genArgs[1]).toBe("scene");
    expect(genArgs[2].size).toBe("landscape_16_9");
    expect(genArgs[2].purpose).toBe("scene");
    // 验证更新 thumbnailPath
    const updateArgs = mocks.sceneService.update.mock.calls[0][1];
    expect(updateArgs.thumbnailPath).toBe("https://example.com/scene.png");
  });

  it("9. 默认 size 为 landscape_4_3", async () => {
    mocks.sceneService.getById.mockResolvedValue(
      ok({ id: "sc1", name: "S", imageGenerationPrompt: "p" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));
    mocks.sceneService.update.mockResolvedValue(ok(undefined));

    await generateSceneImageTool.execute({ sceneId: "sc1" }, makeCtx());

    const genArgs = mocks.imageProvider.generateImage.mock.calls[0];
    expect(genArgs[2].size).toBe("landscape_4_3");
  });

  it("10. 场景不存在时返回错误", async () => {
    mocks.sceneService.getById.mockResolvedValue(err(new Error("Not found")));

    const result = await generateSceneImageTool.execute(
      { sceneId: "missing" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("获取场景失败");
    expect(mocks.imageProvider.generateImage).not.toHaveBeenCalled();
  });

  it("11. 图片生成失败时返回错误", async () => {
    mocks.sceneService.getById.mockResolvedValue(
      ok({ id: "sc1", name: "S", imageGenerationPrompt: "p" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiErr("生成超时"));

    const result = await generateSceneImageTool.execute(
      { sceneId: "sc1" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("生成超时");
    expect(mocks.sceneService.update).not.toHaveBeenCalled();
  });

  it("12. 图片生成成功但更新场景失败时 updated=false", async () => {
    mocks.sceneService.getById.mockResolvedValue(
      ok({ id: "sc1", name: "S", imageGenerationPrompt: "p" }),
    );
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));
    mocks.sceneService.update.mockResolvedValue(err(new Error("更新失败")));

    const result = await generateSceneImageTool.execute(
      { sceneId: "sc1" },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { updated: boolean };
    expect(data.updated).toBe(false);
  });
});

// ============================================================
// 3. generate_prop_image
// ============================================================
describe("generate_prop_image", () => {
  it("13. 正常生成道具图片", async () => {
    mocks.imageProvider.generateImage.mockResolvedValue(
      apiOk({ imageUrl: "https://example.com/prop.png" }),
    );

    const result = await generatePropImageTool.execute(
      {
        name: "魔法剑",
        description: "散发蓝色光芒的长剑",
        style: "写实",
        size: "square",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as {
      imageUrl: string;
      name: string;
      prompt: string;
    };
    expect(data.imageUrl).toBe("https://example.com/prop.png");
    expect(data.name).toBe("魔法剑");
    // 验证提示词包含 name 和 description
    expect(data.prompt).toContain("魔法剑");
    expect(data.prompt).toContain("蓝色光芒");
    expect(data.prompt).toContain("写实");
    // 验证 imageProvider 调用
    const genArgs = mocks.imageProvider.generateImage.mock.calls[0];
    expect(genArgs[1]).toBe("prop");
    expect(genArgs[2].purpose).toBe("prop");
    expect(genArgs[2].size).toBe("square");
  });

  it("14. 默认 size 为 square", async () => {
    mocks.imageProvider.generateImage.mockResolvedValue(apiOk({ imageUrl: "url" }));

    await generatePropImageTool.execute(
      { name: "道具", description: "描述" },
      makeCtx(),
    );

    const genArgs = mocks.imageProvider.generateImage.mock.calls[0];
    expect(genArgs[2].size).toBe("square");
  });

  it("15. 图片生成失败时返回错误", async () => {
    mocks.imageProvider.generateImage.mockResolvedValue(apiErr("配额超限"));

    const result = await generatePropImageTool.execute(
      { name: "道具", description: "描述" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("配额超限");
  });
});

// ============================================================
// 4. analyze_image
// ============================================================
describe("analyze_image", () => {
  it("16. 正常分析图片", async () => {
    mocks.imageProvider.analyzeImage.mockResolvedValue(
      apiOk({ analysis: "日式动漫风格，明亮色彩", analyzed: true }),
    );

    const result = await analyzeImageTool.execute(
      {
        imageUrl: "https://example.com/img.png",
        type: "character",
        prompt: "分析色彩搭配",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { analysis: string; analyzed: boolean };
    expect(data.analysis).toBe("日式动漫风格，明亮色彩");
    expect(data.analyzed).toBe(true);
    // 验证 analyzeImage 调用参数
    const args = mocks.imageProvider.analyzeImage.mock.calls[0];
    expect(args[0]).toBe("https://example.com/img.png");
    expect(args[1]).toBe("character");
    expect(args[2]).toBe("分析色彩搭配");
    expect(args[3]).toBeDefined();
  });

  it("17. type 为非法值时传 undefined", async () => {
    mocks.imageProvider.analyzeImage.mockResolvedValue(
      apiOk({ analysis: "分析结果", analyzed: true }),
    );

    await analyzeImageTool.execute(
      { imageUrl: "url", type: "invalid_type" },
      makeCtx(),
    );

    const args = mocks.imageProvider.analyzeImage.mock.calls[0];
    // 非法 type 应被处理为 undefined
    expect(args[1]).toBeUndefined();
  });

  it("18. 分析失败时返回错误", async () => {
    mocks.imageProvider.analyzeImage.mockResolvedValue(apiErr("视觉模型不可用"));

    const result = await analyzeImageTool.execute(
      { imageUrl: "url" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("视觉模型不可用");
  });

  it("19. 错误时使用默认错误信息", async () => {
    mocks.imageProvider.analyzeImage.mockResolvedValue(apiErr(""));

    const result = await analyzeImageTool.execute(
      { imageUrl: "url" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("图片分析失败");
  });
});

// ============================================================
// 5. generate_text
// ============================================================
describe("generate_text", () => {
  it("20. 正常生成文本", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "生成的文本" }));

    const result = await generateTextTool.execute(
      {
        prompt: "写一段开场白",
        maxTokens: 1024,
        temperature: 0.5,
        providerId: "p1",
        modelId: "m1",
      },
      makeCtx(),
    );

    expect(result.success).toBe(true);
    const data = result.data as { text: string };
    expect(data.text).toBe("生成的文本");
    // 验证调用参数
    const args = mocks.textProvider.generateText.mock.calls[0];
    expect(args[0]).toBe("写一段开场白");
    expect(args[1].maxTokens).toBe(1024);
    expect(args[1].temperature).toBe(0.5);
    expect(args[1].providerId).toBe("p1");
    expect(args[1].modelId).toBe("m1");
  });

  it("21. 未提供 maxTokens/temperature 时使用默认值", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiOk({ text: "t" }));

    await generateTextTool.execute({ prompt: "p" }, makeCtx());

    const args = mocks.textProvider.generateText.mock.calls[0];
    expect(args[1].maxTokens).toBe(2048);
    expect(args[1].temperature).toBe(0.7);
  });

  it("22. textProvider 失败时返回错误", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiErr("LLM 故障"));

    const result = await generateTextTool.execute({ prompt: "p" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM 故障");
  });

  it("23. 错误时使用默认错误信息", async () => {
    mocks.textProvider.generateText.mockResolvedValue(apiErr(""));

    const result = await generateTextTool.execute({ prompt: "p" }, makeCtx());

    expect(result.success).toBe(false);
    expect(result.error).toContain("文本生成失败");
  });
});

// ============================================================
// 6. generate_music（音频类降级）
// ============================================================
describe("generate_music", () => {
  it("24. 返回不支持提示和配置建议", async () => {
    const result = await generateMusicTool.execute(
      { prompt: "悬疑紧张的背景音乐", duration: 30 },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置支持音频生成的 provider");
    const data = result.data as { suggestion: string; capability: string };
    expect(data.capability).toBe("音频生成");
    expect(data.suggestion).toContain("Suno");
    expect(data.suggestion).toContain("audio");
  });
});

// ============================================================
// 7. generate_voiceover（音频类降级）
// ============================================================
describe("generate_voiceover", () => {
  it("25. 返回不支持提示和配置建议", async () => {
    const result = await generateVoiceoverTool.execute(
      { text: "旁白文本", voice: "男声", speed: 1.0 },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置支持语音合成的 provider");
    const data = result.data as { suggestion: string; capability: string };
    expect(data.capability).toBe("语音合成");
    expect(data.suggestion).toContain("TTS");
  });
});

// ============================================================
// 8. text_to_speech（CONFIG_MISSING 时优雅降级）
// ============================================================
describe("text_to_speech", () => {
  it("26. CONFIG_MISSING 时返回不支持提示和配置建议", async () => {
    // 模拟未配置 audio 能力：synthesizeSpeech 抛出 CONFIG_MISSING 错误
    mocks.audioProvider.synthesizeSpeech.mockRejectedValue(
      new Error("CONFIG_MISSING: 没有配置 audio 能力的 provider"),
    );

    const result = await textToSpeechTool.execute(
      { text: "转换文本", language: "zh" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置支持文字转语音的 provider");
    const data = result.data as { suggestion: string; capability: string };
    expect(data.capability).toBe("文字转语音");
    expect(data.suggestion).toContain("OpenAI TTS");
  });
});

// ============================================================
// 9. transcribe_audio（CONFIG_MISSING 时优雅降级）
// ============================================================
describe("transcribe_audio", () => {
  it("27. CONFIG_MISSING 时返回不支持提示和配置建议", async () => {
    // 模拟未配置 audio 能力：transcribeAudio 抛出 CONFIG_MISSING 错误
    mocks.audioProvider.transcribeAudio.mockRejectedValue(
      new Error("CONFIG_MISSING: 没有配置 audio 能力的 provider"),
    );

    const result = await transcribeAudioTool.execute(
      { audioUrl: "https://example.com/audio.mp3", language: "zh" },
      makeCtx(),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("未配置支持语音识别的 provider");
    const data = result.data as { suggestion: string; capability: string };
    expect(data.capability).toBe("语音识别");
    expect(data.suggestion).toContain("Whisper");
  });
});

// ============================================================
// 导出数组完整性检查
// ============================================================
describe("generationTools 导出", () => {
  it("28. 应包含全部 9 个工具", () => {
    expect(generationTools).toHaveLength(9);
    const names = generationTools.map((t) => t.def.function.name);
    expect(names).toContain("generate_character_image");
    expect(names).toContain("generate_scene_image");
    expect(names).toContain("generate_prop_image");
    expect(names).toContain("analyze_image");
    expect(names).toContain("generate_text");
    expect(names).toContain("generate_music");
    expect(names).toContain("generate_voiceover");
    expect(names).toContain("text_to_speech");
    expect(names).toContain("transcribe_audio");
  });

  it("29. 所有工具 domain 为 generation", () => {
    for (const tool of generationTools) {
      expect(tool.domain).toBe("generation");
    }
  });
});
