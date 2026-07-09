import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { downloadExport, importData } from "../import-export";
import type { Character, Scene, Story } from "@/domain/schemas";

export interface ProjectData {
  characters: Character[];
  scenes: Scene[];
  stories: Story[];
  exportedAt?: string;
}

export interface ExportResult {
  success: boolean;
  filename?: string;
  error?: string;
}

export function useProjectExport() {
  const [progress, setProgress] = useState(0);

  const exportMutation = useMutation({
    mutationFn: downloadExport,
  });

  const exportProject = async (_options: { includeAssets?: boolean }) => {
    setProgress(50);
    try {
      const result = await exportMutation.mutateAsync();
      setProgress(100);
      if (result.ok) {
        return { success: true, filename: `project-export-${Date.now()}.json` };
      }
      return { success: false, error: result.error?.message || "导出失败" };
    } catch (err) {
      setProgress(0);
      return { success: false, error: err instanceof Error ? err.message : "导出失败" };
    }
  };

  const importProject = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const result = await importData(parsed);
      if (!result.ok) {
        return { success: false, error: result.error.message, blobUrls: [] as string[] };
      }
      return {
        success: true,
        data: {
          characters: (Array.isArray(parsed.characters) ? parsed.characters : []) as Character[],
          scenes: (Array.isArray(parsed.scenes) ? parsed.scenes : []) as Scene[],
          stories: (Array.isArray(parsed.stories) ? parsed.stories : []) as Story[],
          exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
        } as ProjectData,
        blobUrls: [] as string[],
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "导入失败", blobUrls: [] as string[] };
    }
  };

  return {
    exportProject,
    importProject,
    isExporting: exportMutation.isPending,
    progress,
  };
}
