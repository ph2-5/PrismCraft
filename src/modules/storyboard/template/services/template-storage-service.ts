/**
 * Template Storage Service
 *
 * 故事模板持久化的业务逻辑层。薄封装 container.storyTemplateStorage，
 * 负责 StoryTemplateRecord ↔ StoryboardTemplate 的类型转换，并提供 Result 返回类型。
 *
 * 通过 DI container 访问 storage，禁止直接导入 infrastructure/storage。
 *
 * 依赖方向：@/domain/types + @/infrastructure/di + 同模块 storyboard-template 类型
 */

import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import { container } from "@/infrastructure/di";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import type { StoryboardTemplate, StoryboardTemplateBeat } from "./storyboard-template";

/** StoryTemplateRecord → StoryboardTemplate（类型断言 beats/tags） */
function recordToTemplate(record: {
  id: string;
  name: string;
  description: string;
  beats: unknown[];
  category: string;
  genre: string;
  tone: string;
  tags: unknown[];
  author: string;
  totalDuration: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}): StoryboardTemplate {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    beats: record.beats as StoryboardTemplateBeat[],
    category: record.category,
    genre: record.genre,
    tone: record.tone,
    tags: record.tags as string[],
    author: record.author,
    totalDuration: record.totalDuration,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** 获取所有已保存的模板 */
export async function getAllSavedTemplates(): Promise<Result<StoryboardTemplate[]>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return [];
    const records = await container.storyTemplateStorage.getAllTemplates();
    return records.map(recordToTemplate);
  });
}

/** 获取单个模板 */
export async function getSavedTemplateById(id: string): Promise<Result<StoryboardTemplate | null>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return null;
    const record = await container.storyTemplateStorage.getTemplateById(id);
    return record ? recordToTemplate(record) : null;
  });
}

/** 创建/保存模板（若 id 已存在则替换） */
export async function saveSavedTemplate(template: StoryboardTemplate): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return;
    try {
      await container.storyTemplateStorage.createTemplate({
        id: template.id,
        name: template.name,
        description: template.description,
        beats: template.beats,
        category: template.category,
        genre: template.genre,
        tone: template.tone,
        tags: template.tags,
        author: template.author,
        totalDuration: template.totalDuration,
        version: template.version,
        createdAt: template.createdAt,
      });
    } catch (error) {
      errorLogger.error({ code: "SAVE_TEMPLATE_ERROR", message: t("error.saveFailed"), cause: error });
      throw error;
    }
  });
}

/** 更新模板（部分更新） */
export async function updateSavedTemplate(id: string, patch: Partial<StoryboardTemplate>): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return;
    await container.storyTemplateStorage.updateTemplate(id, patch);
  });
}

/** 删除模板（软删除） */
export async function deleteSavedTemplate(id: string): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return;
    try {
      await container.storyTemplateStorage.deleteTemplate(id);
    } catch (error) {
      errorLogger.error({ code: "DELETE_TEMPLATE_ERROR", message: t("error.deleteFailed"), cause: error });
      throw error;
    }
  });
}

/** 删除所有模板（物理删除，用于测试/重置） */
export async function deleteAllSavedTemplates(): Promise<Result<void>> {
  return fromAsyncThrowable(async () => {
    if (typeof window === "undefined") return;
    await container.storyTemplateStorage.deleteAllTemplates();
  });
}
