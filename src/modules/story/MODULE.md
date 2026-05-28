# Story Module

## 职责

故事创作与分镜管理：覆盖从故事规划、分镜编辑、AI 生成（关键帧/首尾帧/视频）、批量编排到模板版本控制的完整工作流。

---

## 子域结构

本模块采用子域架构，包含 5 个内部子域：

| 子域 | 路径 | 职责 |
|------|------|------|
| `planning` | [planning/](./planning/) | 故事 CRUD、AI 规划、保存逻辑、常量定义 |
| `beat-editor` | [beat-editor/](./beat-editor/) | 分镜状态管理、资产加载、分镜编辑器 UI |
| `generation` | [generation/](./generation/) | 关键帧/首尾帧/视频生成、批量编排、上传处理、风格指南 |
| `template` | [template/](./template/) | 分镜模板管理、版本控制、导入导出 |
| `prompt-editor` | [prompt-editor/](./prompt-editor/) | 提示词 AI 生成、默认构建、编辑器 Hook |

---

## 公共 API (index.ts)

### 规划子域 (planning)

#### Services

```typescript
storyService.getAll(): Promise<Result<Story[]>>
storyService.getById(id: string): Promise<Result<Story>>
storyService.create(input: CreateStoryInput): Promise<Result<Story>>
storyService.update(id: string, input: UpdateStoryInput): Promise<Result<void>>
storyService.delete(id: string): Promise<Result<void>>
storyService.count(): Promise<Result<number>>
storyService.getByBeatId(beatId: string): Promise<Result<Story>>
storyService.updateBeatMediaUrls(beats: Array<{
  id: string;
  keyframeImageUrl?: string;
  firstFrameImageUrl?: string;
  lastFrameImageUrl?: string;
  videoUrl?: string;
  localKeyframePath?: string;
  localFirstFramePath?: string;
  localLastFramePath?: string;
  localVideoPath?: string;
}>): Promise<void>

planStory(story: Story, characters: Character[], scenes: Scene[], options?: StoryPlanningOptions): Promise<Result<StoryPlanningResult>>
checkTextApiConfig(): Promise<Result<boolean>>
```

#### Hooks

```typescript
useStoryPlanner(props: {
  currentStory: Story;
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  generationEnhanced: boolean;
  activeVideoTaskCount?: number;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}): { planStoryWithAI: () => Promise<void>; isPlanningStory: boolean }

useStories(): UseQueryResult<Story[]>
useStory(id: string): UseQueryResult<Story>
useStoryCount(): UseQueryResult<number>
useCreateStory(): UseMutationResult<Story, Error, CreateStoryInput>
useUpdateStory(): UseMutationResult<void, Error, UpdateStoryInput>
useDeleteStory(): UseMutationResult<void, Error, string>

useStorySaver(props: {
  stories: Story[];
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story;
  setCurrentStory: (update: Story | ((prev: Story) => Story), skipDirty?: boolean) => void;
  beats: StoryBeat[];
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  markClean: (key: string) => void;
  markDirty: (key: string) => void;
}): {
  handleSave: () => Promise<void>;
  handleRestoreVersion: (version: StoryVersion) => Promise<void>;
  handleDeleteStory: (storyId: string) => void;
  performDeleteStory: () => Promise<void>;
  applyStoryTemplate: (template: StoryTemplate) => void;
  applyStoryboardTemplate: (templateBeats: Array<Partial<StoryBeat>>) => void;
  handleSaveTemplate: (template: StoryboardTemplate) => void;
  handleDeleteTemplate: (id: string) => void;
  templateDialogOpen: boolean;
  setTemplateDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  versionDialogOpen: boolean;
  setVersionDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  recommendedTemplates: StoryTemplate[];
  savedTemplates: StoryboardTemplate[];
  updateRecommendedTemplates: (genre: string, tone: string) => void;
  storyToDelete: string | null;
  saveStatus: SaveStatus;
  saveError: string;
}
```

#### Constants & Types

