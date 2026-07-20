/**
 * 素材整理与去重工具（Asset Organize Tools）
 *
 * 包含工具：
 * - organize_assets：批量整理素材（排序 + 可选重命名）
 * - deduplicate_assets：去重检测（基于名称相似度）
 *
 * 设计要点：
 * - 调用 characterService / sceneService 的 public API（Result<T> 模式）
 * - 动态 import 避免循环依赖
 * - 使用 Levenshtein 距离归一化算法计算名称相似度
 */

import type { ToolImpl } from "@/domain/types/agent-tools";
import { TOOL_TIMEOUTS } from "@/shared/constants/tool-timeouts";
import { stringSimilarity } from "./asset-crud-tools-helpers";

/** 批量整理素材（排序 + 可选重命名） */
export const organizeAssetsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "organize_assets",
      description:
        "批量整理素材：按名称/风格/类型/创建时间/使用次数排序，并可统一命名格式为「风格-名称-序号」。dryRun=true 仅返回整理建议（不修改数据），dryRun=false 实际更新名称。",
      parameters: {
        type: "object",
        properties: {
          assetType: {
            type: "string",
            enum: ["character", "scene", "all"],
            description: "素材类型，默认 all",
            default: "all",
          },
          sortBy: {
            type: "string",
            enum: ["name", "style", "type", "createdAt", "useCount"],
            description: "排序字段，默认 name",
            default: "name",
          },
          dryRun: {
            type: "boolean",
            description: "是否仅预览不执行，默认 true",
            default: true,
          },
        },
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const assetType = String(args.assetType);
    const sortBy = String(args.sortBy || "name");
    const dryRun = args.dryRun === undefined ? true : Boolean(args.dryRun);

    type Sortable = {
      name: string;
      style?: string;
      type?: string;
      createdAt?: string;
      useCount?: number;
    };

    const sortFn = (a: Sortable, b: Sortable): number => {
      switch (sortBy) {
        case "style":
          return (
            String(a.style ?? "").localeCompare(String(b.style ?? "")) ||
            a.name.localeCompare(b.name)
          );
        case "type":
          return (
            String(a.type ?? "").localeCompare(String(b.type ?? "")) ||
            a.name.localeCompare(b.name)
          );
        case "createdAt":
          return (
            String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
            a.name.localeCompare(b.name)
          );
        case "useCount":
          return (b.useCount ?? 0) - (a.useCount ?? 0) || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    };

    const sorted: Array<{
      id: string;
      oldName: string;
      newName?: string;
      assetType: string;
    }> = [];

    if (assetType === "all" || assetType === "character") {
      const { characterService } = await import("@/modules/character");
      const res = await characterService.getAll();
      if (res.ok) {
        const chars = [...res.value].sort(sortFn);
        for (let i = 0; i < chars.length; i++) {
          const c = chars[i];
          if (!c) continue;
          const newName = `${c.style}-${c.name}-${String(i + 1).padStart(2, "0")}`;
          if (!dryRun && newName !== c.name) {
            await characterService.update(c.id, { id: c.id, name: newName });
          }
          sorted.push({
            id: c.id,
            oldName: c.name,
            newName,
            assetType: "character",
          });
        }
      }
    }

    if (assetType === "all" || assetType === "scene") {
      const { sceneService } = await import("@/modules/scene");
      const res = await sceneService.getAll();
      if (res.ok) {
        const scenes = [...res.value].sort(sortFn);
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          if (!s) continue;
          const newName = `${s.type}-${s.name}-${String(i + 1).padStart(2, "0")}`;
          if (!dryRun && newName !== s.name) {
            await sceneService.update(s.id, { id: s.id, name: newName });
          }
          sorted.push({
            id: s.id,
            oldName: s.name,
            newName,
            assetType: "scene",
          });
        }
      }
    }

    return {
      success: true,
      data: {
        sorted,
        total: sorted.length,
        dryRun,
      },
    };
  },
};

/** 去重检测（检测名称相似度高的素材） */
export const deduplicateAssetsTool: ToolImpl = {
  def: {
    type: "function",
    function: {
      name: "deduplicate_assets",
      description:
        "检测名称相似度高的素材（可能重复）。使用 Levenshtein 距离归一化算法计算名称相似度，返回超过阈值的素材对。仅做检测，不自动删除。",
      parameters: {
        type: "object",
        properties: {
          assetType: {
            type: "string",
            enum: ["character", "scene", "all"],
            description: "素材类型，默认 all",
            default: "all",
          },
          threshold: {
            type: "number",
            description: "相似度阈值（0-1），默认 0.85。越高越严格",
            default: 0.85,
            minimum: 0,
            maximum: 1,
          },
          dryRun: {
            type: "boolean",
            description: "是否仅预览（默认 true，当前仅支持预览检测）",
            default: true,
          },
        },
      },
    },
  },
  domain: "asset",
  dangerLevel: "limited",
  timeoutMs: TOOL_TIMEOUTS.query,
  async execute(args) {
    const assetType = String(args.assetType);
    const threshold = Math.min(Math.max(Number(args.threshold) || 0.85, 0), 1);

    type DuplicatePair = {
      asset1: { id: string; name: string; type: string };
      asset2: { id: string; name: string; type: string };
      similarity: number;
    };

    const duplicates: DuplicatePair[] = [];

    /** 在同类素材中两两比对名称相似度 */
    function findDuplicates(
      items: Array<{ id: string; name: string }>,
      typeLabel: string,
    ): void {
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        if (!a) continue;
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          if (!b) continue;
          const sim = stringSimilarity(
            a.name.toLowerCase(),
            b.name.toLowerCase(),
          );
          if (sim >= threshold) {
            duplicates.push({
              asset1: { id: a.id, name: a.name, type: typeLabel },
              asset2: { id: b.id, name: b.name, type: typeLabel },
              similarity: Math.round(sim * 100) / 100,
            });
          }
        }
      }
    }

    if (assetType === "all" || assetType === "character") {
      const { characterService } = await import("@/modules/character");
      const res = await characterService.getAll();
      if (res.ok) {
        findDuplicates(
          res.value.map((c) => ({ id: c.id, name: c.name })),
          "character",
        );
      }
    }

    if (assetType === "all" || assetType === "scene") {
      const { sceneService } = await import("@/modules/scene");
      const res = await sceneService.getAll();
      if (res.ok) {
        findDuplicates(
          res.value.map((s) => ({ id: s.id, name: s.name })),
          "scene",
        );
      }
    }

    return {
      success: true,
      data: {
        duplicates,
        total: duplicates.length,
      },
    };
  },
};
