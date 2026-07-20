/**
 * Face Embedding 模型配置 Hook
 *
 * 职责：
 * - 加载 / 保存 faceEmbeddingModelPath 配置（通过 @/shared/file-http）
 * - 提供"测试模型"功能（调用 verifyFaceModelIntegrity 静态校验）
 * - 提供"浏览文件"功能（通过 openFileDialog 选择目录中的 config.json，自动提取目录）
 *
 * 不直接调用 electronAPI.*（除 openFileDialog 之外），所有文件/配置操作走 file-http。
 */

import { useState, useEffect, useCallback } from "react";
import { getConfig, setConfig } from "@/shared/file-http";
import {
  verifyFaceModelIntegrity,
  type FaceModelIntegrityResult,
} from "@/shared/embedding";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { t } from "@/shared/constants";

/** 测试模型时的校验状态 */
export type VerifyStatus =
  | { kind: "idle" }
  | { kind: "verifying" }
  | { kind: "ok"; result: FaceModelIntegrityResult }
  | { kind: "error"; message: string };

/** useFaceEmbeddingModel 的返回值 */
export interface FaceEmbeddingModelHandlers {
  /** 当前已保存的模型路径（null=未配置） */
  savedPath: string | null;
  /** 输入框中的路径（编辑态） */
  inputPath: string;
  /** setInputPath */
  setInputPath: (v: string) => void;
  /** 加载已保存路径（初始化时调用） */
  loadSavedPath: () => Promise<void>;
  /** 浏览文件，选择目录中的 config.json 后自动提取目录 */
  handleBrowse: () => Promise<void>;
  /** 测试当前 inputPath 对应的模型目录完整性 */
  handleVerify: () => Promise<void>;
  /** 保存 inputPath 到配置（空字符串视为清除） */
  handleSave: () => Promise<void>;
  /** 清除配置 + 输入框 */
  handleClear: () => Promise<void>;
  /** 测试状态 */
  verifyStatus: VerifyStatus;
  /** 是否正在保存 */
  saving: boolean;
}

/**
 * 从文件路径提取所在目录（兼容 Windows 反斜杠与 POSIX 正斜杠）。
 *
 * 例：
 *   "C:\\Users\\me\\model\\config.json" → "C:\\Users\\me\\model"
 *   "/home/me/model/config.json"       → "/home/me/model"
 */
function extractDirectory(filePath: string): string {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return "";
  return filePath.slice(0, filePath.length - (normalized.length - lastSlash));
}

/** openFileDialog 的返回值类型（兼容 electron API） */
interface OpenFileDialogResult {
  success?: boolean;
  canceled?: boolean;
  filePaths?: string[];
}

interface ElectronDialogAPI {
  openFileDialog?: (options?: Record<string, unknown>) => Promise<OpenFileDialogResult | string[]>;
}

function getElectronDialogAPI(): ElectronDialogAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as unknown as { electronAPI?: ElectronDialogAPI }).electronAPI;
  return api ?? null;
}

/** face embedding 模型配置 Hook */
export function useFaceEmbeddingModel(): FaceEmbeddingModelHandlers {
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState<string>("");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const { success, error: showError } = useToastHelpers();

  const loadSavedPath = useCallback(async () => {
    try {
      const value = (await getConfig("faceEmbeddingModelPath")) as string | null | undefined;
      const path = value ?? null;
      setSavedPath(path);
      setInputPath(path ?? "");
    } catch (e) {
      errorLogger.warn("[face-embedding-model] 加载已保存路径失败", e);
    }
  }, []);

  useEffect(() => {
    void loadSavedPath();
  }, [loadSavedPath]);

  const handleBrowse = useCallback(async () => {
    const api = getElectronDialogAPI();
    if (!api?.openFileDialog) {
      showError(
        t("settings.faceEmbeddingModelBrowseFailedTitle"),
        t("settings.faceEmbeddingModelDialogNotSupported"),
      );
      return;
    }
    try {
      const result = await api.openFileDialog({
        filters: [{ name: "Model Config", extensions: ["json"] }],
        title: t("settings.faceEmbeddingModelBrowseTitle"),
      });
      // 兼容两种返回格式
      const filePaths = Array.isArray(result)
        ? result
        : result.canceled || !result.filePaths
          ? []
          : result.filePaths;
      if (filePaths.length === 0) return;
      const dir = extractDirectory(filePaths[0]!);
      if (dir) {
        setInputPath(dir);
        setVerifyStatus({ kind: "idle" });
      }
    } catch (e) {
      showError(
        t("settings.faceEmbeddingModelBrowseFailedTitle"),
        e instanceof Error ? e.message : String(e),
      );
    }
  }, [showError]);

  const handleVerify = useCallback(async () => {
    const dir = inputPath.trim();
    if (!dir) {
      setVerifyStatus({ kind: "error", message: t("settings.faceEmbeddingModelPathEmpty") });
      return;
    }
    setVerifyStatus({ kind: "verifying" });
    try {
      const result = await verifyFaceModelIntegrity(dir);
      if (result.ok) {
        setVerifyStatus({ kind: "ok", result });
      } else {
        setVerifyStatus({ kind: "error", message: result.error ?? t("settings.faceEmbeddingModelVerifyFailed") });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setVerifyStatus({ kind: "error", message });
    }
  }, [inputPath]);

  const handleSave = useCallback(async () => {
    const dir = inputPath.trim();
    setSaving(true);
    try {
      const ok = await setConfig("faceEmbeddingModelPath", dir || null);
      if (!ok) {
        showError(
          t("settings.faceEmbeddingModelSaveFailedTitle"),
          t("settings.faceEmbeddingModelSaveFailedMessage"),
        );
        return;
      }
      setSavedPath(dir || null);
      success(
        t("settings.faceEmbeddingModelSavedTitle"),
        dir
          ? t("settings.faceEmbeddingModelSavedMessage", { path: dir })
          : t("settings.faceEmbeddingModelClearedMessage"),
      );
    } catch (e) {
      errorLogger.warn("[face-embedding-model] 保存配置失败", e);
      showError(
        t("settings.faceEmbeddingModelSaveFailedTitle"),
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      setSaving(false);
    }
  }, [inputPath, success, showError]);

  const handleClear = useCallback(async () => {
    setInputPath("");
    setVerifyStatus({ kind: "idle" });
    setSaving(true);
    try {
      const ok = await setConfig("faceEmbeddingModelPath", null);
      if (!ok) {
        showError(
          t("settings.faceEmbeddingModelSaveFailedTitle"),
          t("settings.faceEmbeddingModelSaveFailedMessage"),
        );
        return;
      }
      setSavedPath(null);
      success(
        t("settings.faceEmbeddingModelClearedTitle"),
        t("settings.faceEmbeddingModelClearedMessage"),
      );
    } catch (e) {
      errorLogger.warn("[face-embedding-model] 清除配置失败", e);
    } finally {
      setSaving(false);
    }
  }, [success, showError]);

  return {
    savedPath,
    inputPath,
    setInputPath,
    loadSavedPath,
    handleBrowse,
    handleVerify,
    handleSave,
    handleClear,
    verifyStatus,
    saving,
  };
}