```typescript
DEFAULT_STORY: Story
genres: Array<{ value: string; label: string; description: string }>
tones: Array<{ value: string; label: string; color: string }>
beatTypes: Array<{ value: string; label: string; color: string; description: string }>
type CreationMode = "quick" | "professional"
type QuickInputMode = "direct" | "placeholder" | "plain"
interface PlaceholderBinding { id: string; placeholder: string; type: "character" | "scene"; targetId: string | null }
interface QuickStoryData { content: string; placeholderBindings: PlaceholderBinding[] }
interface StoryPlanningOptions { maxRetries?: number; autoFix?: boolean; fewShotCount?: number; strictMode?: boolean; showFixDetails?: boolean; enhancedGeneration?: boolean }
interface StoryPlanningResult { beats: StoryBeat[]; autoFixedCount: number; retryCount: number; fixDetails: string[] }
```

### 引用解析

```typescript
resolveCharacterRef(character: Character, beat: StoryBeat): string | undefined
resolveSceneRef(scene: Scene): string | undefined
```

### 生成子域 (generation)

#### Services

```typescript
generateBeatKeyframe(beat: StoryBeat, prevBeat: StoryBeat | null, options: {
  characterRef?: string; sceneRef?: string; providerId?: string; modelId?: string;
  characters?: Character[]; scenes?: Scene[]; elements?: StoryElement[];
  customPrompt?: string; styleGuide?: StoryStyleGuide;
}, providers: ProviderDeps): Promise<Result<StoryBeatKeyframe>>

generateBeatFramePair(beat: StoryBeat, options: {
  characterRef?: string; sceneRef?: string; prevLastFrameUrl?: string;
  providerId?: string; modelId?: string; characters?: Character[]; scenes?: Scene[];
  elements?: StoryElement[]; customFirstFramePrompt?: string; customLastFramePrompt?: string;
  styleGuide?: StoryStyleGuide; autoGeneratePrompts?: boolean; beatIndex?: number;
  prevBeatDescription?: string; nextBeatDescription?: string;
}, providers: ProviderDeps): Promise<Result<StoryBeatFramePair>>

generateBeatVideo(beat: StoryBeat, options: {
  characterRef?: string; sceneRef?: string; prompt?: string; prevVideoUrl?: string;
  providerId?: string; modelId?: string; videoMode?: VideoGenerationMode; prevBeat?: StoryBeat | null;
}, providers: ProviderDeps): Promise<Result<{ taskId: string; videoUrl?: string; status: string; videoMode: VideoGenerationMode }>>

generateBeatFullWorkflow(beat: StoryBeat, prevBeat: StoryBeat | null, options: {
  characterRef?: string; sceneRef?: string; providerId?: string; modelId?: string;
  characters?: Character[]; scenes?: Scene[]; elements?: StoryElement[];
  styleGuide?: StoryStyleGuide; beatIndex?: number;
  prevBeatDescription?: string; nextBeatDescription?: string;
}, providers: ProviderDeps, onProgress?: (step: string, progress: number) => void): Promise<Result<{
  keyframe: StoryBeatKeyframe; framePair: StoryBeatFramePair;
  videoTaskId: string; videoMode: VideoGenerationMode;
}>>

generateKeyframeChain(beats: StoryBeat[], options: {
  getCharacterRef?: (beat: StoryBeat) => string | undefined;
  getSceneRef?: (beat: StoryBeat) => string | undefined;
  providerId?: string; modelId?: string; styleGuide?: StoryStyleGuide;
}, providers: ProviderDeps, onProgress?: (index: number, total: number, beatId: string) => void): Promise<Result<Map<string, StoryBeatKeyframe>>>

generateFramePairChain(beats: StoryBeat[], options: {
  characters: Character[]; scenes: Scene[]; elements?: StoryElement[];
  providerId?: string; modelId?: string; styleGuide?: StoryStyleGuide;
}, providers: ProviderDeps, onProgress?: (index: number, total: number, beatId: string) => void): Promise<Result<Map<string, StoryBeatFramePair>>>

determineVideoGenerationMode(beat: StoryBeat, prevBeat: StoryBeat | null): VideoGenerationMode

generateFramePrompts(input: {
  beat: StoryBeat; index: number; characters: Character[]; scenes: Scene[];
  elements?: StoryElement[]; styleGuide?: StoryStyleGuide;
  prevBeatDescription?: string; nextBeatDescription?: string; textProvider: ITextProvider;
}): Promise<Result<{ firstFramePrompt: string; lastFramePrompt: string }>>

batchGenerateFramePrompts(beats: StoryBeat[], options: {
  characters: Character[]; scenes: Scene[]; elements?: StoryElement[];
  styleGuide?: StoryStyleGuide; textProvider: ITextProvider;
}): Promise<Result<Map<string, { firstFramePrompt: string; lastFramePrompt: string }>>>

generateStyleGuide(input: {
  storyTitle: string; storyDescription: string; genre?: string; tone?: string;
  characters: Character[]; scenes: Scene[]; customArtStyle?: string;
  customColorPalette?: string[]; customMoodAtmosphere?: string;
  providerId?: string; modelId?: string; textProvider: ITextProvider; imageProvider: IImageProvider;
}): Promise<Result<StoryStyleGuide>>

generateStylePromptOnly(input: {
  genre?: string; tone?: string; characters: Character[]; scenes: Scene[];
  artStyle: string; colorPalette: string[]; moodAtmosphere: string;
}): Promise<Result<string>>
```

