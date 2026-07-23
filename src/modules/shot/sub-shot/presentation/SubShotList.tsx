/**
 * SubShotList — 子镜头列表组件（Task 4.10）
 *
 * 集成位置：ShotEditorLayout 右栏（PreviewColumn）下方
 * 功能：添加/删除/排序/编辑子镜头
 */
import { memo, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Film, Check } from "lucide-react";
import { t } from "@/shared/constants";
import { EmptyState } from "@/shared/presentation/EmptyState";
import { SkeletonList } from "@/shared/presentation/Skeleton";
import type { SubShot } from "@/domain/schemas";
import { useSubShots } from "../hooks/use-sub-shots";

interface SubShotListProps {
  beatId: string | null | undefined;
}

export const SubShotList = memo(function SubShotList({ beatId }: SubShotListProps) {
  const { subShots, loading, addSubShot, removeSubShot, moveUp, moveDown, editSubShot } = useSubShots(beatId);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAdd = () => {
    void addSubShot();
  };

  const handleDelete = (id: string) => {
    void removeSubShot(id);
  };

  const handleMoveUp = (index: number) => {
    void moveUp(index);
  };

  const handleMoveDown = (index: number) => {
    void moveDown(index);
  };

  const handleFieldChange = (id: string, field: keyof SubShot, value: string | number) => {
    void editSubShot(id, { [field]: value } as Partial<SubShot>);
  };

  if (!beatId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="section-label flex items-center justify-between" style={{ marginBottom: 0 }}>
        <span className="flex items-center gap-1">
          <Film size={12} /> {t("subShot.title")}
        </span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={handleAdd}
          title={t("subShot.add")}
          style={{ padding: "2px 6px" }}
        >
          <Plus size={14} />
        </button>
      </div>

      {loading && <SkeletonList count={2} className="flex flex-col gap-1" itemClassName="h-12 w-full" />}

      {!loading && subShots.length === 0 && (
        <EmptyState compact icon={Film} title={t("subShot.empty")} />
      )}

      {subShots.map((shot, index) => (
        <div
          key={shot.id}
          className="border rounded p-2 flex flex-col gap-1"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium">{t("subShot.shotN", { n: index + 1 })}</span>
            <div className="flex items-center gap-0.5">
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                title={t("subShot.moveUp")}
                style={{ padding: "2px 4px" }}
              >
                <ChevronUp size={12} />
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => handleMoveDown(index)}
                disabled={index === subShots.length - 1}
                title={t("subShot.moveDown")}
                style={{ padding: "2px 4px" }}
              >
                <ChevronDown size={12} />
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => handleDelete(shot.id)}
                title={t("subShot.delete")}
                style={{ padding: "2px 4px" }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {editingId === shot.id ? (
            <div className="flex flex-col gap-1">
              <input
                className="input input-sm"
                value={shot.shotType}
                onChange={(e) => handleFieldChange(shot.id, "shotType", e.target.value)}
                placeholder={t("subShot.shotType")}
              />
              <input
                className="input input-sm"
                value={shot.cameraMovement}
                onChange={(e) => handleFieldChange(shot.id, "cameraMovement", e.target.value)}
                placeholder={t("subShot.cameraMovement")}
              />
              <input
                className="input input-sm"
                value={shot.cameraAngle}
                onChange={(e) => handleFieldChange(shot.id, "cameraAngle", e.target.value)}
                placeholder={t("subShot.cameraAngle")}
              />
              <input
                className="input input-sm"
                type="number"
                min={1}
                max={30}
                value={shot.duration}
                onChange={(e) => handleFieldChange(shot.id, "duration", Number(e.target.value))}
              />
              <textarea
                className="input input-sm"
                value={shot.description}
                onChange={(e) => handleFieldChange(shot.id, "description", e.target.value)}
                placeholder={t("subShot.description")}
                rows={2}
              />
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setEditingId(null)}
                aria-label={t("common.confirm")}
                title={t("common.confirm")}
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <div
              className="flex flex-col gap-0.5 cursor-pointer text-xs"
              onClick={() => setEditingId(shot.id)}
            >
              <div className="flex gap-2">
                <span>{shot.shotType}</span>
                <span className="text-muted">{t("subShot.durationSeconds", { n: shot.duration })}</span>
              </div>
              {shot.description && (
                <div className="text-muted truncate">{shot.description}</div>
              )}
              {shot.imageUrl && (
                <img
                  src={shot.imageUrl}
                  alt={t("subShot.shotN", { n: index + 1 })}
                  className="w-full rounded"
                  style={{ maxHeight: 60, objectFit: "cover" }}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});
