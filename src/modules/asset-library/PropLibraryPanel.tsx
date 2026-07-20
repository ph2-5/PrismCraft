/**
 * Task 2A.8 — PropLibraryPanel
 *
 * 道具库面板（P0 修复：替代原 PROPS_TABS 分支的 EmptyState）。
 *
 * 功能：
 * - 按 AssetTab 映射到 PropType 筛选道具列表
 * - 网格展示道具卡片（图片 + 名称 + 类型 + 描述）
 * - 新建/编辑/删除道具（通过 usePropsByType/useCreateProp/useUpdateProp/useDeleteProp）
 * - 标签输入（逗号分隔）
 * - 类型选择（clothing/weapon/accessory/prop/other）
 *
 * 依赖方向：@/modules/asset/props（hooks + services）+ @/shared/* + @/domain/schemas
 */
import { useState, useCallback, useRef } from "react";
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  X,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { t } from "@/shared/constants/messages";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { Skeleton } from "@/shared/presentation/Skeleton";
import {
  usePropsByType,
  useCreateProp,
  useUpdateProp,
  useDeleteProp,
} from "@/modules/asset/props";
import type { AssetTab } from "./asset-library-shared";
import type { Prop, PropType, CreatePropInput } from "@/domain/schemas";

/** AssetTab → PropType 映射（"props" 表示全部） */
const TAB_TO_TYPE: Record<string, PropType | null> = {
  props: null,
  "prop-clothing": "clothing",
  "prop-weapon": "weapon",
  "prop-accessory": "accessory",
  "prop-prop": "prop",
};

/** PropType → 显示标签 key */
const TYPE_TO_LABEL_KEY: Record<PropType, string> = {
  clothing: "asset.propClothing",
  weapon: "asset.propWeapon",
  accessory: "asset.propAccessory",
  prop: "asset.propProp",
  other: "asset.propTypeOtherDesc",
};

/** 所有 PropType 选项（用于新建时的类型选择） */
const ALL_PROP_TYPES: PropType[] = ["clothing", "weapon", "accessory", "prop", "other"];

interface PropCardProps {
  prop: Prop;
  onEdit: (prop: Prop) => void;
  onDelete: (prop: Prop) => void;
}