#### Video URL Sync

```typescript
buildVideoUrlUpdates(beats: StoryBeat[], completedTaskUrls: Map<string, string>): VideoUrlUpdate[]
applyVideoUrlUpdates(beats: StoryBeat[], updates: VideoUrlUpdate[]): StoryBeat[]
buildBeatsPersistData(beats: StoryBeat[], completedTaskUrls: Map<string, string>): BeatPersistData[]
buildCacheRequests(beats: StoryBeat[]): CacheRequest[]
filterRemoteCacheRequests(requests: CacheRequest[]): CacheRequest[]
```

#### Hooks

```typescript
useAIGeneratorBase(props: AIGeneratorBaseProps): {
  findBeat: (beatId: string) => StoryBeat | null;
  resolvePrevBeat: (beatId: string, prevBeatOverride?: StoryBeat | null) => StoryBeat | null;
  resolveRefs: (beat: StoryBeat, prevBeat?: StoryBeat | null) => ResolvedRefs;
  checkModelConfig: (model: ModelSelection | null, errorTitle: string, errorDesc: string) => boolean;
  withGenerationState: <T>(beatId: string, fn: (signal: AbortSignal) => Promise<T>, errorTitle: string) => Promise<T | void>;
  updateBeat: (beatId: string, updates: Partial<StoryBeat>) => void;
  abortGeneration: (beatId?: string) => void;
}

useKeyframeGenerator(props: {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  selectedImageModel: ModelSelection | null;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showConfirm?: (title: string, description: string) => Promise<boolean>;
}): {
  generateKeyframe: (beatId: string, prevBeatOverride?: StoryBeat | null, customPrompt?: string) => Promise<StoryBeat | void>;
  regenerateKeyframe: (beatId: string) => Promise<void>;
  generatingKeyframe: string | null;
  setGeneratingKeyframe: React.Dispatch<React.SetStateAction<string | null>>;
}

useFramePairGenerator(props: {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  selectedImageModel: ModelSelection | null;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}): { generateFramePair: (beatId: string, prevBeatOverride?: StoryBeat | null, customFirstFramePrompt?: string, customLastFramePrompt?: string) => Promise<StoryBeat | void>; generatingFramePair: string | null }

useVideoGenerator(props: {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  currentStory: Story;
  selectedVideoModel: ModelSelection | null;
  createTask: (prompt: string, _deprecated?: undefined, extraOptions?: { duration?: number; beatId?: string; storyId?: string; storyTitle?: string; beatTitle?: string; firstFrameUrl?: string; fixedImageUrl?: string; fixedImageLockType?: "character" | "scene"; lastFrameUrl?: string; providerId?: string; modelId?: string; format?: string; characterRef?: string; sceneRef?: string; referenceVideo?: string | null }) => Promise<(VideoTask & { promptWasTruncated?: boolean }) | null>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}): { generateVideoNew: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<void>; generatingVideo: string | null }

useBatchGenerator(props: {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  generateKeyframe: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  generateFramePair: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  generateVideoNew: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<void>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}): {
  batchGenerateKeyframes: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  batchGenerateFramePairs: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  batchGenerateVideos: (beatIds?: string[], options?: BatchOptions) => Promise<BatchResult>;
  shouldUseChainReference: (beat: StoryBeat, level: GenerationLevel) => boolean;
  getPrevBeatForChain: (index: number, targetBeats: StoryBeat[], level: GenerationLevel) => StoryBeat | null;
}

useUploadHandlers(setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>, success: (title: string, description?: string) => void, warn?: (title: string, description?: string) => void, providerFormat?: VideoModelFormat, showError?: (title: string, description?: string) => void): {
  handleUploadKeyframe: (beatId: string, file: File) => Promise<void>;
  handleUploadFirstFrame: (beatId: string, file: File) => Promise<void>;
  handleUploadLastFrame: (beatId: string, file: File) => Promise<void>;
  handleUploadVideo: (beatId: string, file: File) => Promise<void>;
}
```

