/**
 * Task 2A.4 — Step 1: 文本粘贴/上传
 *
 * 提供 textarea 粘贴小说文本，以及 .txt 文件上传按钮。
 * 导入后调用 onImport(text) 通知父组件。
 *
 * 文件上传：使用 FileReader 读取 .txt 文件为 text/plain。
 */

import { useState, useCallback, useRef } from "react";
import { Upload, FileText } from "lucide-react";
import { t } from "@/shared/constants";

export interface ImportStepProps {
  onImport: (text: string) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function ImportStep({ onImport }: ImportStepProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (error) setError(null);
  }, [error]);

  const handleImport = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      setError(t("novel.import.textareaPlaceholder"));
      return;
    }
    onImport(trimmed);
  }, [text, onImport]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError(`文件过大（${Math.round(file.size / 1024 / 1024)}MB），最大支持 5MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === "string") {
        setText(result);
        if (error) setError(null);
      }
    };
    reader.onerror = () => {
      setError("文件读取失败");
    };
    reader.readAsText(file, "utf-8");
    // 重置 input 允许重复选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [error]);

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto w-full">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(var(--primary-rgb),0.1)] mb-3">
          <FileText size={20} className="text-[var(--primary)]" />
        </div>
        <h2 className="text-lg font-bold">{t("novel.import.title")}</h2>
        <p className="text-[12px] text-muted-foreground mt-1">
          {t("novel.import.textareaPlaceholder")}
        </p>
      </div>

      <textarea
        value={text}
        onChange={handleTextChange}
        placeholder={t("novel.import.textareaPlaceholder")}
        className="w-full h-72 p-3 rounded-md border border-border bg-background text-[13px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        aria-label={t("novel.import.title")}
      />

      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">
          {text.length > 0 && t("novel.import.charCount", { count: text.length })}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-ghost text-[12px] px-3 py-1.5 flex items-center gap-1.5"
          >
            <Upload size={12} />
            {t("novel.import.uploadFile")}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!text.trim()}
            className={[
              "btn text-[12px] px-4 py-1.5",
              text.trim() ? "btn-primary" : "btn-muted cursor-not-allowed opacity-60",
            ].join(" ")}
          >
            {t("novel.import.startSegment")}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-destructive bg-destructive/10 px-3 py-2 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
