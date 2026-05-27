"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Result } from "@/domain/types";
import { resolveImageUrl } from "@/shared/utils/image-url";
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
import { useToastHelpers } from "@/shared/presentation/Toast";
import { errorLogger } from "@/shared/error-logger";
import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
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
import {
  Search,
  Plus,
  Trash2,
  Download,
  Upload,
  Users,
  Image as ImageIcon,
  Film,
  FolderOpen,
  CheckSquare,
  Square,
  Package,
  ArrowRight,
  Clock,
  Link,
} from "lucide-react";
import type {
  Character,
  Scene,
  StoryboardAsset,
  Collection,
  CollectionAsset,
  AssetLibraryType,
  ImportMode,
} from "@/domain/schemas";
import { confirm } from "@/shared/utils/confirm";
import { container } from "@/infrastructure/di";

type AssetTab = "characters" | "scenes" | "storyboards" | "collections";

function toDateFromTimestamp(ts: unknown): Date {
  if (typeof ts === "number") return new Date(ts * 1000);
  if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

async function fetchSecondaryData() {
  const [sb, col, colAssets] = await Promise.all([
    container.storyboardStorage.getStoryboardAssets(),
    container.collectionStorage.getCollections(),
    container.collectionStorage.getCollectionAssets(),
  ]);
  return { storyboards: sb, collections: col, collectionAssets: colAssets };
}

export default function AssetLibraryPage() {
  const { success, error: showError } = useToastHelpers();
  const queryClient = useQueryClient();
  const { data: characters = [] } = useCharacters();
  const { data: scenes = [] } = useScenes();
  const [activeTab, setActiveTab] = useState<AssetTab>("characters");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importMode, setImportMode] = useState<ImportMode>("skip");

  const [storyboards, setStoryboards] = useState<StoryboardAsset[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionAssets, setCollectionAssets] = useState<CollectionAsset[]>([]);

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
        }
      })
      .catch((err) => {
        if (!cancelled) errorLogger.warn("Failed to load secondary data", err);
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
type EditingItem =
  | (Character & { _type: "character" })
  | (Scene & { _type: "scene" })
  | (StoryboardAsset & { _type: "storyboard" });

  const [editingItem, setEditingItem] = useState<EditingItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [addToCollectionId, setAddToCollectionId] = useState("");
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
    try {
      if (activeTab === "characters") {
        for (const id of ids) {
          const result = await characterService.delete(id);
          if (!result.ok) throw result.error;
        }
      } else if (activeTab === "scenes") {
        for (const id of ids) {
          const result = await sceneService.delete(id);
          if (!result.ok) throw result.error;
        }
      } else if (activeTab === "storyboards") {
        const { storyboardAssetService } = await import("@/modules/asset/asset-library");
        for (const id of ids) await storyboardAssetService.remove(id);
      }
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      queryClient.invalidateQueries({ queryKey: ["scenes"] });
      loadSecondaryData();
      success("删除成功", `已删除 ${ids.length} 个素材`);
    } catch (e) {
      showError("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleBatchExport = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { assetExportService } = await import("@/modules/asset/asset-library");
      let encodedResult: Result<Uint8Array>;
      if (activeTab === "characters")
        encodedResult = await assetExportService.exportCharacters(ids);
      else if (activeTab === "scenes")
        encodedResult = await assetExportService.exportScenes(ids);
      else if (activeTab === "storyboards")
        encodedResult = await assetExportService.exportStoryboards(ids);
      else return;
      if (!encodedResult.ok) {
        showError("导出失败", encodedResult.error instanceof Error ? encodedResult.error.message : "未知错误");
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
      showError("导出失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleAddToCollection = async () => {
    if (!addToCollectionId || selectedIds.size === 0) return;
    try {
      const { collectionService } = await import("@/modules/asset/asset-library");
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
      showError("添加失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { assetExportService } = await import("@/modules/asset/asset-library");
      const result = await assetExportService.importFromFile(file, importMode);
      if (!result.ok) {
        showError("导入失败", result.error instanceof Error ? result.error.message : "未知错误");
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
      showError("导入失败", e instanceof Error ? e.message : "未知错误");
    }
    e.target.value = "";
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      showError("输入错误", "请输入合集名称");
      return;
    }
    try {
      const { collectionService } = await import("@/modules/asset/asset-library");
      await collectionService.create(newCollectionName.trim());
      setNewCollectionName("");
      setIsNewCollectionDialogOpen(false);
      success("创建成功", "新合集已创建");
    } catch (e) {
      showError("创建失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!(await confirm("确定要删除此合集吗？合集中的素材不会被删除。", "删除合集"))) return;
    try {
      const { collectionService } = await import("@/modules/asset");
      await collectionService.remove(id);
      loadSecondaryData();
      success("删除成功", "合集已删除");
    } catch (e) {
      showError("删除失败", e instanceof Error ? e.message : "未知错误");
    }
  };

  const handleExportCollection = async (id: string) => {
    try {
      const { assetExportService } = await import("@/modules/asset");
      const encodedResult = await assetExportService.exportCollections([id]);
      if (!encodedResult.ok) {
        showError("导出失败", encodedResult.error instanceof Error ? encodedResult.error.message : "未知错误");
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
      showError("导出失败", e instanceof Error ? e.message : "未知错误");
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

  const getCollectionAssetCount = (collectionId: string) => {
    return collectionAssets.filter((ca) => ca.collectionId === collectionId)
      .length;
  };

  const getCollectionAssets = (collectionId: string) => {
    return collectionAssets.filter((ca) => ca.collectionId === collectionId);
  };

  const renderCharacterCard = (char: Character) => {
    const isSelected = selectedIds.has(char.id);
    return (
      <Card
        key={char.id}
        className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-purple-500" : "hover:shadow-lg"}`}
        onClick={() => {
          setEditingItem({ ...char, _type: "character" });
          setIsEditDialogOpen(true);
        }}
      >
        <div className="aspect-square bg-slate-800 relative overflow-hidden">
          {char.generatedImage || char.avatarPath ? (
            <img
              src={resolveImageUrl(char.generatedImage || char.avatarPath)}
              alt={char.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Users className="w-12 h-12 text-slate-600" />
            </div>
          )}
          <div
            className="absolute top-2 left-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(char.id);
            }}
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-purple-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/50 hover:bg-red-900/70 text-white"
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirm("确定要删除此角色吗？", "删除角色")) {
                  characterService
                    .delete(char.id)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["characters"] }))
                    .catch((e: unknown) =>
                      showError(
                        "删除失败",
                        e instanceof Error ? e.message : "未知错误",
                      ),
                    );
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <h4 className="font-medium truncate text-sm">
            {char.name || "未命名角色"}
          </h4>
          <div className="flex flex-wrap gap-1 mt-1">
            {(char.tags || []).slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {(char.tags || []).length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{(char.tags || []).length - 2}
              </Badge>
            )}
          </div>
          {char.createdAt && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {toDateFromTimestamp(char.createdAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderSceneCard = (scene: Scene) => {
    const isSelected = selectedIds.has(scene.id);
    return (
      <Card
        key={scene.id}
        className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-blue-500" : "hover:shadow-lg"}`}
        onClick={() => {
          setEditingItem({ ...scene, _type: "scene" });
          setIsEditDialogOpen(true);
        }}
      >
        <div className="aspect-video bg-slate-800 relative overflow-hidden">
          {scene.generatedImage || scene.scenePath ? (
            <img
              src={resolveImageUrl(scene.generatedImage || scene.scenePath)}
              alt={scene.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-slate-600" />
            </div>
          )}
          <div
            className="absolute top-2 left-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(scene.id);
            }}
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-blue-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/50 hover:bg-red-900/70 text-white"
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirm("确定要删除此场景吗？", "删除场景")) {
                  sceneService
                    .delete(scene.id)
                    .then(() => queryClient.invalidateQueries({ queryKey: ["scenes"] }))
                    .catch((e: unknown) =>
                      showError(
                        "删除失败",
                        e instanceof Error ? e.message : "未知错误",
                      ),
                    );
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <h4 className="font-medium truncate text-sm">
            {scene.name || "未命名场景"}
          </h4>
          <div className="flex flex-wrap gap-1 mt-1">
            {(scene.tags || []).slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          {scene.atmosphere && (
            <p className="text-xs text-muted-foreground mt-1">
              {scene.atmosphere}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderStoryboardCard = (sb: StoryboardAsset) => {
    const isSelected = selectedIds.has(sb.id);
    return (
      <Card
        key={sb.id}
        className={`overflow-hidden group cursor-pointer transition-all ${isSelected ? "ring-2 ring-amber-500" : "hover:shadow-lg"}`}
        onClick={() => {
          setEditingItem({ ...sb, _type: "storyboard" });
          setIsEditDialogOpen(true);
        }}
      >
        <div className="aspect-video bg-slate-800 relative overflow-hidden">
          {sb.previewPath ? (
            <img
              src={resolveImageUrl(sb.previewPath)}
              alt="分镜预览"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4">
              <p className="text-slate-400 text-sm text-center line-clamp-3">
                {sb.script}
              </p>
            </div>
          )}
          <div
            className="absolute top-2 left-2 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(sb.id);
            }}
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-amber-400" />
            ) : (
              <Square className="w-5 h-5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 bg-black/50 hover:bg-red-900/70 text-white"
              onClick={async (e) => {
                e.stopPropagation();
                if (await confirm("确定要删除此分镜吗？", "删除分镜")) {
                  import("@/modules/asset")
                    .then(({ storyboardAssetService }) => storyboardAssetService.remove(sb.id))
                    .then(() => loadSecondaryData())
                    .catch((e: unknown) =>
                      showError(
                        "删除失败",
                        e instanceof Error ? e.message : "未知错误",
                      ),
                    );
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <CardContent className="p-3">
          <p className="text-sm line-clamp-2">{sb.script}</p>
          <div className="flex items-center gap-2 mt-1">
            {sb.duration && (
              <Badge variant="outline" className="text-xs">
                {sb.duration}
              </Badge>
            )}
            {sb.shotType && (
              <Badge variant="outline" className="text-xs">
                {sb.shotType}
              </Badge>
            )}
          </div>
          {sb.characterIds?.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Link className="w-3 h-3" />
              {sb.characterIds.length} 个角色
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderCollectionCard = (col: Collection) => {
    const assetCount = getCollectionAssetCount(col.id);
    return (
      <Card key={col.id} className="group hover:shadow-lg transition-all">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              {col.name}
            </CardTitle>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => handleExportCollection(col.id)}
                title="导出合集"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 hover:text-destructive"
                onClick={() => handleDeleteCollection(col.id)}
                title="删除合集"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <CardDescription className="flex items-center gap-2">
            <Package className="w-3 h-3" />
            {assetCount} 个素材
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {assetCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {getCollectionAssets(col.id)
                .slice(0, 5)
                .map((ca) => {
                  let name = String(ca.assetId || "");
                  if (ca.assetType === "character") {
                    const c = characters.find((ch) => ch.id === ca.assetId);
                    if (c) name = String(c.name || "");
                  } else if (ca.assetType === "scene") {
                    const s = scenes.find((sc) => sc.id === ca.assetId);
                    if (s) name = String(s.name || "");
                  }
                  return (
                    <Badge
                      key={String(ca.id || "")}
                      variant="secondary"
                      className="text-xs"
                    >
                      {ca.assetType === "character"
                        ? "👤"
                        : ca.assetType === "scene"
                          ? "🏞️"
                          : "🎬"}
                      {name}
                    </Badge>
                  );
                })}
              {assetCount > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{assetCount - 5}
                </Badge>
              )}
            </div>
          )}
          {col.createdAt && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {toDateFromTimestamp(col.createdAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

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
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  删除
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

          <TabsContent value="characters" className="mt-4">
            {filteredCharacters.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Users className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                  <h3 className="text-xl font-bold mb-2">角色库为空</h3>
                  <p className="text-muted-foreground">
                    前往角色页面创建角色，素材会自动入库
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredCharacters.map(renderCharacterCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="scenes" className="mt-4">
            {filteredScenes.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                  <h3 className="text-xl font-bold mb-2">场景库为空</h3>
                  <p className="text-muted-foreground">
                    前往场景页面创建场景，素材会自动入库
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredScenes.map(renderSceneCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="storyboards" className="mt-4">
            {filteredStoryboards.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <Film className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                  <h3 className="text-xl font-bold mb-2">分镜库为空</h3>
                  <p className="text-muted-foreground">
                    在分镜编辑器中保存分镜，素材会自动入库
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredStoryboards.map(renderStoryboardCard)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="collections" className="mt-4">
            <div className="mb-4">
              <Button onClick={() => setIsNewCollectionDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                新建合集
              </Button>
            </div>
            {collections.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12 text-center">
                  <FolderOpen className="w-16 h-16 mx-auto mb-4 text-slate-500" />
                  <h3 className="text-xl font-bold mb-2">暂无合集</h3>
                  <p className="text-muted-foreground">
                    创建合集来组织你的角色、场景和分镜素材
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {collections.map(renderCollectionCard)}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 编辑对话框 */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
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
                      setEditingItem({ ...editingItem, name: e.target.value } as EditingItem)
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">描述</label>
                  <Textarea
                    value={editingItem._type === "storyboard" ? (editingItem.script || "") : (editingItem.description || "")}
                    onChange={(e) => {
                      if (editingItem._type === "storyboard") {
                        setEditingItem({
                          ...editingItem,
                          script: e.target.value,
                        } as EditingItem);
                      } else {
                        setEditingItem({
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
                      setEditingItem({
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
                onClick={() => setIsEditDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                disabled={isSavingEdit}
                onClick={async () => {
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
                    showError(
                      "保存失败",
                      e instanceof Error ? e.message : "未知错误",
                    );
                  } finally {
                    setIsSavingEdit(false);
                  }
                }}
              >
                {isSavingEdit ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 加入合集对话框 */}
        <Dialog
          open={isCollectionDialogOpen}
          onOpenChange={setIsCollectionDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>加入合集</DialogTitle>
              <DialogDescription>
                选择一个合集，将选中的 {selectedIds.size} 个素材添加进去
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
                onClick={handleAddToCollection}
                disabled={!addToCollectionId}
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                加入
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 新建合集对话框 */}
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
                if (e.key === "Enter") handleCreateCollection();
              }}
            />
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setIsNewCollectionDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleCreateCollection}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 导入对话框 */}
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
      </div>
    </PageErrorBoundary>
  );
}
