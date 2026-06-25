import { useState, useRef } from "react";
import {
  X,
  Upload,
  Plus,
  FileText,
  Film,
} from "lucide-react";
import type { StoryBeat } from "@/domain/schemas";
import {
  type StoryboardTemplate,
  createTemplateFromBeats,
  applyTemplateToBeats,
  exportTemplateToFile,
  importTemplateFromFile,
} from "@/modules/story";
import { t } from "@/shared/constants";
import { exportMultipleTemplates } from "../services/storyboard-template";
import { TemplateCard } from "./TemplateCard";

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
  { value: "custom", label: () => t("template.categoryCustom") },
  { value: "film", label: () => t("template.categoryFilm") },
  { value: "animation", label: () => t("template.categoryAnimation") },
  { value: "commercial", label: () => t("template.categoryCommercial") },
  { value: "documentary", label: () => t("template.categoryDocumentary") },
  { value: "music-video", label: () => t("template.categoryMusicVideo") },
  { value: "other", label: () => t("template.categoryOther") },
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
      setImportError(result.error instanceof Error ? result.error.message : t("template.importFailed"));
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
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-lg font-semibold" style={{ color: "var(--muted-fg)" }}>
            {t("template.managerTitle")}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            style={{ color: "var(--muted-fg)" }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
          {[
            { key: "load", label: t("template.myTemplates"), icon: FileText },
            { key: "save", label: t("template.saveTemplate"), icon: Plus },
            { key: "import", label: t("template.importExport"), icon: Upload },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as "load" | "save" | "import")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-blue-500"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              style={activeTab === key ? { color: "var(--primary)" } : undefined}
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
                <div className="text-center py-12" style={{ color: "var(--muted-fg)" }}>
                  <Film size={48} className="mx-auto mb-3 opacity-50" />
                  <p>{t("template.noCustomTemplates")}</p>
                  <p className="text-sm mt-1">
                    {t("template.saveCurrentOrImport")}
                  </p>
                </div>
              ) : (
                savedTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onApply={handleApply}
                    onExport={handleExport}
                    onDelete={onDeleteTemplate}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === "save" && (
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "var(--muted-fg)" }}>
                {t("template.saveCurrentAsTemplate", { count: currentBeats.length })}
              </p>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--muted-fg)" }}>
                  {t("template.templateName")}
                </label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t("template.templateNamePlaceholder")}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white" style={{ color: "var(--muted-fg)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--muted-fg)" }}>
                  {t("template.description")}
                </label>
                <textarea
                  value={templateDesc}
                  onChange={(e) => setTemplateDesc(e.target.value)}
                  placeholder={t("template.descriptionPlaceholder")}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white" style={{ color: "var(--muted-fg)" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--muted-fg)" }}>
                    {t("template.category")}
                  </label>
                  <select
                    value={templateCategory}
                    onChange={(e) => setTemplateCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white" style={{ color: "var(--muted-fg)" }}
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--muted-fg)" }}>
                    {t("template.genre")}
                  </label>
                  <input
                    type="text"
                    value={templateGenre}
                    onChange={(e) => setTemplateGenre(e.target.value)}
                    placeholder={t("template.genrePlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white" style={{ color: "var(--muted-fg)" }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--muted-fg)" }}>
                    {t("template.tone")}
                  </label>
                  <input
                    type="text"
                    value={templateTone}
                    onChange={(e) => setTemplateTone(e.target.value)}
                    placeholder={t("template.tonePlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white" style={{ color: "var(--muted-fg)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--muted-fg)" }}>
                    {t("template.tagsComma")}
                  </label>
                  <input
                    type="text"
                    value={templateTags}
                    onChange={(e) => setTemplateTags(e.target.value)}
                    placeholder={t("template.tagsPlaceholder")}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white" style={{ color: "var(--muted-fg)" }}
                  />
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={!templateName.trim() || currentBeats.length === 0}
                className="w-full py-2.5 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("template.saveTemplateButton", { count: currentBeats.length })}
              </button>
            </div>
          )}

          {activeTab === "import" && (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2" style={{ color: "var(--muted-fg)" }}>
                  {t("template.importTemplate")}
                </h3>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                >
                  <Upload size={32} className="mx-auto mb-2" style={{ color: "var(--muted-fg)" }} />
                  <p className="text-sm" style={{ color: "var(--muted-fg)" }}>
                    {t("template.clickToSelectFile")}
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
                  <p className="text-sm mt-2" style={{ color: "var(--destructive)" }}>{importError}</p>
                )}
              </div>

              <div className="border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <h3 className="font-medium mb-2" style={{ color: "var(--muted-fg)" }}>
                  {t("template.batchExport")}
                </h3>
                {savedTemplates.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--muted-fg)" }}>{t("template.noTemplatesToExport")}</p>
                ) : (
                  <button
                    onClick={() => {
                      exportMultipleTemplates(savedTemplates);
                    }}
                    className="px-4 py-2 rounded-lg bg-green-500 text-white font-medium hover:bg-green-600"
                  >
                    {t("template.exportAllTemplates", { count: savedTemplates.length })}
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