#### Components

- `ShotGenerationPanel` — 分镜生成面板
- `KeyframePanel` — 关键帧面板
- `KeyframeChainVisualizer` — 关键帧链可视化
- `PromptPreview` — 提示词预览
- `ShotReferenceConfig` — 分镜引用配置
- `ReferenceVideoUploader` — 引用视频上传

#### Types

```typescript
type VideoGenerationMode = "first_frame_anchor" | "reference_video_continuation" | "auto"
const BatchStrategy: { ALL_SERIAL: "all_serial"; SKIP_COMPLETED: "skip_completed"; PARALLEL_BATCH: "parallel_batch" }
type BatchStrategy = "all_serial" | "skip_completed" | "parallel_batch"
const GenerationLevel: { KEYFRAME: "keyframe"; FRAMEPAIR: "framepair"; VIDEO: "video" }
type GenerationLevel = "keyframe" | "framepair" | "video"
interface BatchOptions { strategy?: BatchStrategy; chainMode?: ChainMode; skipOnError?: boolean; continueOnFallback?: boolean }
interface BatchResult { success: number; failed: number; skipped: number }
interface AIGeneratorBaseProps { beatsRef: React.MutableRefObject<StoryBeat[]>; charactersRef: React.MutableRefObject<Character[]>; scenesRef: React.MutableRefObject<Scene[]>; setBeats?: React.Dispatch<React.SetStateAction<StoryBeat[]>>; setGenerating: React.Dispatch<React.SetStateAction<string | null>>; success: (title: string, description?: string) => void; showError: (title: string, description?: string) => void; showConfirm?: (title: string, description: string) => Promise<boolean> }
interface ResolvedRefs { characterRef: string | undefined; sceneRef: string | undefined; prevBeat: StoryBeat | null }
interface VideoUrlUpdate { beatId: string; videoUrl: string }
interface BeatPersistData { id: string; keyframeImageUrl?: string; firstFrameImageUrl?: string; lastFrameImageUrl?: string; videoUrl?: string; localKeyframePath?: string; localFirstFramePath?: string; localLastFramePath?: string; localVideoPath?: string }
interface CacheRequest { beatId: string; field: "localKeyframePath" | "localFirstFramePath" | "localLastFramePath"; url: string }
```

### 分镜编辑子域 (beat-editor)

#### Hooks

