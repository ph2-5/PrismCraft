"use client";

import { resolveImageUrl } from "@/shared/utils/image-url";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { EditingItem } from "./AssetCardGrid";

interface AssetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: EditingItem | null;
  isSavingEdit: boolean;
  onSave: () => void;
  onEditingItemChange: (item: EditingItem) => void;
}

export function AssetEditDialog({
  open,
  onOpenChange,
  editingItem,
  isSavingEdit,
  onSave,
  onEditingItemChange,
}: AssetEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editingItem?._type === "character"
              ? "编辑角色"
              : editingItem?._type === "scene"
                ? "编辑场景"
                : "编辑分镜"}
          </DialogTitle>
        </DialogHeader>
        {editingItem && (
          <div className="space-y-4">
            {(() => {
              const imageUrl = editingItem._type === "character"
                ? (editingItem.generatedImage || editingItem.avatarPath)
                : editingItem._type === "scene"
                  ? (editingItem.generatedImage || editingItem.scenePath)
                  : editingItem.previewPath;
              return imageUrl ? (
                <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden">
                  <img
                    src={resolveImageUrl(imageUrl)}
                    alt="预览"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : null;
            })()}
            <div>
              <label className="text-sm font-medium">名称</label>
              <Input
                value={editingItem._type === "storyboard" ? "" : (editingItem.name || "")}
                onChange={(e) =>
                  onEditingItemChange({ ...editingItem, name: e.target.value } as EditingItem)
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">描述</label>
              <Textarea
                value={editingItem._type === "storyboard" ? (editingItem.script || "") : (editingItem.description || "")}
                onChange={(e) => {
                  if (editingItem._type === "storyboard") {
                    onEditingItemChange({
                      ...editingItem,
                      script: e.target.value,
                    } as EditingItem);
                  } else {
                    onEditingItemChange({
                      ...editingItem,
                      description: e.target.value,
                    } as EditingItem);
                  }
                }}
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                标签（逗号分隔）
              </label>
              <Input
                value={editingItem._type === "storyboard" ? "" : (editingItem.tags || []).join(", ")}
                onChange={(e) =>
                  onEditingItemChange({
                    ...editingItem,
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  } as EditingItem)
                }
                placeholder="标签1, 标签2, 标签3"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            disabled={isSavingEdit}
            onClick={onSave}
          >
            {isSavingEdit ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