function PropCard({ prop, onEdit, onDelete }: PropCardProps) {
  const imageUrl = prop.localImagePath || prop.referenceImage;
  const typeLabel = t(TYPE_TO_LABEL_KEY[prop.type]);
  return (
    <div className="card !p-0 overflow-hidden group">
      <div className="aspect-square bg-muted/30 relative overflow-hidden">
        {imageUrl ? (
          <img
            src={resolveImageUrl(imageUrl)}
            alt={prop.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon size={28} />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <span className="badge badge-info text-[10px] py-0.5 px-1.5">{typeLabel}</span>
        </div>
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="btn btn-ghost btn-xs !p-1 bg-background/80 hover:bg-background"
            onClick={() => onEdit(prop)}
            aria-label={t("asset.editProp")}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs !p-1 bg-background/80 hover:bg-background !text-destructive"
            onClick={() => onDelete(prop)}
            aria-label={t("asset.deleteProp")}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
      <div className="p-2.5">
        <div className="font-medium text-[13px] truncate" title={prop.name}>{prop.name}</div>
        {prop.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{prop.description}</p>
        )}
        {prop.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {prop.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="badge text-[10px] py-0 px-1.5">{tag}</span>
            ))}
            {prop.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{prop.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 道具编辑对话框（新建/编辑共用） */
interface PropEditDialogProps {
  open: boolean;
  editingProp: Prop | null;
  defaultType: PropType;
  onClose: () => void;
  onSubmit: (input: CreatePropInput) => Promise<void>;
}

function PropEditDialog({ open, editingProp, defaultType, onClose, onSubmit }: PropEditDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PropType>(defaultType);
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [referenceImage, setReferenceImage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const initializedRef = useRef(false);

  // 同步 editingProp 到表单状态（每次 open 切换时初始化）
  if (open && !initializedRef.current) {
    if (editingProp) {
      setName(editingProp.name);
      setType(editingProp.type);
      setDescription(editingProp.description ?? "");
      setTagsInput(editingProp.tags.join(", "));
      setReferenceImage(editingProp.referenceImage ?? "");
    } else {
      setName("");
      setType(defaultType);
      setDescription("");
      setTagsInput("");
      setReferenceImage("");
    }
    setError("");
    initializedRef.current = true;
  }
  if (!open && initializedRef.current) {
    initializedRef.current = false;
  }

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 简化：用 URL.createObjectURL 作为预览，实际保存由调用方处理
    const url = URL.createObjectURL(file);
    setReferenceImage(url);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      setError(t("asset.propNameRequired"));
      return;
    }
    setSubmitting(true);
    setError("");
    const tags = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await onSubmit({
        id: editingProp?.id,
        name: name.trim(),
        type,
        description: description.trim(),
        tags,
        referenceImage: referenceImage || undefined,
        metadata: editingProp?.metadata ?? {},
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }, [name, type, description, tagsInput, referenceImage, editingProp, onSubmit, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prop-dialog-title"
    >
      <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h2 id="prop-dialog-title" className="text-sm font-semibold">
            {editingProp ? t("asset.editProp") : t("asset.newProp")}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={14} />
          </button>
        </div>
        <PropEditFormFields
          name={name}
          type={type}
          description={description}
          tagsInput={tagsInput}
          referenceImage={referenceImage}
          error={error}
          fileInputRef={fileInputRef}
          onNameChange={setName}
          onTypeChange={(v) => setType(v as PropType)}
          onDescriptionChange={setDescription}
          onTagsInputChange={setTagsInput}
          onReferenceImageChange={setReferenceImage}
          onFileUpload={handleFileUpload}
        />
        <div className="flex gap-2 p-3 border-t border-border">
          <button
            type="button"
            className="btn btn-ghost btn-sm flex-1"
            onClick={onClose}
            disabled={submitting}
          >
            {t("asset.propCancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex-1 gap-1"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {t("asset.propSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface PropEditFormFieldsProps {
  name: string;
  type: PropType;
  description: string;
  tagsInput: string;
  referenceImage: string;
  error: string;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onNameChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onTagsInputChange: (v: string) => void;
  onReferenceImageChange: (v: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function PropEditFormFields({
  name, type, description, tagsInput, referenceImage, error, fileInputRef,
  onNameChange, onTypeChange, onDescriptionChange, onTagsInputChange, onReferenceImageChange, onFileUpload,
}: PropEditFormFieldsProps) {
  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="section-label !text-[11px]" htmlFor="prop-name-input">
          {t("character.name")} <span className="text-destructive">*</span>
        </label>
        <input
          id="prop-name-input"
          className="input"
          placeholder={t("asset.propNamePlaceholder")}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="section-label !text-[11px]" htmlFor="prop-type-select">
          {t("asset.propTypeLabel")}
        </label>
        <select
          id="prop-type-select"
          className="select"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
        >
          {ALL_PROP_TYPES.map((pt) => (
            <option key={pt} value={pt}>{t(TYPE_TO_LABEL_KEY[pt])}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="section-label !text-[11px]" htmlFor="prop-desc-input">
          {t("character.description")}
        </label>
        <textarea
          id="prop-desc-input"
          className="textarea"
          placeholder={t("asset.propDescriptionPlaceholder")}
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="section-label !text-[11px]" htmlFor="prop-tags-input">
          {t("asset.propTagsLabel")}
        </label>
        <input
          id="prop-tags-input"
          className="input"
          placeholder={t("asset.propTagsPlaceholder")}
          value={tagsInput}
          onChange={(e) => onTagsInputChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="section-label !text-[11px]" htmlFor="prop-image-input">
          {t("asset.propImageLabel")}
        </label>
        <div className="flex gap-1.5">
          <input
            id="prop-image-input"
            className="input flex-1"
            placeholder={t("asset.propImagePlaceholder")}
            value={referenceImage}
            onChange={(e) => onReferenceImageChange(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            {t("asset.propUploadImage")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileUpload}
          />
        </div>
        {referenceImage && (
          <div className="w-20 h-20 rounded-md overflow-hidden border border-border mt-1">
            <img
              src={resolveImageUrl(referenceImage)}
              alt={name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

export interface PropLibraryPanelProps {
  activeTab: AssetTab;
}

export function PropLibraryPanel({ activeTab }: PropLibraryPanelProps) {
  const propType = TAB_TO_TYPE[activeTab] ?? null;
  const { data: props = [], isLoading } = usePropsByType(propType);
  const createMutation = useCreateProp();
  const updateMutation = useUpdateProp();
  const deleteMutation = useDeleteProp();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<Prop | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prop | null>(null);

  const defaultType: PropType = propType ?? "prop";

  const handleAdd = useCallback(() => {
    setEditingProp(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((prop: Prop) => {
    setEditingProp(prop);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback((prop: Prop) => {
    setDeleteTarget(prop);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (_err) {
      // 错误由 React Query 处理，这里仅关闭对话框
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMutation]);

  const handleSubmit = useCallback(
    async (input: CreatePropInput) => {
      if (editingProp) {
        const { id: _id, ...patch } = input;
        await updateMutation.mutateAsync({ id: editingProp.id, patch });
      } else {
        await createMutation.mutateAsync(input);
      }
    },
    [editingProp, createMutation, updateMutation],
  );

  if (isLoading) {
    return (
      <div>
        <div className="mb-3 flex justify-end">
          <button type="button" className="btn btn-primary btn-sm" disabled>
            <Loader2 size={14} className="animate-spin mr-1" />
            {t("common.loading")}
          </button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card !p-0 overflow-hidden">
              <Skeleton className="aspect-square !rounded-none" />
              <div className="p-2.5">
                <Skeleton className="h-3 w-3/4 mb-2" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleAdd}>
          <Plus size={14} className="mr-1" />
          {t("asset.newProp")}
        </button>
      </div>
      {props.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("asset.propsEmpty")}
          description={t("asset.propsEmptyDesc")}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
          {props.map((prop) => (
            <PropCard
              key={prop.id}
              prop={prop}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <PropEditDialog
        open={dialogOpen}
        editingProp={editingProp}
        defaultType={defaultType}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />

      {/* 删除确认对话框 */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-sm p-4">
            <h3 className="text-sm font-semibold mb-2">{t("asset.deleteProp")}</h3>
            <p className="text-xs text-muted-foreground mb-4">
              {t("asset.deletePropConfirm", { name: deleteTarget.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="btn btn-sm !text-destructive !border-destructive/30 hover:!bg-destructive/10"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
