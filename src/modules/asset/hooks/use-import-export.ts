import { useMutation } from "@tanstack/react-query";
import { importData, downloadExport, importFromFile } from "../import-export";
import type { MergeStrategy } from "../import-export";

export function useExportData() {
  return useMutation({
    mutationFn: downloadExport,
  });
}

export function useDownloadExport() {
  return useMutation({
    mutationFn: downloadExport,
  });
}

export function useImportData() {
  return useMutation({
    mutationFn: ({ data, mergeStrategy }: { data: unknown; mergeStrategy?: MergeStrategy }) =>
      importData(data, { mergeStrategy }),
  });
}

export function useImportFromFile() {
  return useMutation({
    mutationFn: (file: File) => importFromFile(file),
  });
}
