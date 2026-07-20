/**
 * 模板工具 - 辅助函数与类型定义
 *
 * 从 template-tools.ts 拆分而来，目的：
 * - 降低主文件行数（原 726 行 > max-lines 500）
 * - 提供 create/apply/import/export 共用的辅助逻辑
 */

/** 模板内容结构（存储在 astFilePath 指向的 JSON 文件中） */
export interface TemplateContent {
  name: string;
  description: string;
  category: string;
  genre?: string;
  tone?: string;
  characters?: Array<Record<string, unknown>>;
  scenes?: Array<Record<string, unknown>>;
  beats?: Array<Record<string, unknown>>;
  story?: Record<string, unknown> | null;
}

/** 生成模板 ID */
export function generateTemplateId(): string {
  return `ast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 从 AST 模板记录中提取精简字段（DB 行 → 列表项） */
export function toTemplateListItem(record: Record<string, unknown>) {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    category: record.category !== undefined && record.category !== null ? String(record.category) : undefined,
    description: record.description !== undefined && record.description !== null ? String(record.description) : undefined,
    genre: record.genre !== undefined && record.genre !== null ? String(record.genre) : undefined,
    tone: record.tone !== undefined && record.tone !== null ? String(record.tone) : undefined,
    beatsCount: record.beats_count !== undefined ? Number(record.beats_count) : (record.beatsCount !== undefined ? Number(record.beatsCount) : undefined),
    usageCount: record.usage_count !== undefined ? Number(record.usage_count) : 0,
  };
}

/** 读取 astFilePath 指向的模板内容文件 */
export async function readTemplateContent(astFilePath: string): Promise<TemplateContent | null> {
  const { readFile } = await import("@/shared/file-http");
  const result = await readFile(astFilePath);
  if (!result || !result.success || !result.data) {
    return null;
  }
  try {
    const text = new TextDecoder().decode(result.data);
    return JSON.parse(text) as TemplateContent;
  } catch {
    return null;
  }
}

/** 将模板内容写入缓存目录，返回文件路径 */
export async function writeTemplateContent(
  templateId: string,
  content: TemplateContent,
): Promise<{ path: string; size: number }> {
  const { writeFile, getCacheDirectory } = await import("@/shared/file-http");
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    throw new Error("Failed to get cache directory");
  }
  const path = `${dirResult.path}/templates/${templateId}.json`;
  const jsonStr = JSON.stringify(content, null, 2);
  const encoded = new TextEncoder().encode(jsonStr);
  const writeResult = await writeFile(path, encoded.buffer.slice(0, encoded.byteLength) as ArrayBuffer);
  if (!writeResult.success) {
    throw new Error(`Failed to write template content: ${writeResult.error ?? "unknown error"}`);
  }
  return { path, size: encoded.byteLength };
}

/** 校验模板内容结构（导入时） */
export function validateTemplateContent(data: unknown): data is TemplateContent {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return false;
  if (typeof obj.description !== "string") return false;
  if (typeof obj.category !== "string") return false;
  return true;
}

/** 获取模板元数据，失败时返回错误信息 */
export async function getTemplateMeta(
  templateId: string,
  storage: { getASTTemplate(id: string): Promise<Record<string, unknown> | null> },
): Promise<{ ok: true; meta: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const meta = await storage.getASTTemplate(templateId);
    if (!meta) {
      return { ok: false, error: `模板不存在：${templateId}` };
    }
    return { ok: true, meta };
  } catch (e) {
    return { ok: false, error: `获取模板失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 从元数据构建最小模板内容（内容文件缺失时的回退） */
export function buildMinimalContent(meta: Record<string, unknown>): TemplateContent {
  return {
    name: String(meta.name ?? "未命名模板"),
    description: String(meta.description ?? ""),
    category: String(meta.category ?? "custom"),
    genre: meta.genre !== undefined && meta.genre !== null ? String(meta.genre) : undefined,
    tone: meta.tone !== undefined && meta.tone !== null ? String(meta.tone) : undefined,
    characters: [],
    scenes: [],
    beats: [],
    story: null,
  };
}

/** 加载模板内容（优先读取内容文件，否则从元数据构建） */
export async function loadTemplateContent(meta: Record<string, unknown>): Promise<TemplateContent> {
  const astFilePath = meta.astFilePath ?? meta.ast_file_path;
  if (typeof astFilePath === "string" && astFilePath) {
    const content = await readTemplateContent(astFilePath);
    if (content) return content;
  }
  return buildMinimalContent(meta);
}

/** 从模板内容创建角色，返回创建成功的 ID 列表 */
export async function createCharactersFromTemplate(content: TemplateContent): Promise<string[]> {
  if (!content.characters || content.characters.length === 0) return [];
  const { characterService } = await import("@/modules/character");
  const createdIds: string[] = [];
  for (const charData of content.characters) {
    const input: Record<string, unknown> = {
      name: String(charData.name ?? `角色_${createdIds.length + 1}`),
      description: charData.description !== undefined ? String(charData.description) : "",
      gender: charData.gender !== undefined ? String(charData.gender) : "",
      style: charData.style !== undefined ? String(charData.style) : "",
      age: charData.age !== undefined ? Number(charData.age) : undefined,
      tags: Array.isArray(charData.tags) ? charData.tags.map(String) : undefined,
    };
    const result = await characterService.create(input as never);
    if (result.ok) {
      createdIds.push(result.value.id);
    }
  }
  return createdIds;
}

/** 从模板内容创建场景，返回创建成功的 ID 列表 */
export async function createScenesFromTemplate(content: TemplateContent): Promise<string[]> {
  if (!content.scenes || content.scenes.length === 0) return [];
  const { sceneService } = await import("@/modules/scene");
  const createdIds: string[] = [];
  for (const sceneData of content.scenes) {
    const input: Record<string, unknown> = {
      name: String(sceneData.name ?? `场景_${createdIds.length + 1}`),
      description: sceneData.description !== undefined ? String(sceneData.description) : "",
      type: sceneData.type !== undefined ? String(sceneData.type) : "",
      timeOfDay: sceneData.timeOfDay !== undefined ? String(sceneData.timeOfDay) : "",
      weather: sceneData.weather !== undefined ? String(sceneData.weather) : "",
      mood: sceneData.mood !== undefined ? String(sceneData.mood) : "",
      tags: Array.isArray(sceneData.tags) ? sceneData.tags.map(String) : undefined,
    };
    const result = await sceneService.create(input as never);
    if (result.ok) {
      createdIds.push(result.value.id);
    }
  }
  return createdIds;
}

/** 创建新故事或合并到已有故事，返回故事 ID */
export async function createOrUpdateStory(
  content: TemplateContent,
  targetStoryId: string | undefined,
  createdCharacters: string[],
  createdScenes: string[],
  applyStyle: boolean,
): Promise<string | undefined> {
  const { storyService } = await import("@/modules/storyboard");
  if (targetStoryId) {
    return await mergeIntoExistingStory(storyService, targetStoryId, createdCharacters, createdScenes);
  }
  return await createNewStoryFromTemplate(storyService, content, createdCharacters, createdScenes, applyStyle);
}

/** 合并到已有故事（仅更新角色/场景关联） */
async function mergeIntoExistingStory(
  storyService: { getById(id: string): Promise<unknown>; update(id: string, input: Record<string, unknown>): Promise<unknown> },
  targetStoryId: string,
  createdCharacters: string[],
  createdScenes: string[],
): Promise<string | undefined> {
  const existingRes = await storyService.getById(targetStoryId) as { ok: boolean; value?: { characters?: string[]; scenes?: string[] } };
  if (!existingRes.ok) return undefined;
  const existing = existingRes.value;
  const mergedCharacters = [...new Set([...(existing?.characters ?? []), ...createdCharacters])];
  const mergedScenes = [...new Set([...(existing?.scenes ?? []), ...createdScenes])];
  await storyService.update(targetStoryId, {
    id: targetStoryId,
    characters: mergedCharacters,
    scenes: mergedScenes,
  });
  return targetStoryId;
}

/** 创建新故事 */
async function createNewStoryFromTemplate(
  storyService: { create(input: Record<string, unknown>): Promise<unknown> },
  content: TemplateContent,
  createdCharacters: string[],
  createdScenes: string[],
  applyStyle: boolean,
): Promise<string | undefined> {
  const storyTitle = content.story?.title
    ? String(content.story.title)
    : `${content.name} - 故事`;
  const storyInput: Record<string, unknown> = {
    title: storyTitle,
    description: content.description,
    characters: createdCharacters,
    scenes: createdScenes,
    beats: [],
    elementIds: [],
  };
  if (applyStyle) {
    if (content.genre) storyInput.genre = content.genre;
    if (content.tone) storyInput.tone = content.tone;
  }
  const storyResult = await storyService.create(storyInput as never) as { ok: boolean; value?: { id: string } };
  return storyResult.ok ? storyResult.value?.id : undefined;
}

// ============= create_template 辅助函数 =============

interface CreateTemplateParams {
  name: string;
  description: string;
  category: string;
  includeCharacters: boolean;
  includeScenes: boolean;
  includeBeats: boolean;
  sourceStoryId?: string;
}

/** 收集角色 */
async function collectCharactersForTemplate(include: boolean): Promise<Array<Record<string, unknown>>> {
  if (!include) return [];
  const { characterService } = await import("@/modules/character");
  const res = await characterService.getAll();
  if (!res.ok) return [];
  return res.value.map((c) => ({
    name: c.name,
    description: c.description,
    gender: c.gender,
    style: c.style,
    age: c.age,
    tags: c.tags,
  }));
}

/** 收集场景 */
async function collectScenesForTemplate(include: boolean): Promise<Array<Record<string, unknown>>> {
  if (!include) return [];
  const { sceneService } = await import("@/modules/scene");
  const res = await sceneService.getAll();
  if (!res.ok) return [];
  return res.value.map((s) => ({
    name: s.name,
    description: s.description,
    type: s.type,
    timeOfDay: s.timeOfDay,
    weather: s.weather,
    mood: s.mood,
    tags: s.tags,
  }));
}

interface StoryTemplateData {
  beats: Array<Record<string, unknown>>;
  story: Record<string, unknown> | null;
  totalDuration: number;
}

/** 收集故事节拍和元数据 */
async function collectStoryForTemplate(
  include: boolean,
  sourceStoryId?: string,
): Promise<StoryTemplateData> {
  if (!include) {
    return { beats: [], story: null, totalDuration: 0 };
  }
  const { storyService } = await import("@/modules/storyboard");
  const storyRecord = await fetchStoryRecord(storyService, sourceStoryId);
  if (!storyRecord) {
    return { beats: [], story: null, totalDuration: 0 };
  }
  return buildStoryTemplateData(storyRecord);
}

/** 获取故事记录（按 ID 或最新） */
async function fetchStoryRecord(
  storyService: { getById(id: string): Promise<unknown>; getAll(): Promise<unknown> },
  sourceStoryId?: string,
): Promise<Record<string, unknown> | undefined> {
  if (sourceStoryId) {
    const res = await storyService.getById(sourceStoryId) as { ok: boolean; value?: Record<string, unknown> };
    return res.ok ? res.value : undefined;
  }
  const res = await storyService.getAll() as { ok: boolean; value?: Array<Record<string, unknown>> };
  if (res.ok && res.value && res.value.length > 0) {
    return res.value[res.value.length - 1];
  }
  return undefined;
}

/** 从故事记录构建模板数据 */
function buildStoryTemplateData(storyRecord: Record<string, unknown>): StoryTemplateData {
  const story = {
    title: storyRecord.title,
    description: storyRecord.description,
    genre: storyRecord.genre,
    tone: storyRecord.tone,
    targetDuration: storyRecord.targetDuration,
  };
  const beats = (storyRecord.beats as Array<Record<string, unknown>> | undefined ?? []).map((b) => ({
    title: b.title,
    description: b.description,
    type: b.type,
    duration: b.duration,
    content: b.content,
  }));
  const totalDuration = storyRecord.targetDuration !== undefined
    ? Number(storyRecord.targetDuration)
    : beats.reduce((sum, b) => sum + (Number(b.duration) || 0), 0);
  return { beats, story, totalDuration };
}

/**
 * 从当前项目收集模板所需全部素材（角色/场景/故事节拍）。
 * 返回构建好的 TemplateContent（不含 name/description/category，由调用方补齐）。
 */
export async function collectProjectForTemplate(
  params: CreateTemplateParams,
): Promise<{
  characters: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  beats: Array<Record<string, unknown>>;
  story: Record<string, unknown> | null;
  totalDuration: number;
  genre?: string;
  tone?: string;
}> {
  const [characters, scenes, storyData] = await Promise.all([
    collectCharactersForTemplate(params.includeCharacters),
    collectScenesForTemplate(params.includeScenes),
    collectStoryForTemplate(params.includeBeats, params.sourceStoryId),
  ]);
  return {
    characters,
    scenes,
    beats: storyData.beats,
    story: storyData.story,
    totalDuration: storyData.totalDuration,
    genre: (storyData.story?.genre as string | undefined) ?? undefined,
    tone: (storyData.story?.tone as string | undefined) ?? undefined,
  };
}

// ============= import_template 辅助函数 =============

/** 解析模板输入（文件路径或 JSON 字符串），返回 rawContent 或错误 */
export async function parseTemplateInput(
  templatePath: string | undefined,
  templateJson: string | undefined,
): Promise<{ ok: true; content: unknown } | { ok: false; error: string }> {
  if (templatePath) {
    return await parseTemplateFromPath(templatePath);
  }
  if (templateJson) {
    return parseTemplateJsonString(templateJson);
  }
  return { ok: false, error: "需提供 templatePath 或 templateJson 之一" };
}

/** 从文件路径解析模板 */
async function parseTemplateFromPath(
  templatePath: string,
): Promise<{ ok: true; content: unknown } | { ok: false; error: string }> {
  const { readFile } = await import("@/shared/file-http");
  const result = await readFile(templatePath);
  if (!result || !result.success || !result.data) {
    return { ok: false, error: `读取模板文件失败：${result?.error ?? "文件不存在或不可读"}` };
  }
  const text = new TextDecoder().decode(result.data);
  try {
    return { ok: true, content: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: `模板 JSON 解析失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

/** 从 JSON 字符串解析模板 */
function parseTemplateJsonString(
  templateJson: string,
): { ok: true; content: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, content: JSON.parse(templateJson) };
  } catch (e) {
    return { ok: false, error: `templateJson 解析失败：${e instanceof Error ? e.message : String(e)}` };
  }
}

// ============= export_template 辅助函数 =============

/** 从模板元数据构建导出 JSON（无内容文件时使用） */
export function buildMetaExportJson(meta: Record<string, unknown>): string {
  return JSON.stringify(
    {
      name: String(meta.name ?? ""),
      description: meta.description ?? "",
      category: meta.category ?? "custom",
      genre: meta.genre,
      tone: meta.tone,
      beatsCount: meta.beats_count ?? meta.beatsCount,
      charactersCount: meta.characters_count ?? meta.charactersCount,
      scenesCount: meta.scenes_count ?? meta.scenesCount,
    },
    null,
    2,
  );
}

/** 解析导出输出路径（未指定时使用缓存目录） */
export async function resolveExportPath(
  templateId: string,
  templateName: string,
  outputPath?: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (outputPath) {
    return { ok: true, path: outputPath };
  }
  const { getCacheDirectory } = await import("@/shared/file-http");
  const dirResult = await getCacheDirectory();
  if (!dirResult.success || !dirResult.path) {
    return { ok: false, error: "获取缓存目录失败" };
  }
  const safeName = templateName.replace(/[^\w\u4e00-\u9fa5-]/g, "_");
  return { ok: true, path: `${dirResult.path}/templates/${templateId}_${safeName}.json` };
}
