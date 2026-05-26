"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { StoryBeat, Character, Scene } from "@/domain/schemas";
import type { VideoTask } from "@/modules/video";
import { useCharacters } from "@/modules/character";
import { useScenes } from "@/modules/scene";
import { useStories } from "@/modules/story";
import { useVideoTasks } from "@/modules/video";
import { characterService } from "@/modules/character";
import { sceneService } from "@/modules/scene";
import { storyService } from "@/modules/story";
import { resolveImageUrl } from "@/shared/utils/image-url";
import { getVideoUrlWithCache, revokeObjectURL } from "@/modules/video";
import { errorLogger } from "@/shared/error-logger";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PageErrorBoundary } from "@/shared/presentation/PageErrorBoundary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useToastHelpers } from "@/shared/presentation/Toast";
import {
  Image,
  Video,
  Filter,
  Search,
  Trash2,
  Download,
  Copy,
  Folder,
  User,
  MapPin,
  Film,
} from "lucide-react";
// 媒体项类型定义
interface MediaItem {
  id: string;
  type: "image" | "video";
  url: string;
  name: string;
  description: string;
  createdAt: Date;
  tags: string[];
  source: "character" | "scene" | "story" | "direct";
  sourceId?: string;
  sourceName?: string;
}

function toDateFromTimestamp(ts: unknown): Date {
  if (typeof ts === "number") return new Date(ts * 1000);
  if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export default function MediaLibraryPage() {
  const { success, error: showError } = useToastHelpers();
  const { data: characters = [], refetch: refetchCharacters } = useCharacters();
  const { data: scenes = [], refetch: refetchScenes } = useScenes();
  const { data: stories = [], refetch: refetchStories } = useStories();
  const { data: videoTasks = [] } = useVideoTasks();
  const [activeTab, setActiveTab] = useState<"all" | "images" | "videos">(
    "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // 从实际数据中生成媒体列表
  const mediaItems = useMemo(() => {
    const items: MediaItem[] = [];

    // 添加角色图片和视频
    characters.forEach((char) => {
      const generatedImage = char.generatedImage as string | undefined;
      const generatedVideo = char.generatedVideo as string | undefined;
      const id = char.id as string;
      const name = (char.name as string) || "未命名角色";
      const description = (char.description as string) || "";
      const personality = (char.personality as string[]) || [];

      if (generatedImage) {
        items.push({
          id: `char-img-${id}`,
          type: "image",
          url: generatedImage,
          name,
          description,
          createdAt: toDateFromTimestamp(char.updatedAt),
          tags: ["角色", ...personality.slice(0, 3)],
          source: "character",
          sourceId: id,
          sourceName: name,
        });
      }
      if (generatedVideo) {
        items.push({
          id: `char-vid-${id}`,
          type: "video",
          url: generatedVideo,
          name: `${name} - 360度展示`,
          description,
          createdAt: toDateFromTimestamp(char.updatedAt),
          tags: ["视频", "角色", "360度"],
          source: "character",
          sourceId: id,
          sourceName: name,
        });
      }
    });

    // 添加场景图片和视频
    scenes.forEach((scene) => {
      const generatedImage = scene.generatedImage as string | undefined;
      const generatedVideo = scene.generatedVideo as string | undefined;
      const id = scene.id as string;
      const name = (scene.name as string) || "未命名场景";
      const description = (scene.description as string) || "";
      const type = (scene.type as string) || "";
      const timeOfDay = (scene.timeOfDay as string) || "";

      if (generatedImage) {
        items.push({
          id: `scene-img-${id}`,
          type: "image",
          url: generatedImage,
          name,
          description,
          createdAt: toDateFromTimestamp(scene.updatedAt),
          tags: ["场景", type, timeOfDay].filter(Boolean),
          source: "scene",
          sourceId: id,
          sourceName: name,
        });
      }
      if (generatedVideo) {
        items.push({
          id: `scene-vid-${id}`,
          type: "video",
          url: generatedVideo,
          name: `${name} - 360度展示`,
          description,
          createdAt: toDateFromTimestamp(scene.updatedAt),
          tags: ["视频", "场景", "360度"],
          source: "scene",
          sourceId: id,
          sourceName: name,
        });
      }
    });

    // 添加故事镜头图片
    stories.forEach((story) => {
      const beats = story.beats as StoryBeat[] | undefined;
      const id = story.id as string;
      const title = (story.title as string) || "未命名故事";
      if (beats) {
        beats.forEach((beat: StoryBeat) => {
          if (beat.keyframe?.imageUrl) {
            items.push({
              id: `story-${id}-beat-${beat.id}`,
              type: "image",
              url: beat.keyframe.imageUrl,
              name: `${title} - ${beat.title || `镜头 ${beat.sequence || 1}`}`,
              description: beat.content || beat.description || "",
              createdAt: toDateFromTimestamp(story.updatedAt),
              tags: ["故事", `镜头${beat.sequence || 1}`],
              source: "story",
              sourceId: id,
              sourceName: title,
            });
          }
        });
      }
    });

    // 添加视频任务生成的视频
    videoTasks.forEach((task: VideoTask) => {
      const videoUrl = task.videoUrl as string | undefined;
      const taskId = task.taskId as string;
      const prompt = task.prompt as string | undefined;
      const message = task.message as string | undefined;
      const model = task.model as string | undefined;
      const storyTitle = task.storyTitle as string | undefined;
      const beatTitle = task.beatTitle as string | undefined;

      if (videoUrl) {
        items.push({
          id: `task-vid-${taskId}`,
          type: "video",
          url: videoUrl,
          name: prompt
            ? prompt.length > 30
              ? prompt.substring(0, 30) + "..."
              : prompt
            : `视频任务 ${(taskId || "unknown").substring(0, 8)}`,
          description: prompt || message || "",
          createdAt: toDateFromTimestamp(task.createdAt),
          tags: ["视频", "AI生成", model || ""].filter(Boolean),
          source: "direct",
          sourceId: taskId,
          sourceName: storyTitle || beatTitle || "快速生成",
        });
      }
    });

    // 按时间倒序排列
    return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [characters, scenes, stories, videoTasks]);

  // 视频缓存URL映射
  const [cachedVideoUrls, setCachedVideoUrls] = useState<
    Record<string, { url: string; taskId: string }>
  >({});

  const cachedVideoUrlsRef = useRef<
    Record<string, { url: string; taskId: string }>
  >({});

  const mediaItemIds = useMemo(() => mediaItems.map((item) => item.id).sort().join(","), [mediaItems]);

  useEffect(() => {
    const videoItems = mediaItems.filter(
      (item) => item.type === "video" && item.sourceId,
    );
    let cancelled = false;
    const loadCachedUrls = async () => {
      const currentCached = cachedVideoUrlsRef.current;
      const newItems = videoItems.filter(
        (item) => item.sourceId && item.url && !currentCached[item.id],
      );
      if (newItems.length === 0) return;
      const entries = await Promise.all(
        newItems.map(async (item) => {
          const result = await getVideoUrlWithCache(item.sourceId!, item.url);
          return result.ok && result.value.url
            ? { id: item.id, url: result.value.url, taskId: item.sourceId! }
            : null;
        }),
      );
      const newUrls: Record<string, { url: string; taskId: string }> = {};
      for (const entry of entries) {
        if (entry && !cancelled) {
          newUrls[entry.id] = { url: entry.url, taskId: entry.taskId };
        }
      }
      if (!cancelled && Object.keys(newUrls).length > 0) {
        const updated = { ...currentCached, ...newUrls };
        cachedVideoUrlsRef.current = updated;
        setCachedVideoUrls(updated);
      }
    };
    if (videoItems.length > 0) {
      loadCachedUrls();
    }
    return () => {
      cancelled = true;
    };
  }, [mediaItemIds]);

  const prevCachedUrlsRef = useRef<Record<string, { url: string }>>({});

  useEffect(() => {
    const prev = prevCachedUrlsRef.current;
    const currentIds = new Set(Object.keys(cachedVideoUrls));
    for (const [id, entry] of Object.entries(prev)) {
      const { url } = entry as { url: string };
      if (!currentIds.has(id)) {
        revokeObjectURL(url);
      }
    }
    prevCachedUrlsRef.current = cachedVideoUrls;
  }, [cachedVideoUrls]);

  useEffect(() => {
    return () => {
      const current = cachedVideoUrlsRef.current;
      Object.values(current).forEach(({ url }) => {
        if (url.startsWith("blob:")) {
          revokeObjectURL(url);
        }
      });
    };
  }, []);

  // 过滤媒体项
  const filteredItems = mediaItems.filter((item) => {
    // 按类型过滤
    if (activeTab === "images" && item.type !== "image") return false;
    if (activeTab === "videos" && item.type !== "video") return false;

    // 按搜索词过滤
    if (
      searchQuery &&
      !item.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !item.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // 按来源过滤
    if (filter !== "all" && item.source !== filter) return false;

    return true;
  });

  // 切换选择模式
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedItems([]);
  };

  // 切换项目选择
  const toggleItemSelection = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);

  const handleBatchDeleteRequest = () => {
    if (selectedItems.length === 0) return;
    setBatchDeleteConfirmOpen(true);
  };

  const handleBatchDelete = async () => {
    const selectedSet = new Set(selectedItems);

    try {
      for (const char of characters) {
        const needUpdate =
          selectedSet.has(`char-img-${char.id}`) ||
          selectedSet.has(`char-vid-${char.id}`);
        if (needUpdate) {
          const updateData: Partial<Character> & { id: string } = {
            id: char.id,
          };
          if (selectedSet.has(`char-img-${char.id}`)) {
            updateData.generatedImage = undefined;
          }
          if (selectedSet.has(`char-vid-${char.id}`)) {
            updateData.generatedVideo = undefined;
          }
          const result = await characterService.update(char.id, updateData);
          if (!result.ok) throw result.error;
        }
      }

      for (const scene of scenes) {
        const needUpdate =
          selectedSet.has(`scene-img-${scene.id}`) ||
          selectedSet.has(`scene-vid-${scene.id}`);
        if (needUpdate) {
          const updateData: Partial<Scene> & { id: string } = { id: scene.id };
          if (selectedSet.has(`scene-img-${scene.id}`)) {
            updateData.generatedImage = undefined;
          }
          if (selectedSet.has(`scene-vid-${scene.id}`)) {
            updateData.generatedVideo = undefined;
          }
          const result = await sceneService.update(scene.id, updateData);
          if (!result.ok) throw result.error;
        }
      }

      for (const story of stories) {
        if (!story.beats) continue;
        const updatedBeats = story.beats.map((beat: StoryBeat) => {
          if (selectedSet.has(`story-${story.id}-beat-${beat.id}`)) {
            return {
              ...beat,
              keyframe: beat.keyframe
                ? { ...beat.keyframe, imageUrl: undefined }
                : undefined,
              framePair: beat.framePair
                ? {
                    ...beat.framePair,
                    firstFrameUrl: undefined,
                    lastFrameUrl: undefined,
                  }
                : undefined,
              videoGen: beat.videoGen
                ? { ...beat.videoGen, videoUrl: undefined }
                : undefined,
            };
          }
          return beat;
        });
        const hasChanges = updatedBeats.some(
          (beat, i) => beat !== story.beats[i],
        );
        if (hasChanges) {
          const result = await storyService.update(story.id, {
            id: story.id,
            beats: updatedBeats,
          });
          if (!result.ok) throw result.error;
        }
      }

      const taskIdsToDelete: string[] = [];
      for (const item of mediaItems) {
        if (
          item.type === "video" &&
          item.source === "direct" &&
          item.sourceId &&
          selectedSet.has(item.id)
        ) {
          taskIdsToDelete.push(item.sourceId);
        }
      }
      for (const taskId of taskIdsToDelete) {
        const { videoTaskStorage } = await import("@/infrastructure/storage");
        await videoTaskStorage.deleteVideoTask(taskId);
      }
    } catch (error) {
      errorLogger.error("批量删除失败", error);
      showError("批量删除失败", "部分或全部媒体项删除未成功");
    }

    setSelectedItems([]);
    setIsSelectionMode(false);
    setBatchDeleteConfirmOpen(false);
    refetchCharacters();
    refetchScenes();
    refetchStories();
    success("删除成功", `已删除 ${selectedItems.length} 个媒体项`);
  };

  const handleBatchDownload = async () => {
    const selectedMediaItems = mediaItems.filter((item) =>
      selectedItems.includes(item.id),
    );
    for (const item of selectedMediaItems) {
      try {
        let downloadUrl = item.url;
        if (
          item.type === "video" &&
          item.sourceId &&
          cachedVideoUrls[item.id]
        ) {
          downloadUrl = cachedVideoUrls[item.id].url;
        }
        let blob: Blob;
        if (downloadUrl.startsWith("blob:")) {
          const response = await fetch(downloadUrl);
          if (!response.ok) throw new Error(`下载失败: ${response.status}`);
          blob = await response.blob();
        } else {
          const response = await fetch(downloadUrl);
          if (!response.ok) throw new Error(`下载失败: ${response.status}`);
          blob = await response.blob();
        }
        const url = URL.createObjectURL(blob);
        try {
          const link = document.createElement("a");
          link.href = url;
          link.download = `${item.name}.${item.type === "image" ? "png" : "mp4"}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch {
        const link = document.createElement("a");
        const fallbackUrl =
          item.type === "video" && cachedVideoUrls[item.id]
            ? cachedVideoUrls[item.id].url
            : item.url;
        link.href = fallbackUrl;
        link.download = `${item.name}.${item.type === "image" ? "png" : "mp4"}`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  // 格式化日期
  const formatDate = (date: Date) => {
    if (isNaN(date.getTime())) return "未知时间";
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const HH = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
  };

  return (
    <PageErrorBoundary>
      <div className="h-full space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Folder className="w-5 h-5" />
              媒体库
            </h2>
            <p className="text-sm text-muted-foreground">
              管理和查看所有生成的图片和视频
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSelectionMode ? (
              <>
                <Button
                  size="sm"
                  className="gap-1"
                  onClick={handleBatchDownload}
                >
                  <Download className="w-4 h-4" />
                  下载 ({selectedItems.length})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={handleBatchDeleteRequest}
                >
                  <Trash2 className="w-4 h-4" />
                  删除 ({selectedItems.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleSelectionMode}
                >
                  取消
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={toggleSelectionMode}
              >
                <Filter className="w-4 h-4" />
                选择
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索媒体..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={filter}
              onValueChange={(value) => setFilter(value || "all")}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="过滤来源" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有来源</SelectItem>
                <SelectItem value="character">角色</SelectItem>
                <SelectItem value="scene">场景</SelectItem>
                <SelectItem value="story">故事</SelectItem>
                <SelectItem value="direct">直接生成</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="images">图片</TabsTrigger>
            <TabsTrigger value="videos">视频</TabsTrigger>
          </TabsList>
        </Tabs>

        {filteredItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <Card
                key={item.id}
                className={`relative overflow-hidden transition-all hover:shadow-lg ${isSelectionMode ? "cursor-pointer" : ""}`}
              >
                {isSelectionMode && (
                  <div
                    className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center ${selectedItems.includes(item.id) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleItemSelection(item.id);
                    }}
                  >
                    {selectedItems.includes(item.id) && "✓"}
                  </div>
                )}

                <div className="relative aspect-video bg-muted flex items-center justify-center overflow-hidden">
                  {item.type === "image" ? (
                    <img
                      src={resolveImageUrl(item.url)}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={resolveImageUrl(
                        cachedVideoUrls[item.id]?.url || item.url,
                      )}
                      controls
                      loop
                      playsInline
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLVideoElement;
                        if (!target.dataset.retried) {
                          target.dataset.retried = "1";
                          target.src = item.url;
                        }
                      }}
                    >
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
                        <Video className="w-12 h-12 mb-2 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          视频
                        </span>
                      </div>
                    </video>
                  )}

                  <div className="absolute top-2 left-2 z-10">
                    {item.source === "character" && (
                      <div className="w-7 h-7 rounded-md bg-purple-600 flex items-center justify-center text-white">
                        <User className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {item.source === "scene" && (
                      <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white">
                        <MapPin className="w-3.5 h-3.5" />
                      </div>
                    )}
                    {item.source === "story" && (
                      <div className="w-7 h-7 rounded-md bg-orange-600 flex items-center justify-center text-white">
                        <Film className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-2 right-2 z-10">
                    <Badge variant="secondary" className="text-xs">
                      {item.type === "image" ? "图片" : "视频"}
                    </Badge>
                  </div>
                </div>

                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium truncate">
                    {item.name}
                  </CardTitle>
                  <CardDescription className="text-xs flex items-center gap-2">
                    <span>{formatDate(item.createdAt)}</span>
                    {item.sourceName && (
                      <>
                        <span>•</span>
                        <span className="truncate">{item.sourceName}</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 space-y-2">
                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {item.tags.filter(Boolean).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(item.url);
                          success("已复制", "链接已复制到剪贴板");
                        } catch {
                          const textArea = document.createElement("textarea");
                          textArea.value = item.url;
                          document.body.appendChild(textArea);
                          textArea.select();
                          document.execCommand("copy");
                          document.body.removeChild(textArea);
                          success("已复制", "链接已复制到剪贴板");
                        }
                      }}
                    >
                      <Copy className="w-3 h-3" />
                      复制链接
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={async () => {
                        try {
                          const response = await fetch(item.url);
                          if (!response.ok)
                            throw new Error(`下载失败: ${response.status}`);
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = item.name;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        } catch {
                          const link = document.createElement("a");
                          link.href = item.url;
                          link.download = item.name;
                          link.target = "_blank";
                          link.rel = "noopener noreferrer";
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }
                      }}
                    >
                      <Download className="w-3 h-3" />
                      下载
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Alert variant="default" className="text-center py-12">
            <Image className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <AlertTitle>没有找到媒体</AlertTitle>
            <AlertDescription>尝试调整搜索条件或生成一些媒体</AlertDescription>
          </Alert>
        )}

        <Dialog
          open={batchDeleteConfirmOpen}
          onOpenChange={setBatchDeleteConfirmOpen}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                确定要删除选中的 {selectedItems.length}{" "}
                个媒体项吗？此操作将同时移除关联角色/场景/故事中的对应图片或视频，且不可撤销。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setBatchDeleteConfirmOpen(false)}
              >
                取消
              </Button>
              <Button variant="destructive" onClick={handleBatchDelete}>
                确认删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageErrorBoundary>
  );
}
