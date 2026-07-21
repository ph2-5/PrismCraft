import type { Result } from "@/domain/types";
import { fromAsyncThrowable } from "@/domain/types";
import type { StoryBeat, ShotInstruction } from "@/domain/schemas";
import { extractErrorMessage } from "@/shared/error-logger";
import { t } from "@/shared/constants";
import { buildShotInstructionFromLegacy } from "@/shared-logic/prompt";

export interface StoryboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  genre: string;
  tone: string;
  tags: string[];
  author: string;
  beats: StoryboardTemplateBeat[];
  totalDuration: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface StoryboardTemplateBeat {
  type: string;
  title: string;
  content: string;
  duration: number;
  shotType?: string;
  cameraAngle?: string;
  cameraMovement?: string;
  cameraDistance?: string;
  cameraSpeed?: string;
  imageGenerationPrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
}

export function createTemplateFromBeats(
  name: string,
  description: string,
  beats: StoryBeat[],
  options?: {
    category?: string;
    genre?: string;
    tone?: string;
    tags?: string[];
    author?: string;
  },
): StoryboardTemplate {
  const now = Date.now();
  return {
    id: `tpl_${now}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    description,
    category: options?.category || "custom",
    genre: options?.genre || "",
    tone: options?.tone || "",
    tags: options?.tags || [],
    author: options?.author || "",
    beats: beats.map((beat) => ({
      type: beat.type || "scene",
      title: beat.title || "",
      content: beat.content || beat.description || "",
      duration: beat.duration || 5,
      // PR 3：清除旧字段 fallback（依赖 migration v8 已迁移数据）
      shotType: beat.shotInstruction?.shotSize,
      cameraAngle: beat.shotInstruction?.cameraAngle,
      cameraMovement: beat.shotInstruction?.cameraMovement,
      cameraDistance: beat.camera?.distance,
      cameraSpeed: beat.camera?.speed,
      imageGenerationPrompt: beat.imageGenerationPrompt,
      firstFramePrompt: beat.firstFramePrompt,
      lastFramePrompt: beat.lastFramePrompt,
    })),
    totalDuration: beats.reduce((sum, b) => sum + (b.duration || 5), 0),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyTemplateToBeats(
  template: StoryboardTemplate,
): Array<Partial<StoryBeat>> {
  return template.beats.map((beat, index) => {
    // PR 2d Step 4a：清除写入端 dual-write — 只写 shotInstruction，不写旧 shotType/camera.angle/movement
    // 旧字段通过 buildShotInstructionFromLegacy 转换为 shotInstruction
    const shotInstruction = buildShotInstructionFromLegacy({
      shotType: beat.shotType,
      cameraAngle: beat.cameraAngle,
      cameraMovement: beat.cameraMovement,
    }) as ShotInstruction | undefined;
    return {
      type: beat.type as StoryBeat["type"],
      title: beat.title,
      content: beat.content,
      description: beat.content,
      duration: beat.duration,
      order: index,
      // camera 只保留独有字段（distance/speed），angle/movement 已迁移到 shotInstruction
      camera: {
        distance: beat.cameraDistance,
        speed: beat.cameraSpeed,
      },
      shotInstruction,
      imageGenerationPrompt: beat.imageGenerationPrompt,
      firstFramePrompt: beat.firstFramePrompt,
      lastFramePrompt: beat.lastFramePrompt,
    };
  });
}

export function exportTemplateToFile(template: StoryboardTemplate): void {
  const json = JSON.stringify(template, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${template.name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}_${template.id}.astpl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importTemplateFromFile(
  file: File,
): Promise<Result<StoryboardTemplate>> {
  return fromAsyncThrowable(() => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result !== "string") {
          throw new Error(t("error.fileReadFailed"));
        }
        const data = JSON.parse(result);
        if (!data.name || !Array.isArray(data.beats)) {
          throw new Error(t("error.invalidTemplateFormat"));
        }
        const template: StoryboardTemplate = {
          id: data.id || `tpl_${Date.now()}_imported`,
          name: data.name,
          description: data.description || "",
          category: data.category || "imported",
          genre: data.genre || "",
          tone: data.tone || "",
          tags: Array.isArray(data.tags) ? data.tags : [],
          author: data.author || "",
          beats: data.beats,
          totalDuration: data.totalDuration || data.beats.reduce((s: number, b: { duration?: number }) => s + (b.duration || 5), 0),
          version: data.version || 1,
          createdAt: data.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        resolve(template);
      } catch (error) {
        reject(new Error(t("error.templateParseFailed") + ": " + extractErrorMessage(error)));
      }
    };
    reader.onerror = () => reject(new Error(t("error.fileReadFailed")));
    reader.readAsText(file);
  }));
}

export function exportMultipleTemplates(
  templates: StoryboardTemplate[],
): void {
  const json = JSON.stringify(
    { format: "astpl-batch", version: 1, templates },
    null,
    2,
  );
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `templates_batch_${Date.now()}.astpl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importTemplatesFromFile(
  file: File,
): Promise<Result<StoryboardTemplate[]>> {
  return fromAsyncThrowable(() => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result !== "string") {
          throw new Error(t("error.fileReadFailed"));
        }
        const data = JSON.parse(result);
        if (data.format === "astpl-batch" && Array.isArray(data.templates)) {
          resolve(data.templates);
        } else if (data.name && Array.isArray(data.beats)) {
          resolve([data as StoryboardTemplate]);
        } else {
          throw new Error(t("error.invalidTemplateFormat"));
        }
      } catch (error) {
        reject(new Error(t("error.templateParseFailed") + ": " + (error as Error).message));
      }
    };
    reader.onerror = () => reject(new Error(t("error.fileReadFailed")));
    reader.readAsText(file);
  }));
}
