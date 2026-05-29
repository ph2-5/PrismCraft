"use client";

import type { RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { ArrowRight, Loader2, Upload } from "lucide-react";
import type { Collection, ImportMode } from "@/domain/schemas";

interface AssetCollectionDialogsProps {
  isCollectionDialogOpen: boolean;
  setIsCollectionDialogOpen: (open: boolean) => void;
  isNewCollectionDialogOpen: boolean;
  setIsNewCollectionDialogOpen: (open: boolean) => void;
  isImportDialogOpen: boolean;
  setIsImportDialogOpen: (open: boolean) => void;
  collections: Collection[];
  selectedIdsCount: number;
  addToCollectionId: string;
  setAddToCollectionId: (id: string) => void;
  isAddingToCollection: boolean;
  onAddToCollection: () => void;
  newCollectionName: string;
  setNewCollectionName: (name: string) => void;
  isCreatingCollection: boolean;
  onCreateCollection: () => void;
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export function AssetCollectionDialogs({
  isCollectionDialogOpen,
  setIsCollectionDialogOpen,
  isNewCollectionDialogOpen,
  setIsNewCollectionDialogOpen,
  isImportDialogOpen,
  setIsImportDialogOpen,
  collections,
  selectedIdsCount,
  addToCollectionId,
  setAddToCollectionId,
  isAddingToCollection,
  onAddToCollection,
  newCollectionName,
  setNewCollectionName,
  isCreatingCollection,
  onCreateCollection,
  importMode,
  setImportMode,
  fileInputRef,
}: AssetCollectionDialogsProps) {
  return (
    <>
      <Dialog
        open={isCollectionDialogOpen}
        onOpenChange={setIsCollectionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>加入合集</DialogTitle>
            <DialogDescription>
              选择一个合集，将选中的 {selectedIdsCount} 个素材添加进去
            </DialogDescription>
          </DialogHeader>
          <Select
            value={addToCollectionId}
            onValueChange={(v) => {
              if (v) setAddToCollectionId(v);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择合集" />
            </SelectTrigger>
            <SelectContent>
              {collections.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {collections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              暂无合集，请先创建合集
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsCollectionDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={onAddToCollection}
              disabled={!addToCollectionId || isAddingToCollection}
            >
              {isAddingToCollection ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-1" />}
              {isAddingToCollection ? "添加中..." : "加入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isNewCollectionDialogOpen}
        onOpenChange={setIsNewCollectionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建合集</DialogTitle>
            <DialogDescription>创建一个合集来组织你的素材</DialogDescription>
          </DialogHeader>
          <Input
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="输入合集名称"
            onKeyDown={(e) => {
              if (e.key === "Enter") onCreateCollection();
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsNewCollectionDialogOpen(false)}
            >
              取消
            </Button>
            <Button disabled={isCreatingCollection} onClick={onCreateCollection}>
              {isCreatingCollection ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {isCreatingCollection ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入 .asa 素材包</DialogTitle>
            <DialogDescription>
              从.asa文件导入角色、场景、分镜素材
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">导入模式</label>
              <Select
                value={importMode}
                onValueChange={(v) => {
                  if (v) setImportMode(v as ImportMode);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">跳过重复素材</SelectItem>
                  <SelectItem value="replace">覆盖相同ID素材</SelectItem>
                  <SelectItem value="merge">合并至现有合集</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              选择 .asa 文件
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsImportDialogOpen(false)}
            >
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