```typescript
useStoryState(): {
  stories: Story[];
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story;
  setCurrentStory: (update: Story | ((prev: Story) => Story), skipDirty?: boolean) => void;
  setCurrentStoryRaw: React.Dispatch<React.SetStateAction<Story>>;
  beats: StoryBeat[];
  setBeats: (update: StoryBeat[] | ((prev: StoryBeat[]) => StoryBeat[]), skipDirty?: boolean) => void;
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  hasUnsavedChanges: boolean;
  addBeat: (type?: StoryBeat["type"]) => void;
  updateBeat: (id: string, updates: Partial<StoryBeat>) => void;
  deleteBeat: (beatId: string) => void;
  moveBeat: (id: string, direction: "up" | "down") => void;
  markClean: (key: string) => void;
  markDirty: (key: string) => void;
  generationEnhanced: boolean;
  setGenerationEnhanced: React.Dispatch<React.SetStateAction<boolean>>;
  selectedVideoModel: ModelSelection | null;
  setSelectedVideoModel: (value: ModelSelection | null) => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (value: ModelSelection | null) => void;
}

useAssetLoader(services: {
  getAllCharacters: () => Promise<{ ok: boolean; value?: Character[] }>;
  getAllScenes: () => Promise<{ ok: boolean; value?: Scene[] }>;
  getStoryboardAssets: () => Promise<Array<{ id: string; script?: string; previewPath?: string }>>;
}): {
  characters: Character[];
  scenes: Scene[];
  assets: LoadedAsset[];
  isLoading: boolean;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
}
```

#### Components

- `BeatDetailEditor` — 分镜详情编辑器
- `BeatOverviewCard` — 分镜概览卡片
- `SortableBeatList` — 可排序分镜列表
- `ElementBindingPanel` — 元素绑定面板
- `ProfessionalModeEditor` — 专业模式编辑器

### 模板子域 (template)

#### Services

```typescript
createTemplateFromBeats(name: string, description: string, beats: StoryBeat[], options?: {
  category?: string; genre?: string; tone?: string; tags?: string[]; author?: string;
}): StoryboardTemplate

applyTemplateToBeats(template: StoryboardTemplate): Array<Partial<StoryBeat>>

exportTemplateToFile(template: StoryboardTemplate): void

importTemplateFromFile(file: File): Promise<Result<StoryboardTemplate>>

saveVersion(story: Story, beats: StoryBeat[], changeSummary?: string, autoSaved?: boolean): Promise<Result<StoryVersion | null>>

restoreVersion(version: StoryVersion, currentStory: Story, currentBeats: StoryBeat[]): Promise<Result<{ story: Story; beats: StoryBeat[] }>>

getVersions(storyId: string): Promise<Result<StoryVersion[]>>

deleteVersion(storyId: string, versionId: string): Promise<Result<void>>

cleanupVersions(storyId: string, keepCount?: number): Promise<Result<void>>

getVersionStats(storyId: string): Promise<Result<{
  total: number; autoSaved: number; manualSaved: number;
  oldestVersion: number | null; newestVersion: number | null;
}>>

compareVersions(v1: StoryVersion, v2: StoryVersion): {
  beatsAdded: number; beatsRemoved: number; beatsModified: number;
  durationChanged: number; charactersChanged: boolean; scenesChanged: boolean;
}

formatVersionTime(timestamp: number): string

getRecommendedTemplates(genre: string, tone: string): StoryTemplate[]

applyTemplate(template: StoryTemplate, characters?: string[], scenes?: string[]): StoryBeat[]
```

#### Components

- `TemplateManagerDialog` — 模板管理对话框
- `VersionDialog` — 版本对话框
- `AssetPicker` — 资产选择器

#### Types

```typescript
interface StoryboardTemplate { id: string; name: string; description: string; category: string; genre: string; tone: string; tags: string[]; author: string; beats: StoryboardTemplateBeat[]; totalDuration: number; version: number; createdAt: number; updatedAt: number }
interface StoryboardTemplateBeat { type: string; title: string; content: string; duration: number; shotType?: string; cameraAngle?: string; cameraMovement?: string; cameraDistance?: string; cameraSpeed?: string; generationPrompt?: string; imageGenerationPrompt?: string; firstFramePrompt?: string; lastFramePrompt?: string }
type StoryVersion (from @/domain/schemas)
interface StoryTemplate { id: string; name: string; description: string; genre: string[]; tone: string[]; beats: TemplateBeat[] }
```

