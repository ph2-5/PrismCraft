"use client";

import { useState, useRef } from "react";
import {
  X,
  Download,
  Upload,
  Plus,
  Trash2,
  FileText,
  Film,
  Clock,
  Tag,
} from "lucide-react";
import type { StoryBeat } from "@/domain/schemas";
import {
  type StoryboardTemplate,
  createTemplateFromBeats,
  applyTemplateToBeats,
  exportTemplateToFile,
  importTemplateFromFile,
} from "@/modules/story";
import { exportMultipleTemplates } from "../services/storyboard-template";

interface TemplateManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentBeats: StoryBeat[];
  onApplyTemplate: (beats: Array<Partial<StoryBeat>>) => void;
  savedTemplates: StoryboardTemplate[];
  onSaveTemplate: (template: StoryboardTemplate) => void;
  onDeleteTemplate: (id: string) => void;
}

const TEMPLATE_CATEGORIES = [
  { value: "custom", label: "自定义" },
  { value: "film", label: "电影" },
  { value: "animation", label: "动画" },
  { value: "commercial", label: "广告" },
  { value: "documentary", label: "纪录片" },
  { value: "music-video", label: "MV" },
  { value: "other", label: "其他" },
];

export default function TemplateManagerDialog({
  isOpen,
  onClose,
  currentBeats,
  onApplyTemplate,
  savedTemplates,
  onSaveTemplate,
  onDeleteTemplate,
}: TemplateManagerDialogProps) {
  const [activeTab, setActiveTab] = useState<"save" | "load" | "import">("load");
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateCategory, setTemplateCategory] = useState("custom");
  const [templateGenre, setTemplateGenre] = useState("");
  const [templateTone, setTemplateTone] = useState("");
  const [templateTags, setTemplateTags] = useState("");
  const [importError, setImportError] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<StoryboardTemplate | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!templateName.trim()) return;
    const template = createTemplateFromBeats(
      templateName.trim(),
      templateDesc.trim(),
      currentBeats,
      {
        category: templateCategory,
        genre: templateGenre.trim(),
        tone: templateTone.trim(),
        tags: templateTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
    );
    onSaveTemplate(template);
    setTemplateName("");
    setTemplateDesc("");
    setTemplateCategory("custom");
    setTemplateGenre("");
    setTemplateTone("");
    setTemplateTags("");
    setActiveTab("load");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError("");
    const result = await importTemplateFromFile(file);
    if (result.ok) {
      onSaveTemplate(result.value);
      setActiveTab("load");
    } else {
      setImportError(result.error instanceof Error ? result.error.message : "导入失败");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleApply = (template: StoryboardTemplate) => {
    const beats = applyTemplateToBeats(template);
    onApplyTemplate(beats);
    onClose();
  };

  const handleExport = (template: StoryboardTemplate) => {
    exportTemplateToFile(template);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[680px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            分镜模板管理
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { key: "load", label: "我的模板", icon: FileText },
            { key: "save", label: "保存模板", icon: Plus },
            { key: "import", label: "导入导出", icon: Upload },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as "load" | "save" | "import")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "load" && (
            <div className="space-y-3">
              {savedTemplates.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Film size={48} className="mx-auto mb-3 opacity-50" />
                  <p>暂无自定义模板</p>
                  <p className="text-sm mt-1">
                    保存当前分镜为模板，或从文件导入
                  </p>
                </div>
              ) : (
                savedTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">
                          {template.name}
                        </h3>
                        {template.description && (
                          <p className="text-sm text-gray-500 mt-1">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Film size={12} />
                            {template.beats.length} 个分镜
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {template.totalDuration}秒
                          </span>
                          {template.category && (
                            <span className="flex items-center gap-1">
                              <Tag size={12} />
                              {TEMPLATE_CATEGORIES.find(
                                (c) => c.value === template.category,
                              )?.label || template.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPreviewTemplate(template)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600"
                          title="预览"
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          onClick={() => handleApply(template)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600"
                        >
                          应用
                        </button>
                        <button
                          onClick={() => handleExport(template)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-green-600"
                          title="导出"
                        >
                          <Download size={16} />
                        </button>
                        <button
                          onClick={() => onDeleteTemplate(template.id)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-600"
                          title="删除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    {previewTemplate?.id === template.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div className="space-y-2">
                          {template.beats.map((beat, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
                            >
                              <span className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-xs font-medium">
                                {i + 1}
                              </span>
                              <span className="font-medium">{beat.title || "未命名"}</span>
                              <span className="text-xs text-gray-400">
                                {beat.duration}秒
                              </span>
                              {beat.shotType && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                  {beat.shotType}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "save" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                将当前 {currentBeats.length} 个分镜保存为可复用的模板
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  模板名称 *
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="例如：产品展示5镜头"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  描述
                </label>
                <textarea
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder="模板用途说明..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    分类
                  </label>
                  <select
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    类型
                  </label>
                  <input
                    type="text"
                    value={templateGenre}
                    onChange={(e) => setTemplateGenre(e.target.value)}
                    placeholder="例如：科幻、爱情"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    基调
                  </label>
                  <input
                    type="text"
                    value={templateTone}
                    onChange={(e) => setTemplateTone(e.target.value)}
                    placeholder="例如：紧张、温馨"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    标签（逗号分隔）
                  </label>
                  <input
                    type="text"
                    value={templateTags}
                    onChange={(e) => setTemplateTags(e.target.value)}
                    placeholder="例如：产品,展示,5镜头"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!templateName.trim() || currentBeats.length === 0}
                className="w-full py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                保存为模板（{currentBeats.length} 个分镜）
              </button>
            </div>
          )}

          {activeTab === "import" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                  导入模板
                </h3>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                >
                  <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">
                    点击选择 .astpl 模板文件
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".astpl,.json"
                  onChange={handleImport}
                  className="hidden"
                />
                {importError && (
                  <p className="text-sm text-red-500 mt-2">{importError}</p>
                )}
              </div>

              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                  批量导出
                </h3>
                {savedTemplates.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无模板可导出</p>
                ) : (
                  <button
                    onClick={() => {
                      exportMultipleTemplates(savedTemplates);
                    }}
                    className="px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600"
                  >
                    导出全部模板（{savedTemplates.length} 个）
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
