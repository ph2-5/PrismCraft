"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Result } from "@/domain/types";
import {
  useCharacters,
} from "@/modules/character";
import {
  useScenes,
} from "@/modules/scene";
import {
  characterService,
} from "@/modules/character";
import {
  sceneService,
} from "@/modules/scene";
import {
  storyboardAssetService,
  collectionService,
  assetExportService,
} from "@/modules/asset";
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { mapUserFacingError } from "@/shared/utils/user-facing-error";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import {
  Search,
  Trash2,
  Download,
  Upload,
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
  Package,
  Loader2,
} from "lucide-react";
import type {
  StoryboardAsset,
  Collection,
  CollectionAsset,
  AssetLibraryType,
  ImportMode,
} from "@/domain/schemas";
import { confirm } from "@/shared/utils/confirm";
import { container } from "@/infrastructure/di";
import { AssetCardGrid, fetchSecondaryData } from "./AssetCardGrid";
import type { AssetTab, EditingItem } from "./AssetCardGrid";
import { AssetEditDialog } from "./AssetEditDialog";
import { AssetCollectionDialogs } from "./AssetCollectionDialogs";

export default function AssetLibraryPage() {
  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();
  const { data: characters = [], isLoading: charactersLoading } = useCharacters();
  const { data: scenes = [], isLoading: scenesLoading } = useScenes();
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<ImportMode>("skip");

  const [storyboards, setStoryboards] = useState<StoryboardAsset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionAssets, setCollectionAssets] = useState<CollectionAsset[]>([]);
  const [secondaryDataLoading, setSecondaryDataLoading] = useState(true);

  const loadSecondaryData = useCallback(async () => {
    try {
      const data = await fetchSecondaryData();
      setStoryboards(data.storyboards);
      setCollections(data.collections);
      setCollectionAssets(data.collectionAssets);
    } catch (err) {
      errorLogger.warn("Failed to load secondary data", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchSecondaryData()
      .then((data) => {
        if (!cancelled) {
          setStoryboards(data.storyboards);
          setCollections(data.collections);
          setCollectionAssets(data.collectionAssets);
          setSecondaryDataLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          errorLogger.warn("Failed to load secondary data", err);
          setSecondaryDataLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isNewCollectionDialogOpen, setIsNewCollectionDialogOpen] =
    useState(false);

  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [addToCollectionId, setAddToCollectionId] = useState("");
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isAddingToCollection, setIsAddingToCollection] = useState(false);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (ids: string[]) => {
    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!(await confirm(`确定要删除选中的 ${ids.length} 个素材吗？`, "批量删除素材"))) return;
    setIsBatchDeleting(true);
    try {
      const deletedIds: string[] = [];
      const failedLabels: string[] = [];
      for (const id of ids) {
        try {
          if (activeTab === "characters") {
            const result = await characterService.delete(id);
            if (!result.ok) {
              const c = characters.find((ch) => ch.id === id);
              failedLabels.push(c?.name || id.slice(0, 8));
              continue;
            }
          } else if (activeTab === "scenes") {
            const result = await sceneService.delete(id);
            if (!result.ok) {
              const s = scenes.find((sc) => sc.id === id);
              failedLabels.push(s?.name || id.slice(0, 8));
              continue;
            }
          } else if (activeTab === "storyboards") {
            await storyboardAssetService.remove(id);
          }
          deletedIds.push(id);
        } catch {
          const label = activeTab === "characters"
            ? characters.find((ch) => ch.id === id)?.name
            : activeTab === "scenes"
              ? scenes.find((sc) => sc.id === id)?.name
              : id.slice(0, 8);
          failedLabels.push(label || id.slice(0, 8));
        }
      }
      if (deletedIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["characters"] });
        queryClient.invalidateQueries({ queryKey: ["scenes"] });
        loadSecondaryData();
      }
      if (failedLabels.length > 0) {
        showError("部分删除失败", `以下素材删除失败: ${failedLabels.join("、")}`);
      } else {
        success("删除成功", `已删除 ${deletedIds.length} 个素材`);
      }
    } catch (e) {
      showError("删除失败", mapUserFacingError(e));
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleBatchExport = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      let encodedResult: Result<Uint8Array>;
      if (activeTab === "characters")
        encodedResult = await assetExportService.exportCharacters(ids);
      else if (activeTab === "scenes")
        encodedResult = await assetExportService.exportScenes(ids);
      else if (activeTab === "storyboards")
        encodedResult = await assetExportService.exportStoryboards(ids);
      else return;
      if (!encodedResult.ok) {
        showError("导出失败", mapUserFacingError(encodedResult.error));
        return;
      }
      const blob = new Blob([new Uint8Array(encodedResult.value)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `export-${activeTab}-${Date.now()}.asa`;
      a.click();
      URL.revokeObjectURL(url);
      clearSelection();
      success("导出成功", `已导出 ${ids.length} 个素材为.asa文件`);
    } catch (e) {
      showError("导出失败", mapUserFacingError(e));
    }
  };

  const handleAddToCollection = async () => {
    if (!addToCollectionId || selectedIds.size === 0) return;
    setIsAddingToCollection(true);
    try {
      const assetType: AssetLibraryType =
        activeTab === "characters"
          ? "character"
          : activeTab === "scenes"
            ? "scene"
            : "storyboard";
      for (const id of selectedIds) {
        await collectionService.addAsset(addToCollectionId, assetType, id);
      }
      setIsCollectionDialogOpen(false);
      clearSelection();
      success("添加成功", `已将 ${selectedIds.size} 个素材添加到合集`);
    } catch (e) {
      showError("添加失败", mapUserFacingError(e));
    } finally {
      setIsAddingToCollection(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await assetExportService.importFromFile(file, importMode);
      if (!result.ok) {
        showError("导入失败", mapUserFacingError(result.error));
      } else {
        if (result.value.errors.length > 0) {
          showError("部分导入失败", result.value.errors.join("; "));
        }
        if (result.value.imported > 0) {
          success("导入成功", `成功导入 ${result.value.imported} 个素材`);
        }
      }
      setIsImportDialogOpen(false);
    } catch (e) {
      showError("导入失败", mapUserFacingError(e));
    }
    e.target.value = "";
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      showError("输入错误", "请输入合集名称");
      return;
    }
    setIsCreatingCollection(true);
    try {
      await collectionService.create(newCollectionName.trim());
      setNewCollectionName("");
      setIsNewCollectionDialogOpen(false);
      success("创建成功", "新合集已创建");
    } catch (e) {
      showError("创建失败", mapUserFacingError(e));
    } finally {
      setIsCreatingCollection(false);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!(await confirm("确定要删除此合集吗？合集中的素材不会被删除。", "删除合集"))) return;
    try {
      await collectionService.remove(id);
      loadSecondaryData();
      success("删除成功", "合集已删除");
    } catch (e) {
      showError("删除失败", mapUserFacingError(e));
    }
  };

  const handleExportCollection = async (id: string) => {
    try {
      const encodedResult = await assetExportService.exportCollections([id]);
      if (!encodedResult.ok) {
        showError("导出失败", mapUserFacingError(encodedResult.error));
        return;
      }
      const col = collections.find((c) => c.id === id);
      const blob = new Blob([new Uint8Array(encodedResult.value)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${col?.name || "collection"}.asa`;
      a.click();
      URL.revokeObjectURL(url);
      success("导出成功", "合集已导出为.asa文件");
    } catch (e) {
      showError("导出失败", mapUserFacingError(e));
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!(await confirm("确定要删除此角色吗？", "删除角色"))) return;
    characterService
      .delete(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["characters"] }))
      .catch((e: unknown) =>
        showError("删除失败", mapUserFacingError(e)),
      );
  };

  const handleDeleteScene = async (id: string) => {
    if (!(await confirm("确定要删除此场景吗？", "删除场景"))) return;
    sceneService
      .delete(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["scenes"] }))
      .catch((e: unknown) =>
        showError("删除失败", mapUserFacingError(e)),
      );
  };

  const handleDeleteStoryboard = async (id: string) => {
    if (!(await confirm("确定要删除此分镜吗？", "删除分镜"))) return;
    storyboardAssetService
      .remove(id)
      .then(() => loadSecondaryData())
      .catch((e: unknown) =>
        showError("删除失败", mapUserFacingError(e)),
      );
  };

  const handleEditItem = (item: EditingItem) => {
    setEditingItem(item);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setIsSavingEdit(true);
    try {
      if (editingItem._type === "character") {
        const result = await characterService.update(editingItem.id, {
          id: editingItem.id,
          name: editingItem.name,
          description: editingItem.description,
          tags: editingItem.tags,
        });
        if (!result.ok) throw result.error;
      } else if (editingItem._type === "scene") {
        const result = await sceneService.update(editingItem.id, {
          id: editingItem.id,
          name: editingItem.name,
          description: editingItem.description,
          tags: editingItem.tags,
          atmosphere: editingItem.atmosphere,
        });
        if (!result.ok) throw result.error;
      } else if (editingItem._type === "storyboard") {
        await container.storyboardStorage.createStoryboardAsset({
          id: editingItem.id,
          script: editingItem.script,
          duration: editingItem.duration,
          shotType: editingItem.shotType,
        });
      }
      setIsEditDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      loadSecondaryData();
      success("保存成功", "素材已更新");
    } catch (e) {
      showError("保存失败", mapUserFacingError(e));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const filteredCharacters = useMemo(
    () =>
      characters.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.tags?.some((t) =>
            t.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      ),
    [characters, searchQuery],
  );

  const filteredScenes = useMemo(
    () =>
      scenes.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.tags?.some((t) =>
            t.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      ),
    [scenes, searchQuery],
  );

  const filteredStoryboards = useMemo(
    () =>
      storyboards.filter((sb) =>
        sb.script.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [storyboards, searchQuery],
  );

  const currentItems =
    activeTab === "characters"
      ? filteredCharacters
      : activeTab === "scenes"
        ? filteredScenes
        : activeTab === "storyboards"
          ? filteredStoryboards
          : searchQuery
            ? collections.filter((c) =>
                c.name?.toLowerCase().includes(searchQuery.toLowerCase()),
              )
            : collections;

  return (
    <PageErrorBoundary>
      <div className="h-full space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5" />
              素材库
            </h2>
            <p className="text-sm text-muted-foreground">
              管理角色、场景、分镜素材及自定义合集
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsImportDialogOpen(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              导入 .asa
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".asa"
              className="hidden"
              onChange={handleImport}
            />
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as AssetTab);
            clearSelection();
            setSearchQuery("");
          }}
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="characters" className="gap-1">
              <Users className="w-4 h-4" />
              角色库
              {characters.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {characters.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="scenes" className="gap-1">
              <ImageIcon className="w-4 h-4" />
              场景库
              {scenes.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {scenes.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="storyboards" className="gap-1">
              <Film className="w-4 h-4" />
              分镜库
              {storyboards.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {storyboards.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="collections" className="gap-1">
              <FolderOpen className="w-4 h-4" />
              我的合集
              {collections.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {collections.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={
                    activeTab === "storyboards"
                      ? "搜索分镜文案..."
                      : activeTab === "collections"
                        ? "搜索合集..."
                        : "搜索名称、描述或标签..."
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            {selectedIds.size > 0 && activeTab !== "collections" && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground">
                  已选 {selectedIds.size} 项
                </span>
                <Button variant="outline" size="sm" onClick={handleBatchExport}>
                  <Download className="w-4 h-4 mr-1" />
                  导出
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCollectionDialogOpen(true)}
                >
                  <FolderOpen className="w-4 h-4 mr-1" />
                  加入合集
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isBatchDeleting}
                  onClick={handleBatchDelete}
                >
                  {isBatchDeleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                  {isBatchDeleting ? "删除中..." : "删除"}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  取消选择
                </Button>
              </div>
            )}
            {activeTab !== "collections" && currentItems.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  selectAll(currentItems.map((i: { id: string }) => i.id))
                }
              >
                全选
              </Button>
            )}
          </div>

          <AssetCardGrid
            activeTab={activeTab}
            characters={characters}
            scenes={scenes}
            collections={collections}
            collectionAssets={collectionAssets}
            filteredCharacters={filteredCharacters}
            filteredScenes={filteredScenes}
            filteredStoryboards={filteredStoryboards}
            charactersLoading={charactersLoading}
            scenesLoading={scenesLoading}
            secondaryDataLoading={secondaryDataLoading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onEditItem={handleEditItem}
            onDeleteCharacter={handleDeleteCharacter}
            onDeleteScene={handleDeleteScene}
            onDeleteStoryboard={handleDeleteStoryboard}
            onDeleteCollection={handleDeleteCollection}
            onExportCollection={handleExportCollection}
            onNewCollection={() => setIsNewCollectionDialogOpen(true)}
          />
        </Tabs>

        <AssetEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          editingItem={editingItem}
          isSavingEdit={isSavingEdit}
          onSave={handleSaveEdit}
          onEditingItemChange={(item) => setEditingItem(item)}
        />

        <AssetCollectionDialogs
          isCollectionDialogOpen={isCollectionDialogOpen}
          setIsCollectionDialogOpen={setIsCollectionDialogOpen}
          isNewCollectionDialogOpen={isNewCollectionDialogOpen}
          setIsNewCollectionDialogOpen={setIsNewCollectionDialogOpen}
          isImportDialogOpen={isImportDialogOpen}
          setIsImportDialogOpen={setIsImportDialogOpen}
          collections={collections}
          selectedIdsCount={selectedIds.size}
          addToCollectionId={addToCollectionId}
          setAddToCollectionId={setAddToCollectionId}
          isAddingToCollection={isAddingToCollection}
          onAddToCollection={handleAddToCollection}
          newCollectionName={newCollectionName}
          setNewCollectionName={setNewCollectionName}
          isCreatingCollection={isCreatingCollection}
          onCreateCollection={handleCreateCollection}
          importMode={importMode}
          setImportMode={setImportMode}
          fileInputRef={fileInputRef}
        />
      </div>
    </PageErrorBoundary>
  );
}