### 提示词编辑子域 (prompt-editor)

#### Services

```typescript
generatePromptWithAI(request: PromptEditorRequest, options?: {
  providerId?: string; modelId?: string;
}): Promise<Result<PromptEditorResult>>

buildDefaultPrompt(request: PromptEditorRequest): string
```

#### Hooks

```typescript
usePromptEditor(options: UsePromptEditorOptions): PromptEditorState & {
  setPrompt: (value: string) => void;
  resetToDefault: () => void;
  generateWithAI: (userMessage?: string) => Promise<string | null>;
  confirmAIPrompt: () => void;
  confirmAndGenerate: () => void;
  discardAIPrompt: () => void;
  clearError: () => void;
}
```

#### Components

- `PromptEditor` — 提示词编辑器
- `PromptFloatingBall` — 提示词浮动球

#### Types

```typescript
type PromptEditorContext = "keyframe" | "firstFrame" | "lastFrame"
interface PromptEditorRequest { context: PromptEditorContext; beat: StoryBeat; keyframeImageUrl?: string; userMessage?: string; characters?: Character[]; scenes?: Scene[] }
interface PromptEditorResult { prompt: string; context: PromptEditorContext }
interface UsePromptEditorOptions { beat: StoryBeat; context: PromptEditorContext; keyframeImageUrl?: string; onPromptChange?: (context: PromptEditorContext, prompt: string) => void; onConfirmGenerate?: (context: PromptEditorContext, prompt: string) => void; providerId?: string; modelId?: string; characters?: Character[]; scenes?: Scene[] }
interface PromptEditorState { prompt: string; isGenerating: boolean; error: string | null; lastAIResult: PromptEditorResult | null; hasAIPreview: boolean }
```

---

## 依赖

| 依赖 | 用途 |
|------|------|
| `@/domain/types` | Result 类型、NotFoundError、ValidationError、GenerationError |
| `@/domain/schemas` | Story、StoryBeat、Character、Scene、StoryStyleGuide 等类型 |
| `@/domain/ports` | IVideoProvider、IImageProvider、ITextProvider 接口 |
| `@/domain/services` | StoryGenerationService.resolveGenerationContext、buildVideoPrompt |
| `@/domain/utils` | generateBeatImagePrompt、generateSimpleBeatImagePrompt |
| `@/domain/services/reference-resolver` | resolveCharacterRef、resolveSceneRef |
| `@/infrastructure/di` | DI 容器（storyStorage、videoTaskStorage、versionStorage、elementStorage、eventBus、imageProvider、videoProvider、textProvider、fileUploader） |
| `@/shared/db-core` | safeTransaction |
| `@/shared/api-config` | loadConfig |
| `@/shared/error-logger` | errorLogger、extractErrorMessage |
| `@/shared/error-handler` | handleError、getErrorMessage |
| `@/shared/hooks/use-dirty-state` | useDirtyState |
| `@/shared/utils/confirm` | confirm 对话框 |
| `@/shared/video-utils` | detectVideoCodec、extractVideoFrames |
| `@/shared/video-utils/codec-check` | isCodecSupportedByProvider |
| `@/shared/model-capabilities` | resolveImageSize |
| `@/shared/presentation/Toast` | useToastHelpers |
| `@/modules/prompt` | generateSingleBeatPrompt、useModelSelection |
| `@/modules/shot/shot-generation` | generateStoryPlanWithValidation、formatValidationResult |
| `@/modules/shot/consistency-check` | checkVisualConsistency |

---

## 边界约束

1. **子域隔离**：子域之间只能通过各自的 `index.ts` 导出的 API 通信，禁止直接引用其他子域的内部文件
2. **禁止导入路径**：`@/types/*`、`@/lib/*`、`@/modules/*/*/*`（ESLint 错误级拦截）
3. **类型来源**：所有类型必须从 `@/domain/types` 或 `@/domain/schemas` 导入
4. **基础设施访问**：通过 DI 容器（`container.xxx`）或 `@/shared/` 代理导出访问，禁止直接导入 `@/infrastructure/*`（除 `@/infrastructure/di`）
5. **Dirty 状态抑制**：`useStoryState` 使用 `suppressDirtyCountRef`（计数器）而非布尔值，确保保存后多次 beats 变更都能被正确抑制，避免 dirty 状态残留导致页面无法跳转

---

## 不变量 (Invariants)

### INV-1: 生成前置依赖链
关键帧 → 首尾帧 → 视频的生成顺序不可跳过。`generateBeatFramePair` 要求 `beat.keyframe.imageUrl` 存在；`generateBeatVideo` 要求 `beat.framePair.firstFrameUrl` 存在。违反此链将抛出 `ValidationError`。

### INV-2: 保存前持久化先于状态更新
`useStorySaver.handleSave` 必须先完成 `storyService.create/update`，再更新 React 状态（`setStories`、`setCurrentStory`）。保存失败时不得更新状态，必须回滚 dirty 标记。

### INV-3: 删除必须级联清理
`useStorySaver.performDeleteStory` 必须先删除关联的 `videoTaskStorage.deleteVideoTasksByStoryId`，再执行 `storyService.delete`。`storyService.delete` 内部在删除前会尝试 `saveVersion` 作为备份。

### INV-4: 异步保存并发守卫
`useStorySaver.handleSave` 使用 `savingRef`（useRef）作为并发守卫，防止 Ctrl+S 和按钮点击同时触发。React state（`saveStatus`）不可用于此目的（闭包捕获陈旧值）。

### INV-5: 保存后实体上下文验证
`useStorySaver.handleSave` 在保存开始时快照 `storyIdAtSaveStart`，保存完成后通过 `currentStoryIdRef.current` 验证当前故事 ID 是否仍匹配。若用户在保存期间切换故事，丢弃状态更新。

### INV-6: 批量生成取消机制
`useBatchGenerator` 使用 `cancelledRef`（useRef），在组件卸载时设置为 true。批量循环的每次迭代前和每次异步操作后都检查 `cancelledRef.current`，若为 true 则立即 break。

### INV-7: 生成去重而非中止
`useAIGeneratorBase.withGenerationState` 对同一 beatId 的正在进行的生成操作返回已有 Promise（去重），而非 abort 后重新发起。AbortController 仅用于组件卸载清理。

### INV-8: AI 规划覆盖警告
`useStoryPlanner.planStoryWithAI` 在覆盖现有 beats 前必须确认，且当存在进行中的视频任务时，确认对话框必须包含警告信息（R12）。

### INV-9: 上传乐观更新回滚
`useUploadHandlers` 的所有上传操作采用乐观更新模式：先设置 blob URL，上传成功后替换为持久 URL；上传失败则回滚到之前的 URL 并释放 blob URL。成功提示仅在持久 URL 获取后显示。

### INV-10: 版本恢复前自动备份
`restoreVersion` 在恢复版本前，必须先调用 `saveVersion` 保存当前状态作为备份，确保恢复操作可逆。

### INV-11: 视频生成模式降级
当 `determineVideoGenerationMode` 返回 `reference_video_continuation` 但 `prevVideoUrl` 不存在时，必须降级为 `first_frame_anchor` 模式，避免引用空 URL 导致生成失败。

---

## AI 维护指南

本模块的详细 AI 重构规范请参见：[.ai/modules/story.md](../../../.ai/modules/story.md)

### 快速参考

- 禁止导入路径：`@/types/*`, `@/lib/*`, `@/modules/*/*/*`
- 类型必须从：`@/domain/types` 或 `@/domain/schemas` 导入
- 使用 Result 模式处理异步操作
- 错误类型从 `@/domain/types` 导入：`NotFoundError`, `ValidationError`, `BusinessRuleError`
