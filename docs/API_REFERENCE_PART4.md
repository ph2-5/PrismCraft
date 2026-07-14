# API 参考手册 — 第四部分：应用层与 Electron 主进程

---

## 1. 应用层 (src/app)

### 1.1 根组件

#### `RootLayout` (layout.tsx)

根布局组件，无 Props。组合了所有全局 Provider 和初始化组件。

```typescript
export function RootLayout(): JSX.Element
```

**渲染层级**：
- `ClientProviders` → `QueryProvider` → `ThemeProvider`
  - `MigrationInitializer`
  - `VideoTaskManagerInitializer`
  - `BeforeUnloadGuard`
  - `ToastProvider`
    - `NetworkStatusAlert`
    - `SidebarWithSearch`
    - `<main>` → `ConfigCheckBanner` → `<Outlet />`
  - `OnboardingGuide`
  - `PerformanceMonitorPanel`

---

#### `Home` (page.tsx)

首页组件，展示快速操作、项目列表和 API 状态。

```typescript
interface ApiStatus {
  text?: { provider: string; configured: boolean };
  image?: { provider: string; configured: boolean };
  video?: { provider: string; configured: boolean };
}

export default function Home(): JSX.Element
```

**内部组件**：
- `HomeSkeleton` — 加载骨架屏，无 Props

---

#### `ClientProviders` (ClientProviders.tsx)

全局错误边界和崩溃恢复对话框。

```typescript
interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps): JSX.Element
```

---

#### `MigrationInitializer` (MigrationInitializer.tsx)

同步引擎初始化组件，无 Props，渲染 `null`。

```typescript
export function MigrationInitializer(): null
```

**副作用**：
- 初始化 `initSyncEngine()`
- 监听 `online` 事件处理离线队列
- 每小时清理已完成请求

---

#### `SidebarWithSearch` (SidebarWithSearch.tsx)

侧边栏与搜索功能，无 Props。

```typescript
export function SidebarWithSearch(): JSX.Element
```

**回调签名**：
```typescript
handleSearch: (term: string) => Promise<SearchResult[]>
handleSearchSelect: (result: SearchResult) => void
```

---

#### `QuickActions` (QuickActions.tsx)

首页快速操作区域。

```typescript
interface QuickActionsProps {
  characters: Character[];
  scenes: Scene[];
  stories: Story[];
  dataLoading: boolean;
  apiStatus: ApiStatus;
  onExportAllData: () => void;
  isExportPending: boolean;
}

export function QuickActions(props: QuickActionsProps): JSX.Element
```

**内部组件**：
- `StatCard` — 统计卡片
  ```typescript
  interface StatCardProps {
    count: number;
    label: string;
    color: string;
    characters?: Character[];
    scenes?: Scene[];
    stories?: Story[];
  }
  ```
- `ApiStatusBadge` — API 状态徽章
  ```typescript
  interface ApiStatusBadgeProps { color: string; label: string; }
  ```
- `WorkflowStep` — 工作流步骤
  ```typescript
  interface WorkflowStepProps {
    step: string; title: string; desc: string; icon: ReactNode; index: number;
  }
  ```

---

#### `ProjectList` (ProjectList.tsx)

项目列表功能卡片，无 Props。

```typescript
export function ProjectList(): JSX.Element
```

**内部组件**：
- `FeatureCard`
  ```typescript
  interface FeatureCardProps {
    icon: ReactNode; title: string; description: string; href: string;
    color: string; bgColor: string;
  }
  ```

---

#### `NotFound` (not-found.tsx)

404 页面，无 Props。

```typescript
export default function NotFound(): JSX.Element
```

---

### 1.2 故事页面 (modules/storyboard/)

#### `StoryPage` (page.tsx)

故事编辑主页面。

```typescript
export default function StoryPage(): JSX.Element
```

**内部 Hook**：
- `useAutoSaveSettings()` — 自动保存设置
  ```typescript
  interface AutoSaveSettingsData {
    enabled?: boolean;
    interval?: number;
  }
  function useAutoSaveSettings(): { enabled: boolean; intervalMinutes: number }
  ```

---

#### `StoryProvider` / `useStory` (StoryProvider.tsx)

故事上下文 Provider 和 Hook。

```typescript
export function StoryProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useStory(): StoryContextValue
export type { StoryContextValue } from "./story-context-types";
```

---

#### `StoryContextValue` (story-context-types.ts)

故事上下文完整类型定义。

```typescript
export interface StoryContextValue {
  // 故事状态
  stories: ReturnType<typeof useStoryState>["stories"];
  currentStory: ReturnType<typeof useStoryState>["currentStory"];
  beats: ReturnType<typeof useStoryState>["beats"];
  beatsRef: ReturnType<typeof useStoryState>["beatsRef"];
  hasUnsavedChanges: ReturnType<typeof useStoryState>["hasUnsavedChanges"];
  generationEnhanced: ReturnType<typeof useStoryState>["generationEnhanced"];
  selectedVideoModel: ReturnType<typeof useStoryState>["selectedVideoModel"];
  selectedImageModel: ReturnType<typeof useStoryState>["selectedImageModel"];
  setStories: ReturnType<typeof useStoryState>["setStories"];
  setCurrentStory: ReturnType<typeof useStoryState>["setCurrentStory"];
  setBeats: ReturnType<typeof useStoryState>["setBeats"];
  markClean: ReturnType<typeof useStoryState>["markClean"];
  markDirty: ReturnType<typeof useStoryState>["markDirty"];
  setGenerationEnhanced: ReturnType<typeof useStoryState>["setGenerationEnhanced"];
  setSelectedVideoModel: ReturnType<typeof useStoryState>["setSelectedVideoModel"];
  setSelectedImageModel: ReturnType<typeof useStoryState>["setSelectedImageModel"];
  updateBeat: ReturnType<typeof useStoryState>["updateBeat"];
  addBeat: ReturnType<typeof useStoryState>["addBeat"];
  deleteBeat: ReturnType<typeof useStoryState>["deleteBeat"];
  moveBeat: ReturnType<typeof useStoryState>["moveBeat"];

  // 资产加载
  characters: ReturnType<typeof useAssetLoader>["characters"];
  scenes: ReturnType<typeof useAssetLoader>["scenes"];
  assets: ReturnType<typeof useAssetLoader>["assets"];
  assetsLoading: ReturnType<typeof useAssetLoader>["isLoading"];
  charactersRef: ReturnType<typeof useAssetLoader>["charactersRef"];
  scenesRef: ReturnType<typeof useAssetLoader>["scenesRef"];

  // 上传处理
  handleUploadKeyframe: ReturnType<typeof useUploadHandlers>["handleUploadKeyframe"];
  handleUploadFirstFrame: ReturnType<typeof useUploadHandlers>["handleUploadFirstFrame"];
  handleUploadLastFrame: ReturnType<typeof useUploadHandlers>["handleUploadLastFrame"];
  handleUploadVideo: ReturnType<typeof useUploadHandlers>["handleUploadVideo"];

  // AI 规划
  planStoryWithAI: ReturnType<typeof useStoryPlanner>["planStoryWithAI"];
  isPlanningStory: ReturnType<typeof useStoryPlanner>["isPlanningStory"];

  // 关键帧生成
  generateKeyframe: ReturnType<typeof useKeyframeGenerator>["generateKeyframe"];
  regenerateKeyframe: ReturnType<typeof useKeyframeGenerator>["regenerateKeyframe"];
  generatingKeyframe: ReturnType<typeof useKeyframeGenerator>["generatingKeyframe"];

  // 帧对生成
  generateFramePair: ReturnType<typeof useFramePairGenerator>["generateFramePair"];
  generatingFramePair: ReturnType<typeof useFramePairGenerator>["generatingFramePair"];

  // 视频生成
  generateVideoNew: ReturnType<typeof useVideoGenerator>["generateVideoNew"];
  generatingVideo: ReturnType<typeof useVideoGenerator>["generatingVideo"];

  // 正在生成的 beat 集合
  generatingBeats: Set<string>;

  // 批量生成
  batchGenerateKeyframes: ReturnType<typeof useBatchGenerator>["batchGenerateKeyframes"];
  batchGenerateFramePairs: ReturnType<typeof useBatchGenerator>["batchGenerateFramePairs"];
  batchGenerateVideos: ReturnType<typeof useBatchGenerator>["batchGenerateVideos"];

  // 保存与删除
  handleSave: ReturnType<typeof useStorySaver>["handleSave"];
  handleDeleteStory: ReturnType<typeof useStorySaver>["handleDeleteStory"];
  performDeleteStory: ReturnType<typeof useStorySaver>["performDeleteStory"];
  switchToStory: (storyId: string) => Promise<void>;
  handleRestoreVersion: ReturnType<typeof useStorySaver>["handleRestoreVersion"];

  // 模板
  savedTemplates: ReturnType<typeof useStorySaver>["savedTemplates"];
  handleSaveTemplate: ReturnType<typeof useStorySaver>["handleSaveTemplate"];
  handleDeleteTemplate: ReturnType<typeof useStorySaver>["handleDeleteTemplate"];
  applyStoryboardTemplate: ReturnType<typeof useStorySaver>["applyStoryboardTemplate"];
  updateRecommendedTemplates: ReturnType<typeof useStorySaver>["updateRecommendedTemplates"];
  templateDialogOpen: ReturnType<typeof useStorySaver>["templateDialogOpen"];
  setTemplateDialogOpen: ReturnType<typeof useStorySaver>["setTemplateDialogOpen"];
  versionDialogOpen: ReturnType<typeof useStorySaver>["versionDialogOpen"];
  setVersionDialogOpen: ReturnType<typeof useStorySaver>["setVersionDialogOpen"];
  deleteDialogOpen: ReturnType<typeof useStorySaver>["deleteDialogOpen"];
  setDeleteDialogOpen: ReturnType<typeof useStorySaver>["setDeleteDialogOpen"];

  // 视频任务
  tasks: ReturnType<typeof useVideoTaskManager>["tasks"];
  addTask: ReturnType<typeof useVideoTaskManager>["addTask"];
  createTask: ReturnType<typeof useVideoTaskManager>["createTask"];
  pollTask: ReturnType<typeof useVideoTaskManager>["pollTask"];
  removeTask: ReturnType<typeof useVideoTaskManager>["removeTask"];
  removeTasks: ReturnType<typeof useVideoTaskManager>["removeTasks"];

  // Toast
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;

  // 保存状态
  saveStatus: SaveStatus;
  saveError: string;

  // 视频URL持久化状态
  isVideoUrlPersisting: boolean;
}
```

---

#### `StoryHeader` (StoryHeader.tsx)

故事头部导航和编辑控件。

```typescript
type StoryValue = ReturnType<typeof useStory>;

interface StoryHeaderProps {
  story: StoryValue;
  onSwitchStory: (s: StoryValue["stories"][number]) => void;
}

export function StoryHeader({ story, onSwitchStory }: StoryHeaderProps): JSX.Element
```

---

#### `SwitchConfirmDialog` (SwitchConfirmDialog.tsx)

切换故事确认对话框。

```typescript
interface SwitchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingSwitchStory: StoryValue["stories"][number] | null;
  onSaveAndSwitch: () => void;
  onSwitchWithoutSave: () => void;
}

export function SwitchConfirmDialog(props: SwitchConfirmDialogProps): JSX.Element
```

---

#### `VideoGeneratorToolbar` / `VideoGeneratorPanel` (VideoGeneratorSection.tsx)

视频生成工具栏和面板。

```typescript
interface VideoGeneratorToolbarProps {
  story: StoryValue;
  isGenerating: boolean;
  onGenerateVideo: () => void;
}

interface VideoGeneratorPanelProps {
  story: StoryValue;
  generatedVideo: string | null;
}

export function VideoGeneratorToolbar(props: VideoGeneratorToolbarProps): JSX.Element
export function VideoGeneratorPanel(props: VideoGeneratorPanelProps): JSX.Element
```

---

#### `useStoryActions` (useStoryActions.ts)

故事操作 Hook。

```typescript
interface UseStoryActionsParams {
  storyState: ReturnType<typeof useStoryState>;
  showError: (title: string, description?: string) => void;
}

export function useStoryActions(params: UseStoryActionsParams): {
  deleteBeatWithCleanup: (beatId: string) => Promise<void>;
  switchToStory: (storyId: string) => Promise<void>;
}
```

---

#### `useStoryPersistence` (useStoryPersistence.ts)

故事持久化 Hook，自动将视频 URL 写回 beat 和 story。

```typescript
interface UseStoryPersistenceParams {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  setBeats: (update: StoryBeat[] | ((prev: StoryBeat[]) => StoryBeat[]), skipDirty?: boolean) => void;
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story & { beats: StoryBeat[] };
  currentStoryId: string | undefined;
  completedTaskUrls: Map<string, string>;
  allCompletedTaskUrls: Map<string, string>;
  showErrorRef: React.MutableRefObject<(title: string, description?: string) => void>;
}

export function useStoryPersistence(params: UseStoryPersistenceParams): {
  isVideoUrlPersisting: boolean;
}
```

---

#### `useStoryVideo` (useStoryVideo.ts)

故事视频状态 Hook，使用浅比较避免不必要的重渲染。

```typescript
interface UseStoryVideoParams {
  tasks: VideoTask[];
  currentStoryId: string | undefined;
  generatingKeyframe: string | null | undefined;
  generatingFramePair: string | null | undefined;
  generatingVideo: string | null | undefined;
}

export function useStoryVideo(params: UseStoryVideoParams): {
  allCompletedTaskUrls: Map<string, string>;
  completedTaskUrls: Map<string, string>;
  generatingBeats: Set<string>;
}
```

**内部函数**：
```typescript
function useStableCompletedUrls(
  tasks: VideoTask[],
  filterStoryId?: string,
): Map<string, string>
// 仅在内容实际变化时返回新 Map 引用
```

---

### 1.3 分镜详情页 (modules/storyboard/beat/$beatId/)

#### `BeatDetailPage` (page.tsx)

```typescript
export default function BeatDetailPage(): JSX.Element
```

---

#### `BeatDetailClient` (BeatDetailClient.tsx)

分镜详情客户端组件。

```typescript
interface BeatDetailPageProps {
  story: Story;
  beat: StoryBeat;
  task?: VideoTask;
}

export default function BeatDetailClient(): JSX.Element
```

---

#### `BeatVideoPreview` (BeatVideoPreview.tsx)

分镜视频预览。

```typescript
interface BeatVideoPreviewProps {
  beat: StoryBeat;
  task?: VideoTask;
  videoUrl?: string;
  guardedPush: (path: string) => void;
}

export function BeatVideoPreview(props: BeatVideoPreviewProps): JSX.Element
```

---

#### `BeatVideoTab` (BeatVideoTab.tsx)

视频标签页。

```typescript
interface BeatVideoTabProps {
  beat: StoryBeat;
  task?: VideoTask;
  videoUrl?: string;
  isRefreshingUrl: boolean;
  handleCopyVideoUrl: () => void;
  handleRefreshVideoUrl: () => void;
  success: (title: string, description?: string) => void;
  getStatusColor: (status?: string) => string;
  getStatusLabel: (status?: string) => string;
  onRegenerate?: () => Promise<void>;
  isRegenerating?: boolean;
}

export function BeatVideoTab(props: BeatVideoTabProps): JSX.Element
```

---

#### `BeatDetailsTab` (BeatDetailsTab.tsx)

详情标签页。

```typescript
interface BeatDetailsTabProps {
  beat: StoryBeat;
  elementNames: Record<string, string>;
}

export function BeatDetailsTab({ beat, elementNames }: BeatDetailsTabProps): JSX.Element
```

---

#### `BeatTechTab` (BeatTechTab.tsx)

技术参数标签页。

```typescript
interface BeatTechTabProps {
  beat: StoryBeat;
  task?: VideoTask;
  selectedVideoModel: ModelSelection | null;
  setSelectedVideoModel: (value: ModelSelection | null) => void;
  modelParams: ModelParameterValues;
  handleModelParamsChange: (partial: Partial<ModelParameterValues>) => void;
  handleCopyPrompt: () => void;
}

export function BeatTechTab(props: BeatTechTabProps): JSX.Element
```

---

#### `useBeatDetail` (use-beat-detail.ts)

分镜详情数据加载 Hook。

```typescript
interface UseBeatDetailResult {
  story: Story | null;
  beat: StoryBeat | null;
  setBeat: Dispatch<SetStateAction<StoryBeat | null>>;
  task: VideoTask | undefined;
  loading: boolean;
}

export function useBeatDetail(): UseBeatDetailResult
```

---

#### `useBeatDetailActions` (use-beat-detail-actions.ts)

分镜详情操作 Hook。

```typescript
interface UseBeatDetailActionsParams {
  story: Story;
  beat: StoryBeat;
  task?: VideoTask;
  setBeat: (beat: StoryBeat | null) => void;
}

export function useBeatDetailActions(params: UseBeatDetailActionsParams): {
  guardedPush: (path: string) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  videoUrl: string | undefined;
  setVideoUrl: (url: string | undefined) => void;
  isRefreshingUrl: boolean;
  elementNames: Record<string, string>;
  selectedVideoModel: ModelSelection | null;
  setSelectedVideoModel: (value: ModelSelection | null) => void;
  modelParams: ModelParameterValues;
  handleModelParamsChange: (partial: Partial<ModelParameterValues>) => void;
  handleCopyPrompt: () => void;
  handleDownloadVideo: () => Promise<void>;
  handleCopyVideoUrl: () => void;
  handleRefreshVideoUrl: () => Promise<void>;
  getStatusColor: (status?: string) => string;
  getStatusLabel: (status?: string) => string;
  handleRegenerate: () => Promise<void>;
  isRegenerating: boolean;
}
```

---

### 1.4 角色页面 (app/characters/)

#### `CharactersPage` (page.tsx)

```typescript
export default function CharactersPage(): JSX.Element
```

---

#### `CharacterList` (CharacterList.tsx)

角色列表组件。

```typescript
interface CharacterListProps {
  characters: Character[];
  charactersLoading: boolean;
  onSelectCharacter: (char: Character) => void;
  onDeleteCharacter: (e: React.MouseEvent) => void;
  onCreateNew: () => void;
}

export const CharacterList: React.MemoExoticComponent<(
  props: CharacterListProps
) => JSX.Element>
```

---

#### `CharacterEditor` (CharacterEditor.tsx)

角色编辑器。

```typescript
interface CharacterEditorProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
  isGenerating: boolean;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
}

export function CharacterEditor(props: CharacterEditorProps): JSX.Element
```

---

#### `CharacterBasicInfo` (CharacterBasicInfo.tsx)

角色基本信息标签页。

```typescript
interface CharacterBasicInfoProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  customTrait: string;
  setCustomTrait: (v: string) => void;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
}

export function CharacterBasicInfo(props: CharacterBasicInfoProps): JSX.Element
```

---

#### `CharacterAppearanceSection` (CharacterAppearanceSection.tsx)

角色外观标签页。

```typescript
interface CharacterAppearanceSectionProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  isGenerating: boolean;
  onAddOutfit: () => void;
  onEditOutfit: (outfit: CharacterOutfit) => void;
  onDeleteOutfit: (id: string) => void;
  onSetDefaultOutfit: (id: string) => void;
  onGenerateOutfitImage: (outfit: CharacterOutfit) => void;
}

export function CharacterAppearanceSection(props: CharacterAppearanceSectionProps): JSX.Element
```

---

#### `CharacterImageSection` (CharacterImageSection.tsx)

角色图像生成和上传区域。

```typescript
interface CharacterImageSectionProps {
  currentCharacter: Character;
  generatedImage: string | null;
  setGeneratedImage: (v: string | null) => void;
  isGenerating: boolean;
  isUploading: boolean;
  isAnalyzing: boolean;
  useDetailedPrompt: boolean;
  setUseDetailedPrompt: (v: boolean) => void;
  imageSize: string;
  setImageSize: (v: string) => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (v: ModelSelection | null) => void;
  generatePrompt: (char: Character) => string;
  generateImage: () => void;
  saveImageToCharacter: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setShowAssetSelector: (v: boolean) => void;
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError: string | null | undefined;
  handleSave: () => void;
}

export function CharacterImageSection(props: CharacterImageSectionProps): JSX.Element
```

---

### 1.5 场景页面 (app/scenes/)

#### `ScenesPage` (page.tsx)

```typescript
export default function ScenesPage(): JSX.Element
```

---

### 1.6 视频任务页面 (app/video-tasks/)

#### `VideoTasksPage` (page.tsx)

```typescript
export default function VideoTasksPage(): JSX.Element
```

---

### 1.7 快速生成页面 (app/quick-generate/)

#### `QuickGeneratePage` (page.tsx)

```typescript
export default function QuickGeneratePage(): JSX.Element
```

---

#### `QuickGenerateState` (QuickGenerateState.ts)

快速生成状态管理 Hook。

```typescript
export function useQuickGenerateState(): {
  promptText: string;
  setPromptText: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  selectedStyle: string;
  setSelectedStyle: (value: string) => void;
  selectedResolution: string;
  setSelectedResolution: (value: string) => void;
  selectedCharacters: string[];
  toggleCharacter: (charId: string) => void;
  selectedScene: string | null;
  toggleScene: (sceneId: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (value: boolean) => void;
  enableSmartOptimization: boolean;
  setEnableSmartOptimization: (value: boolean) => void;
  negativePrompt: string;
  setNegativePrompt: (value: string) => void;
  seed: string;
  setSeed: (value: string) => void;
  cfgScale: number;
  setCfgScale: (value: number) => void;
  referenceImage: string | null;
  setReferenceImage: (value: string | null) => void;
  referenceVideo: string | null;
  referenceVideoName: string | null;
  handleUploadReferenceVideo: (file: File) => void;
  handleRemoveReferenceVideo: () => void;
  isGenerating: boolean;
  handleGenerate: (promptOverride?: string) => Promise<void>;
  generatedPrompt: string | null;
  templateDialogOpen: boolean;
  setTemplateDialogOpen: (value: boolean) => void;
  handleApplyTemplate: (template: VideoTemplate) => void;
  characters: Character[];
  charactersLoading: boolean;
  scenes: Scene[];
  scenesLoading: boolean;
  guardedPush: (path: string) => void;
  selectedVideoModel: ModelSelection | null;
  setSelectedVideoModel: (value: ModelSelection | null) => void;
  currentTask: VideoTask | null;
  effectiveVideoUrl: string | null;
  tasks: VideoTask[];
  activeTaskId: string | null;
  handleDownload: (videoUrl: string | undefined, filename: string) => Promise<void>;
  handleSaveToAssets: (task: VideoTask) => Promise<void>;
  handleRetry: (task: VideoTask) => void;
  clearCompletedTasks: () => void;
  getSelectedCharacterObjects: () => Character[];
  quickExamples: string[];
}
```

---

#### `QuickGenerateState` / `QuickGenerateAction` (quick-generate-reducer.ts)

Reducer 状态和 Action 类型。

```typescript
export interface QuickGenerateState {
  promptText: string;
  duration: number;
  selectedStyle: string;
  selectedResolution: string;
  selectedCharacters: string[];
  selectedScene: string | null;
  showAdvanced: boolean;
  enableSmartOptimization: boolean;
  negativePrompt: string;
  seed: string;
  cfgScale: number;
  referenceImage: string | null;
  referenceVideo: string | null;
  referenceVideoFile: File | null;
  referenceVideoName: string | null;
  generatedPrompt: string | null;
  templateDialogOpen: boolean;
  cachedVideoUrl: string | null;
  cachedVideoUrlTaskId: string | null;
  isSavingToAssets: boolean;
}

export type QuickGenerateAction =
  | { type: "SET_PROMPT_TEXT"; value: string }
  | { type: "SET_DURATION"; value: number }
  | { type: "SET_SELECTED_STYLE"; value: string }
  | { type: "SET_SELECTED_RESOLUTION"; value: string }
  | { type: "TOGGLE_CHARACTER"; charId: string }
  | { type: "TOGGLE_SCENE"; sceneId: string }
  | { type: "SET_SHOW_ADVANCED"; value: boolean }
  | { type: "SET_ENABLE_SMART_OPTIMIZATION"; value: boolean }
  | { type: "SET_NEGATIVE_PROMPT"; value: string }
  | { type: "SET_SEED"; value: string }
  | { type: "SET_CFG_SCALE"; value: number }
  | { type: "SET_REFERENCE_IMAGE"; value: string | null }
  | { type: "UPLOAD_REFERENCE_VIDEO"; blobUrl: string; file: File; name: string }
  | { type: "REMOVE_REFERENCE_VIDEO" }
  | { type: "SET_GENERATED_PROMPT"; value: string | null }
  | { type: "SET_TEMPLATE_DIALOG_OPEN"; value: boolean }
  | { type: "SET_CACHED_VIDEO_URL"; url: string | null; taskId: string | null }
  | { type: "SET_IS_SAVING_TO_ASSETS"; value: boolean }
  | { type: "APPLY_TEMPLATE"; prompt: string; duration: number; style: string };

export const initialState: QuickGenerateState;
export function quickGenerateReducer(
  state: QuickGenerateState,
  action: QuickGenerateAction,
): QuickGenerateState;
```

---

#### `QuickGenerateForm` (QuickGenerateForm.tsx)

```typescript
interface QuickGenerateFormProps {
  promptText: string;
  onPromptTextChange: (value: string) => void;
  duration: number;
  onDurationChange: (value: number) => void;
  selectedStyle: string;
  onSelectedStyleChange: (value: string) => void;
  selectedResolution: string;
  onSelectedResolutionChange: (value: string) => void;
  selectedVideoModel: ModelSelection | null;
  onSelectedVideoModelChange: (value: ModelSelection | null) => void;
  selectedCharacters: string[];
  onToggleCharacter: (charId: string) => void;
  selectedScene: string | null;
  onToggleScene: (sceneId: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  enableSmartOptimization: boolean;
  onSmartOptimizationChange: (val: boolean) => void;
  negativePrompt: string;
  onNegativePromptChange: (val: string) => void;
  seed: string;
  onSeedChange: (val: string) => void;
  cfgScale: number;
  onCfgScaleChange: (val: number) => void;
  referenceImage: string | null;
  onReferenceImageChange: (val: string | null) => void;
  referenceVideo: string | null;
  referenceVideoName: string | null;
  onUploadReferenceVideo: (file: File) => void;
  onRemoveReferenceVideo: () => void;
  isGenerating: boolean;
  onGenerate: () => void;
  generatedPrompt: string | null;
  onOpenTemplateDialog: () => void;
  characters: Character[];
  charactersLoading: boolean;
  scenes: Scene[];
  scenesLoading: boolean;
  guardedPush: (path: string) => void;
  quickExamples: string[];
}

export function QuickGenerateForm(props: QuickGenerateFormProps): JSX.Element
```

---

#### `AdvancedSettingsCard` (AdvancedSettingsCard.tsx)

```typescript
interface AdvancedSettingsCardProps {
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  enableSmartOptimization: boolean;
  onSmartOptimizationChange: (val: boolean) => void;
  negativePrompt: string;
  onNegativePromptChange: (val: string) => void;
  referenceImage: string | null;
  onReferenceImageChange: (val: string | null) => void;
  referenceVideo: string | null;
  referenceVideoName: string | null;
  onUploadReferenceVideo: (file: File) => void;
  onRemoveReferenceVideo: () => void;
}

export function AdvancedSettingsCard(props: AdvancedSettingsCardProps): JSX.Element
```

---

#### `TaskResultPanel` (TaskResultPanel.tsx)

```typescript
interface TaskResultPanelProps {
  currentTask: VideoTask | null;
  effectiveVideoUrl: string | null;
  tasks: VideoTask[];
  activeTaskId: string | null;
  isGenerating: boolean;
  onDownload: (videoUrl: string | undefined, filename: string) => void;
  onSaveToAssets: (task: VideoTask) => void;
  onRetry: (task: VideoTask) => void;
  onClearCompleted: () => void;
  characterPosterImage?: string | null;
}

export function TaskResultPanel(props: TaskResultPanelProps): JSX.Element
```

---

#### `QuickGenerateHistory` (QuickGenerateHistory.tsx)

```typescript
interface QuickGenerateHistoryProps {
  currentTask: VideoTask | null;
  effectiveVideoUrl: string | null;
  tasks: VideoTask[];
  activeTaskId: string | null;
  isGenerating: boolean;
  onDownload: (videoUrl: string | undefined, filename: string) => void;
  onSaveToAssets: (task: VideoTask) => void;
  onRetry: (task: VideoTask) => void;
  onClearCompleted: () => void;
  characterPosterImage?: string | null;
}

export function QuickGenerateHistory(props: QuickGenerateHistoryProps): JSX.Element
```

---

#### `TemplateSelectDialog` (TemplateSelectDialog.tsx)

```typescript
interface TemplateSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyTemplate: (template: VideoTemplate) => void;
}

export function TemplateSelectDialog(props: TemplateSelectDialogProps): JSX.Element
```

---

### 1.8 资产库页面 (app/asset-library/)

#### `AssetLibraryPage` (page.tsx)

```typescript
export default function AssetLibraryPage(): JSX.Element
```

---

#### `asset-library-shared.ts`

```typescript
export type AssetTab = "characters" | "scenes" | "storyboards" | "collections";

export type EditingItem =
  | (Character & { _type: "character" })
  | (Scene & { _type: "scene" })
  | (StoryboardAsset & { _type: "storyboard" });

export function toDateFromTimestamp(ts: unknown): Date
export async function fetchSecondaryData(): Promise<{
  storyboards: StoryboardAsset[];
  collections: Collection[];
  collectionAssets: CollectionAsset[];
}>
```

---

#### `useAssetLibraryActions` (useAssetLibraryActions.ts)

```typescript
interface UseAssetLibraryActionsParams {
  activeTab: AssetTab;
  selectedIds: Set<string>;
  clearSelection: () => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSecondaryData: (data: { storyboards: StoryboardAsset[]; collections: Collection[]; collectionAssets: CollectionAsset[] }) => void;
  setIsBatchDeleting: (v: boolean) => void;
  setIsAddingToCollection: (v: boolean) => void;
  setIsCollectionDialogOpen: (v: boolean) => void;
  setIsImportDialogOpen: (v: boolean) => void;
  setIsNewCollectionDialogOpen: (v: boolean) => void;
  setIsEditDialogOpen: (v: boolean) => void;
  setEditingItem: (item: EditingItem | null) => void;
  setIsSavingEdit: (v: boolean) => void;
  setNewCollectionName: (v: string) => void;
  setAddToCollectionId: (v: string) => void;
  addToCollectionId: string;
  newCollectionName: string;
  editingItem: EditingItem | null;
  isBatchDeleting: boolean;
}

export function useAssetLibraryActions(params: UseAssetLibraryActionsParams): {
  loadSecondaryData: () => Promise<void>;
  handleBatchDelete: () => Promise<void>;
  handleBatchExport: () => Promise<void>;
  handleAddToCollection: () => Promise<void>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleCreateCollection: () => Promise<void>;
  handleDeleteCollection: (id: string) => Promise<void>;
  handleExportCollection: (id: string) => Promise<void>;
  handleDeleteCharacter: (id: string) => Promise<void>;
  handleDeleteScene: (id: string) => Promise<void>;
  handleDeleteStoryboard: (id: string) => Promise<void>;
  handleEditItem: (item: EditingItem) => void;
  handleSaveEdit: () => Promise<void>;
}
```

---

### 1.9 设置页面 (app/settings/)

#### `SettingsPage` (page.tsx)

```typescript
export default function SettingsPage(): JSX.Element
```

**内部组件**：
- `AutoSaveSettings`
  ```typescript
  interface AutoSaveSettingsData {
    enabled?: boolean;
    interval?: number;
  }
  function AutoSaveSettings(): JSX.Element
  ```

---

#### `plugin-api.ts`

插件 API 客户端。

```typescript
export interface PluginInfo {
  id: string;
  displayName: string;
  isUserPlugin: boolean;
  isCodePlugin: boolean;
  capabilities: { video: boolean; image: boolean; text: boolean; vision: boolean };
  videoCapabilities: {
    supportsLastFrame: boolean;
    supportsReferenceVideo: boolean;
    supportsMimicryLevel: boolean;
    defaultModel: string;
    maxDuration: number;
    supportsCharacterRef?: boolean;
    supportsSceneRef?: boolean;
    characterRefMode?: string;
    sceneRefMode?: string;
    characterRefField?: string;
    sceneRefField?: string;
    imageUploadMode?: string;
    maxCharacterRefs?: number;
  };
  imageCapabilities: {
    supportsReferenceImage: boolean;
    defaultModel: string;
  };
}

export interface UserPluginFile {
  id: string;
  fileName: string;
  filePath: string;
  displayName: string;
  version: string;
  valid: boolean;
  errors: string[];
}

export interface PluginListData {
  plugins: PluginInfo[];
  userPluginFiles: UserPluginFile[];
}

export function getApiBase(): string
export async function fetchPlugins(): Promise<PluginListData>
export async function addPlugin(config: Record<string, unknown>): Promise<void>
export async function deletePlugin(pluginId: string): Promise<void>
export async function reloadPlugins(): Promise<{ loaded: number; errors: string[] }>
export async function reloadCodePlugins(): Promise<{ loaded: number; errors: string[] }>
export async function validatePluginConfig(config: Record<string, unknown>): Promise<{ valid: boolean; errors: string[] }>
export async function fetchPluginSchema(): Promise<Record<string, unknown>>
export async function fetchPluginSpecification(): Promise<string>
```

---

#### `plugin-creator-types.ts`

插件创建器类型定义。

```typescript
export interface UrlPattern { _uid: string; pattern: string; type: "contains" | "prefix" | "regex" }
export interface DurationOption { _uid: string; value: number; label: string }
export interface ResolutionOption { _uid: string; value: string; label: string; width: number; height: number }
export interface StyleOption { _uid: string; value: string; label: string }
export interface CfgScaleConfig { min: number; max: number; default: number; step: number }

export interface ModelDefinition {
  _uid: string;
  modelId: string;
  displayName: string;
  type: "video" | "image" | "text";
  maxDuration: number;
  maxResolution: number;
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsReferenceImage: boolean;
  durations: DurationOption[];
  resolutions: ResolutionOption[];
  styles: StyleOption[];
  negativePrompt: boolean;
  seed: boolean;
  cfgScale: CfgScaleConfig | null;
}

export interface ExtraField { _uid: string; key: string; value: string }
export interface StatusMapping { _uid: string; apiStatus: string; appStatus: string }

export interface WizardState {
  id: string;
  displayName: string;
  version: string;
  description: string;
  baseUrl: string;
  authType: "bearer" | "api-key-header" | "api-key-query" | "custom";
  authHeader: string;
  authQueryName: string;
  apiUrlPatterns: UrlPattern[];
  matchMode: "contains" | "prefix" | "regex";
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  supportsCharacterRef: boolean;
  supportsSceneRef: boolean;
  characterRefMode: "native_field" | "multimodal" | "ref_field" | "text_append" | "none";
  sceneRefMode: "native_field" | "multimodal" | "ref_field" | "text_append" | "none";
  characterRefField: string;
  sceneRefField: string;
  imageUploadMode: "base64" | "url" | "upload";
  maxCharacterRefs: number;
  supportsReferenceImage: boolean;
  defaultVideoModel: string;
  defaultImageModel: string;
  maxDuration: number;
  imageMode: "base64" | "url" | "upload";
  videoMode: "base64" | "url";
  preferLocalData: boolean;
  models: ModelDefinition[];
  bodyFormat: "openai-content" | "flat" | "dashscope" | "custom";
  promptField: string;
  modelField: string;
  durationField: string;
  firstFrameField: string;
  lastFrameField: string;
  extraFields: ExtraField[];
  videoGenerateEndpoint: string;
  videoStatusEndpoint: string;
  imageGenerateEndpoint: string;
  textGenerateEndpoint: string;
  visionGenerateEndpoint: string;
  taskIdPath: string;
  statusPath: string;
  videoUrlPath: string;
  imageUrlPath: string;
  statusMapping: StatusMapping[];
}

export function createDefaultModel(): ModelDefinition
```

---

#### `plugin-creator-api.ts`

```typescript
export function buildPluginJson(state: WizardState): Record<string, unknown>
export { validatePluginConfig, addPlugin } from "./plugin-api";
```

---

#### `ApiConfigPanel` (ApiConfigPanel.tsx)

API 配置面板组件，管理提供商配置、能力映射和连接测试。

```typescript
export function ApiConfigPanel(): JSX.Element
```

**内部状态**：
- `config: ApiConfig` — 当前 API 配置
- `showAddForm: boolean` — 是否显示添加提供商表单
- `expandedProvider: string | null` — 当前展开的提供商 ID
- `testResults: Record<string, { success: boolean; message: string }>` — 连接测试结果

---

#### `PluginManager` (plugin-manager.tsx)

插件管理组件，展示内置插件、声明式插件和代码插件列表。

```typescript
export default function PluginManager(): JSX.Element
```

**内部状态**：
- `plugins: PluginInfo[]` — 插件列表
- `userPluginFiles: UserPluginFile[]` — 用户插件文件列表
- `showAddForm: boolean` — 是否显示添加表单
- `showCreator: boolean` — 是否显示插件创建向导
- `showSchema: boolean` — 是否显示插件 Schema
- `showSpec: boolean` — 是否显示插件规范文档

---

#### `PluginCreator` (plugin-creator.tsx)

插件创建向导组件，7 步引导用户创建自定义插件配置。

```typescript
export default function PluginCreator({ onComplete }: { onComplete: () => void }): JSX.Element
```

**向导步骤**：
1. 基本信息 (PluginBasicInfo)
2. API 配置 (PluginApiConfig)
3. URL 匹配规则 (PluginUrlRules)
4. 模型定义 (PluginModelDefs)
5. 请求格式 (PluginRequestFormat)
6. 响应格式 (PluginResponseFormat)
7. 预览导出 (PluginPreviewExport)

---

#### `ProviderForm` (ProviderForm.tsx)

添加 API 提供商表单组件，支持自动检测和手动选择模板。

```typescript
interface ProviderFormProps {
  newProviderKey: string;
  onKeyChange: (value: string) => void;
  newProviderName: string;
  onNameChange: (value: string) => void;
  selectedTemplate: string;
  onTemplateChange: (value: string) => void;
  isAdding: boolean;
  keyValidation: { valid: boolean; error?: string };
  detectedInfo: DetectResult | null;
  detectedAll?: { builtinMatches: DetectResult[]; pluginMatches: DetectResult[] } | null;
  hasMultipleSources?: boolean;
  onAdd: () => void;
  onCancel: () => void;
  capabilities: CapabilityItem[];
}

export function ProviderForm(props: ProviderFormProps): JSX.Element
```

---

#### `ProviderCard` (ProviderCard.tsx)

提供商卡片组件，展示单个提供商的配置和模型列表。

```typescript
interface ProviderCardProps {
  provider: ApiConfig["providers"][0];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateProvider: (providerId: string, updates: Partial<ProviderConfig>) => void;
  onRemoveProvider: (providerId: string) => void;
  onAddCustomModel: (providerId: string) => void;
  onUpdateModel: (providerId: string, modelIndex: number, updates: Partial<ModelConfig>) => void;
  onRemoveModel: (providerId: string, modelIndex: number) => void;
  onUpdateProviderModels: (providerId: string) => void;
  capabilities: CapabilityItem[];
}

export function ProviderCard(props: ProviderCardProps): JSX.Element
```

---

#### `ModelMappingSection` (ModelMappingSection.tsx)

能力映射配置组件，将 API 能力映射到具体提供商模型。

```typescript
interface ModelMappingSectionProps {
  config: ApiConfig;
  useFreeImageBackup: boolean;
  useCustomVision: boolean;
  testingCapability: ApiCapability | null;
  onSetMapping: (capability: ApiCapability, value: string | null | undefined) => void;
  onTestCapability: (capability: ApiCapability) => void;
  onSetFreeImageBackup: (value: boolean) => void;
  onSetCustomVision: (value: boolean) => void;
  capabilities: CapabilityItem[];
}

export function ModelMappingSection(props: ModelMappingSectionProps): JSX.Element
```

---

#### `PluginList` (PluginList.tsx)

插件列表组件，分组展示内置、声明式和代码插件。

```typescript
interface PluginListProps {
  builtInPlugins: PluginInfo[];
  declarativePlugins: PluginInfo[];
  codePlugins: PluginInfo[];
  userPluginFiles: UserPluginFile[];
  expandedPlugin: string | null;
  onToggleExpand: (pluginId: string | null) => void;
  onDelete: (pluginId: string, displayName: string) => void;
}

export function PluginList(props: PluginListProps): JSX.Element
```

---

#### `PluginDetail` (PluginDetail.tsx)

插件详情组件，展示单个插件的能力和配置信息。

```typescript
interface PluginDetailProps {
  plugin: {
    id: string;
    capabilities: { video: boolean; image: boolean; text: boolean; vision: boolean };
    videoCapabilities: { supportsLastFrame: boolean; supportsReferenceVideo: boolean; supportsMimicryLevel: boolean; defaultModel: string; maxDuration: number; supportsCharacterRef?: boolean; supportsSceneRef?: boolean; characterRefMode?: string; sceneRefMode?: string; characterRefField?: string; sceneRefField?: string; imageUploadMode?: string; maxCharacterRefs?: number };
    imageCapabilities: { supportsReferenceImage: boolean; defaultModel: string };
  };
}

export function PluginDetail({ plugin }: PluginDetailProps): JSX.Element
```

---

#### `PluginAddForm` (plugin-add-form.tsx)

JSON 导入插件表单组件，支持粘贴或上传 JSON 配置。

```typescript
interface PluginAddFormProps {
  onAdded: () => void;
  onCancel: () => void;
}

export function PluginAddForm({ onAdded, onCancel }: PluginAddFormProps): JSX.Element
```

---

#### `PluginBasicInfo` (PluginBasicInfo.tsx)

插件创建向导 - 基本信息步骤组件。

```typescript
interface PluginBasicInfoProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginBasicInfo({ state, updateField }: PluginBasicInfoProps): JSX.Element
```

---

#### `PluginApiConfig` (PluginApiConfig.tsx)

插件创建向导 - API 配置步骤组件，配置认证方式、视频/图像能力和传输模式。

```typescript
interface PluginApiConfigProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginApiConfig({ state, updateField }: PluginApiConfigProps): JSX.Element
```

---

#### `PluginUrlRules` (PluginUrlRules.tsx)

插件创建向导 - URL 匹配规则步骤组件。

```typescript
interface PluginUrlRulesProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginUrlRules({ state, updateField }: PluginUrlRulesProps): JSX.Element
```

---

#### `PluginModelDefs` (PluginModelDefs.tsx)

插件创建向导 - 模型定义步骤组件，管理模型列表及其参数。

```typescript
interface PluginModelDefsProps {
  state: WizardState;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  addModel: () => void;
  removeModel: (index: number) => void;
  expandedModelParams: Set<number>;
  toggleModelParams: (index: number) => void;
}

export function PluginModelDefs(props: PluginModelDefsProps): JSX.Element
```

---

#### `ModelParams` (ModelParams.tsx)

模型参数配置组件，配置时长、分辨率、风格等参数选项。

```typescript
interface ModelParamsProps {
  model: ModelDefinition;
  index: number;
  isExpanded: boolean;
  updateModel: (index: number, updates: Partial<ModelDefinition>) => void;
  toggleModelParams: (index: number) => void;
}

export function ModelParams(props: ModelParamsProps): JSX.Element
```

---

#### `PluginRequestFormat` (PluginRequestFormat.tsx)

插件创建向导 - 请求格式步骤组件，配置 API 端点和请求体格式。

```typescript
interface PluginRequestFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginRequestFormat({ state, updateField }: PluginRequestFormatProps): JSX.Element
```

---

#### `PluginResponseFormat` (PluginResponseFormat.tsx)

插件创建向导 - 响应格式步骤组件，配置响应路径和状态映射。

```typescript
interface PluginResponseFormatProps {
  state: WizardState;
  updateField: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}

export function PluginResponseFormat({ state, updateField }: PluginResponseFormatProps): JSX.Element
```

---

#### `PluginPreviewExport` (PluginPreviewExport.tsx)

插件创建向导 - 预览导出步骤组件，预览生成的 JSON 并执行验证/安装。

```typescript
interface PluginPreviewExportProps {
  generatedJson: string;
  validationResult: { valid: boolean; errors: string[] } | null;
  isValidating: boolean;
  isInstalling: boolean;
  onValidate: () => void;
  onInstall: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

export function PluginPreviewExport(props: PluginPreviewExportProps): JSX.Element
```

---

#### `PluginSchemaViewer` (plugin-schema-viewer.tsx)

插件 JSON Schema 查看器组件。

```typescript
interface PluginSchemaViewerProps {
  schemaData: Record<string, unknown>;
}

export function PluginSchemaViewer({ schemaData }: PluginSchemaViewerProps): JSX.Element
```

---

#### `PluginSpecViewer` (plugin-spec-viewer.tsx)

插件规范文档查看器组件。

```typescript
interface PluginSpecViewerProps {
  specContent: string;
}

export function PluginSpecViewer({ specContent }: PluginSpecViewerProps): JSX.Element
```

---

### 1.10 场景编辑器组件 (app/scenes/components/)

#### `BasicTab` (BasicTab.tsx)

场景基本信息编辑标签页组件。

```typescript
interface BasicTabProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
}

export function BasicTab({ currentScene, setCurrentScene }: BasicTabProps): JSX.Element
```

---

#### `SceneEditorTabs` (SceneEditorTabs.tsx)

场景编辑器标签页容器组件，组合基本信息、氛围和镜头三个标签页。

```typescript
interface SceneEditorTabsProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
  customElement: string;
  setCustomElement: (value: string) => void;
  customColor: string;
  setCustomColor: (value: string) => void;
  addItem: (field: "elements" | "colors", value: string) => void;
  removeItem: (field: "elements" | "colors", value: string) => void;
}

export function SceneEditorTabs(props: SceneEditorTabsProps): JSX.Element
```

---

#### `CameraTab` (CameraTab.tsx)

场景镜头设置编辑标签页组件。

```typescript
interface CameraTabProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
}

export function CameraTab({ currentScene, setCurrentScene }: CameraTabProps): JSX.Element
```

---

#### `AtmosphereTab` (AtmosphereTab.tsx)

场景氛围设置编辑标签页组件，配置时间、天气、情绪、元素和色彩风格。

```typescript
interface AtmosphereTabProps {
  currentScene: Scene;
  setCurrentScene: (update: Scene | ((prev: Scene) => Scene), shouldMarkDirty?: boolean) => void;
  customElement: string;
  setCustomElement: (value: string) => void;
  customColor: string;
  setCustomColor: (value: string) => void;
  addItem: (field: "elements" | "colors", value: string) => void;
  removeItem: (field: "elements" | "colors", value: string) => void;
}

export function AtmosphereTab(props: AtmosphereTabProps): JSX.Element
```

---

#### `ImageActionToolbar` (ImageActionToolbar.tsx)

图片操作工具栏组件，提供保存、生成、上传、分析等操作按钮。

```typescript
interface ImageActionToolbarProps {
  isDirty: boolean;
  saveStatus: SaveStatus;
  saveError?: string;
  handleSave: () => void;
  isGenerating: boolean;
  imageSize: string;
  setImageSize: (size: string) => void;
  generateImage: () => void;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (selection: ModelSelection | null) => void;
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isAnalyzing: boolean;
  analyzeFileInputRef: React.RefObject<HTMLInputElement | null>;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onShowAssetSelector: () => void;
  entityType: "character" | "scene";
}

export function ImageActionToolbar(props: ImageActionToolbarProps): JSX.Element
```

---

#### `SceneList` (SceneList.tsx)

场景列表组件，展示场景列表侧边栏，支持新建、选择和删除。

```typescript
interface SceneListProps {
  scenes: Scene[];
  scenesLoading: boolean;
  currentSceneId: string;
  isDirty: boolean;
  onSelectScene: (scene: Scene) => void;
  onDeleteScene: (sceneId: string) => void;
  onNewScene: () => void;
}

export const SceneList: React.MemoExoticComponent<(props: SceneListProps) => JSX.Element>
```

---

### 1.11 资产库组件 (app/asset-library/)

#### `AssetCards` (AssetCards.tsx)

资产卡片组件集合，包含角色卡片、场景卡片、分镜卡片和合集卡片。

```typescript
// 角色卡片
interface CharacterCardProps {
  char: Character;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
}
export const CharacterCard: React.MemoExoticComponent<(props: CharacterCardProps) => JSX.Element>

// 场景卡片
interface SceneCardProps {
  scene: Scene;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteScene: (id: string) => void;
}
export const SceneCard: React.MemoExoticComponent<(props: SceneCardProps) => JSX.Element>

// 分镜卡片
interface StoryboardCardProps {
  sb: StoryboardAsset;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteStoryboard: (id: string) => void;
}
export const StoryboardCard: React.MemoExoticComponent<(props: StoryboardCardProps) => JSX.Element>

// 合集卡片
interface CollectionCardProps {
  col: Collection;
  assetCount: number;
  collectionAssets: CollectionAsset[];
  characters: Character[];
  scenes: Scene[];
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
}
export const CollectionCard: React.MemoExoticComponent<(props: CollectionCardProps) => JSX.Element>
```

---

#### `AssetCardGrid` (AssetCardGrid.tsx)

资产卡片网格组件，按标签页展示不同类型的资产卡片网格。

```typescript
export type AssetTab = "characters" | "scenes" | "storyboards" | "collections"
export type { EditingItem } from "./asset-library-shared"
export { fetchSecondaryData } from "./asset-library-shared"

interface AssetCardGridProps {
  activeTab: AssetTab;
  characters: Character[];
  scenes: Scene[];
  collections: Collection[];
  collectionAssets: CollectionAsset[];
  filteredCharacters: Character[];
  filteredScenes: Scene[];
  filteredStoryboards: StoryboardAsset[];
  charactersLoading: boolean;
  scenesLoading: boolean;
  secondaryDataLoading: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEditItem: (item: EditingItem) => void;
  onDeleteCharacter: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onDeleteStoryboard: (id: string) => void;
  onDeleteCollection: (id: string) => void;
  onExportCollection: (id: string) => void;
  onNewCollection: () => void;
}

export function AssetCardGrid(props: AssetCardGridProps): JSX.Element
```

---

#### `AssetEditDialog` (AssetEditDialog.tsx)

资产编辑对话框组件，编辑角色、场景或分镜的名称、描述和标签。

```typescript
interface AssetEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: EditingItem | null;
  isSavingEdit: boolean;
  onSave: () => void;
  onEditingItemChange: (item: EditingItem) => void;
}

export function AssetEditDialog(props: AssetEditDialogProps): JSX.Element
```

---

#### `AssetCollectionDialogs` (AssetCollectionDialogs.tsx)

资产合集对话框组件集合，包含添加到合集、新建合集和导入包三个对话框。

```typescript
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

export function AssetCollectionDialogs(props: AssetCollectionDialogsProps): JSX.Element
```

---

#### `AssetUploadSection` (AssetUploadSection.tsx)

资产上传区域组件，展示标题和导入按钮。

```typescript
interface AssetUploadSectionProps {
  onOpenImportDialog: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AssetUploadSection(props: AssetUploadSectionProps): JSX.Element
```

---

#### `AssetToolbar` (AssetToolbar.tsx)

资产工具栏组件，提供搜索、批量导出、批量删除和全选等操作。

```typescript
interface AssetToolbarProps {
  activeTab: AssetTab;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedIdsSize: number;
  isBatchDeleting: boolean;
  onBatchDelete: () => void;
  onBatchExport: () => void;
  onOpenCollectionDialog: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  showSelectAll: boolean;
}

export function AssetToolbar(props: AssetToolbarProps): JSX.Element
```

---

## 2. Electron 主进程 (electron/src)

### 2.1 入口文件

#### `main.ts`

主进程入口，初始化日志、单实例锁、自动更新、IPC 处理器。

```typescript
// 关键导出（无显式 export，为应用启动入口）
// 设置 IPC 处理器：
setupApiHandlers(options: SetupApiHandlersOptions): void
setupAssetHandlers(): void
setupDatabaseHandlers(): void
registerExportHandlers(): void
registerSecureConfigHandlers(): void
```

---

#### `main-common.ts`

主进程公共模块，导出窗口创建和配置管理函数。

```typescript
interface CreateWindowOptions {
  appPort: number;
  apiPort?: number;
  startApiServerFn: () => Promise<void>;
  openDevTools?: boolean;
  onQuit?: () => void;
}

interface SetupApiHandlersOptions {
  checkForUpdates?: () => Promise<unknown>;
}

export function validateConfigKey(key: string): boolean
export function validateConfigValue(value: unknown): boolean
export function setupApiHandlers(options?: SetupApiHandlersOptions): void
export function startStaticServer(appPort: number, apiPort: number): http.Server | null
export function waitForServer(urlStr: string, maxRetries?: number, interval?: number): Promise<boolean>
export function createWindow(options: CreateWindowOptions): Promise<Electron.BrowserWindow>
export { setupAssetHandlers, setupDatabaseHandlers, registerExportHandlers }
export { loadConfig, saveConfig }
export function closeStaticServer(): void
```

---

#### `preload.ts` — 完整 electronAPI 对象

预加载脚本，通过 `contextBridge.exposeInMainWorld("electronAPI", {...})` 暴露给渲染进程。

> ⚠️ 文件操作（`writeFile`/`readFile`/`getCacheDirectory`/`getFileInfo`/`getDiskSpace`/`fileExists`/`deleteFile`）应优先使用 `@/shared/file-http` 双轨层，直接 IPC 仅作回退。

```typescript
const electronAPI = {
  // 菜单事件
  onNavigate: (callback: MenuEventCallback) => void,
  onMenuNewCharacter: (callback: MenuEventCallback) => void,
  onMenuNewScene: (callback: MenuEventCallback) => void,
  onMenuExport: (callback: MenuEventCallback) => void,
  removeMenuListeners: () => void,

  // 平台信息
  platform: string,  // process.platform
  versions: {
    node: string;
    electron: string;
    chrome: string;
  },

  // 配置（同步，已不推荐直接使用，应通过 HTTP /api/config/get 与 /api/config/set 路由，或 shared/file-http 等价工具）
  getConfig: (key: string) => string | null,     // 返回 JSON.stringify 的配置值
  setConfig: (key: string, value: unknown) => boolean,

  // 资产操作
  saveImage: (...args: IpcArgs) => Promise<IpcResult>,
  deleteFile: (...args: IpcArgs) => Promise<IpcResult>,
  readFileAsBase64: (...args: IpcArgs) => Promise<IpcResult>,
  getAssetsDir: (...args: IpcArgs) => Promise<IpcResult>,
  saveBuffer: (...args: IpcArgs) => Promise<IpcResult>,
  fileExists: (...args: IpcArgs) => Promise<IpcResult>,
  copyFile: (...args: IpcArgs) => Promise<IpcResult>,

  // 文件对话框
  openFileDialog: (...args: IpcArgs) => Promise<IpcResult>,
  saveFileDialog: (...args: IpcArgs) => Promise<IpcResult>,

  // 文件系统
  writeFile: (...args: IpcArgs) => Promise<IpcResult>,
  readFile: (...args: IpcArgs) => Promise<IpcResult>,
  getCacheDirectory: (...args: IpcArgs) => Promise<IpcResult>,
  getFileInfo: (...args: IpcArgs) => Promise<IpcResult>,
  getDiskSpace: (...args: IpcArgs) => Promise<IpcResult>,

  // 图像处理
  normalizeImage: (...args: IpcArgs) => Promise<IpcResult>,
  imageToBase64IPC: (...args: IpcArgs) => Promise<IpcResult>,

  // 数据库（⚠️ modules/ 中禁止直接使用）
  dbQuery: (...args: IpcArgs) => Promise<IpcResult>,
  dbRun: (...args: IpcArgs) => Promise<IpcResult>,
  dbTransaction: (...args: IpcArgs) => Promise<IpcResult>,

  // 安全配置
  secureConfigSave: (...args: IpcArgs) => Promise<IpcResult>,
  secureConfigLoad: (...args: IpcArgs) => Promise<IpcResult>,
  secureConfigResolve: (...args: IpcArgs) => Promise<IpcResult>,
  secureConfigDelete: (...args: IpcArgs) => Promise<IpcResult>,
  secureConfigHas: (...args: IpcArgs) => Promise<IpcResult>,

  // Shell
  openExternal: (...args: IpcArgs) => Promise<IpcResult>,
  openPath: (...args: IpcArgs) => Promise<IpcResult>,

  // 导出
  exportData: (...args: IpcArgs) => Promise<IpcResult>,
}
```

**IPC 权限分级**：

| 级别 | 允许的通道 |
|------|-----------|
| READONLY | `db:query`, `db:get`, `db:stats`, `db:type`, `assets:read-file-base64`, `assets:get-dir`, `assets:file-exists`, `fs:read-file`, `cache:get-cache-directory`, `fs:get-file-info`, `fs:get-disk-space`, `image:to-base64`, `config:get`, `secure-config:load`, `secure-config:has`, `export:data` |
| READWRITE | `db:run`, `db:batch-insert`, `db:init`, `db:save`, `assets:save-image`, `assets:save-buffer`, `assets:copy-file`, `fs:write-file`, `image:normalize`, `config:set`, `secure-config:save`, `secure-config:delete` |
| DANGEROUS | `db:transaction`, `db:migrate`, `db:vacuum`, `db:analyze`, `db:checkpoint`, `assets:delete-file`, `db:backup-status`, `db:create-backup` |
| SYSTEM | `shell:open-external`, `shell:open-path`, `dialog:open-file`, `dialog:save-file`, `db:close` |
| SECURE | `secure-config:resolve` |

---

### 2.2 API 服务 (api/)

#### `server.ts`

API HTTP 服务器。

```typescript
export function startApiServer(): Promise<void>
export function stopApiServer(): void
export const API_PORT: number
export { registerAllowedOrigin } from "./middleware"
```

**配置**：
- 端口：`API_SERVER_PORT`
- 最大请求体：50MB
- 速率限制：180 请求/分钟

---

#### `routes.ts`

路由注册，合并所有路由组。

```typescript
export const routes: Record<string, Route> = {
  ...coreRoutes,
  ...dbRoutes,
  ...fileRoutes,
  ...generationRoutes,
  ...pluginRoutes,
  ...shotRoutes,
  ...storyboardRoutes,
}
```

---

#### `schemas.ts` — 所有 Zod Schema 和推断类型

这是最关键的文件，定义了所有 API 请求的验证 Schema。

```typescript
// === 上传 ===
export const uploadSchema = z.object({
  file: z.unknown(),
  category: z.string().optional(),
});
export type UploadRequest = z.infer<typeof uploadSchema>;

// === 图像分析 ===
export const analyzeImageSchema = z.object({
  image: z.unknown(),
  prompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type AnalyzeImageRequest = z.infer<typeof analyzeImageSchema>;

// === 图像生成 ===
export const generateImageSchema = z.object({
  prompt: z.string(),
  category: z.string().optional(),
  size: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateImageRequest = z.infer<typeof generateImageSchema>;

// === 关键帧生成 ===
export const generateKeyframeSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  prevKeyframe: z.string().optional(),
  shotRequirement: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateKeyframeRequest = z.infer<typeof generateKeyframeSchema>;

// === 帧对生成 ===
export const generateFramePairSchema = z.object({
  firstFrame: z.unknown().optional(),
  lastFrame: z.unknown().optional(),
  keyframeUrl: z.string().optional(),
  keyframePrompt: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  prevLastFrameUrl: z.string().optional(),
  actionDescription: z.string().optional(),
  duration: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateFramePairRequest = z.infer<typeof generateFramePairSchema>;

// === 视频生成 ===
export const generateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  firstFrameUrl: z.string().optional(),
  lastFrameUrl: z.string().optional(),
  characterRef: z.string().optional(),
  characterRefs: z.array(z.string()).optional(),
  sceneRef: z.string().optional(),
  referenceVideo: z.union([
    z.string(),
    z.object({ videoUrl: z.string(), mimicryLevel: z.string().optional() }),
  ]).optional(),
  duration: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  format: z.string().optional(),
});
export type GenerateVideoRequest = z.infer<typeof generateVideoSchema>;

// === 视频状态查询 ===
export const videoStatusSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string().optional(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  format: z.string().optional(),
});
export type VideoStatusRequest = z.infer<typeof videoStatusSchema>;

// === 文本生成 ===
export const generateTextSchema = z.object({
  prompt: z.string(),
  maxTokens: z.number().optional(),
  temperature: z.number().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type GenerateTextRequest = z.infer<typeof generateTextSchema>;

// === 连接测试 ===
export const testConnectionSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  providerId: z.string().optional(),
});
export type TestConnectionRequest = z.infer<typeof testConnectionSchema>;

// === 数据导出 ===
export const exportSchema = z.object({
  data: z.unknown().optional(),
  format: z.string().optional(),
});
export type ExportRequest = z.infer<typeof exportSchema>;

// === 故事规划 ===
export const storyPlanSchema = z.object({
  story: z.record(z.string(), z.unknown()),
  characters: z.array(z.unknown()),
  scenes: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
  planPrompt: z.string().optional(),
});
export type StoryPlanRequest = z.infer<typeof storyPlanSchema>;

// === 故事视频生成 ===
export const storyGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  storyId: z.string().optional(),
  beatId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateVideoRequest = z.infer<typeof storyGenerateVideoSchema>;

// === 故事关键帧生成 ===
export const storyGenerateKeyframeSchema = z.object({
  beat: z.unknown().optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateKeyframeRequest = z.infer<typeof storyGenerateKeyframeSchema>;

// === 故事帧对生成 ===
export const storyGenerateFramePairSchema = z.object({
  beat: z.unknown().optional(),
  storyId: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type StoryGenerateFramePairRequest = z.infer<typeof storyGenerateFramePairSchema>;

// === 快速视频生成 ===
export const quickGenerateVideoSchema = z.object({
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type QuickGenerateVideoRequest = z.infer<typeof quickGenerateVideoSchema>;

// === 角色图像生成 ===
export const characterGenerateImageSchema = z.object({
  character: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});
export type CharacterGenerateImageRequest = z.infer<typeof characterGenerateImageSchema>;

// === 场景图像生成 ===
export const sceneGenerateImageSchema = z.object({
  scene: z.record(z.string(), z.unknown()),
  useDetailedPrompt: z.boolean().optional(),
  imageSize: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  imagePrompt: z.string().optional(),
  detailedPromptInstruction: z.string().optional(),
});
export type SceneGenerateImageRequest = z.infer<typeof sceneGenerateImageSchema>;

// === 角色图像分析 ===
export const characterAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type CharacterAnalyzeImageRequest = z.infer<typeof characterAnalyzeImageSchema>;

// === 场景图像分析 ===
export const sceneAnalyzeImageSchema = z.object({
  image: z.unknown(),
  analysisPrompt: z.string().optional(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
});
export type SceneAnalyzeImageRequest = z.infer<typeof sceneAnalyzeImageSchema>;

// === 视频策略选择 ===
export const videoSelectStrategySchema = z.object({
  apiUrl: z.string(),
  model: z.string(),
});
export type VideoSelectStrategyRequest = z.infer<typeof videoSelectStrategySchema>;

// === 视频格式检测 ===
export const videoDetectFormatSchema = z.object({
  apiUrl: z.string(),
  modelId: z.string().optional(),
});
export type VideoDetectFormatRequest = z.infer<typeof videoDetectFormatSchema>;

// === 插件添加 ===
export const pluginAddSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type PluginAddRequest = z.infer<typeof pluginAddSchema>;

// === 插件删除 ===
export const pluginDeleteSchema = z.object({
  pluginId: z.string(),
});
export type PluginDeleteRequest = z.infer<typeof pluginDeleteSchema>;

// === 插件验证 ===
export const pluginValidateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type PluginValidateRequest = z.infer<typeof pluginValidateSchema>;

// === 视频追踪信息 ===
export const videoTrackingInfoSchema = z.object({
  taskId: z.string(),
  apiUrl: z.string(),
  apiKeyPreview: z.string(),
  model: z.string(),
});
export type VideoTrackingInfoRequest = z.infer<typeof videoTrackingInfoSchema>;

// === 视频提供商信息 ===
export const videoProviderInfoSchema = z.object({
  apiUrl: z.string().optional(),
});
export type VideoProviderInfoRequest = z.infer<typeof videoProviderInfoSchema>;

// === 镜头引用验证 ===
export const shotValidateReferenceSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});
export type ShotValidateReferenceRequest = z.infer<typeof shotValidateReferenceSchema>;

// === 镜头引用视频URL ===
export const shotGetReferenceVideoUrlSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});
export type ShotGetReferenceVideoUrlRequest = z.infer<typeof shotGetReferenceVideoUrlSchema>;

// === 镜头引用描述 ===
export const shotBuildReferenceDescriptionSchema = z.object({
  shot: z.unknown(),
  allShots: z.array(z.unknown()),
  reference: z.unknown(),
});
export type ShotBuildReferenceDescriptionRequest = z.infer<typeof shotBuildReferenceDescriptionSchema>;

// === 一致性验证 ===
export const validateConsistencySchema = z.object({}).passthrough();
export type ValidateConsistencyRequest = z.infer<typeof validateConsistencySchema>;

// === 特征锚定验证 ===
export const validateFeatureAnchoringSchema = z.object({
  config: z.unknown(),
});
export type ValidateFeatureAnchoringRequest = z.infer<typeof validateFeatureAnchoringSchema>;

// === 无帧绑定验证 ===
export const validateNoFrameBindingSchema = z.object({}).passthrough();
export type ValidateNoFrameBindingRequest = z.infer<typeof validateNoFrameBindingSchema>;

// === 角色引用检查 ===
export const referenceCheckCharacterSchema = z.object({
  characterId: z.string(),
  stories: z.array(z.unknown()),
});
export type ReferenceCheckCharacterRequest = z.infer<typeof referenceCheckCharacterSchema>;

// === 场景引用检查 ===
export const referenceCheckSceneSchema = z.object({
  sceneId: z.string(),
  stories: z.array(z.unknown()),
});
export type ReferenceCheckSceneRequest = z.infer<typeof referenceCheckSceneSchema>;

// === 视觉一致性检查 ===
export const visualConsistencyCheckSchema = z.object({
  generatedImageUrl: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  element: z.record(z.string(), z.unknown()),
});
export type VisualConsistencyCheckRequest = z.infer<typeof visualConsistencyCheckSchema>;

// === Beat 视觉一致性检查 ===
export const visualConsistencyCheckBeatSchema = z.object({
  beat: z.unknown(),
  elements: z.array(z.unknown()),
  generatedImageMap: z.record(z.string(), z.string()).optional(),
});
export type VisualConsistencyCheckBeatRequest = z.infer<typeof visualConsistencyCheckBeatSchema>;

// === 分镜关键帧生成 ===
export const storyboardGenerateKeyframeSchema = z.object({
  beat: z.unknown(),
  prevBeat: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateKeyframeRequest = z.infer<typeof storyboardGenerateKeyframeSchema>;

// === 分镜帧对生成 ===
export const storyboardGenerateFramePairSchema = z.object({
  beat: z.unknown(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateFramePairRequest = z.infer<typeof storyboardGenerateFramePairSchema>;

// === 分镜视频生成 ===
export const storyboardGenerateVideoSchema = z.object({
  beat: z.unknown(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateVideoRequest = z.infer<typeof storyboardGenerateVideoSchema>;

// === 分镜完整工作流 ===
export const storyboardGenerateFullWorkflowSchema = z.object({
  beat: z.unknown(),
  prevBeat: z.unknown().optional(),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateFullWorkflowRequest = z.infer<typeof storyboardGenerateFullWorkflowSchema>;

// === 分镜关键帧链式生成 ===
export const storyboardGenerateKeyframeChainSchema = z.object({
  beats: z.array(z.unknown()),
  options: z.record(z.string(), z.unknown()),
});
export type StoryboardGenerateKeyframeChainRequest = z.infer<typeof storyboardGenerateKeyframeChainSchema>;

// === 视频恢复 ===
export const videoRecoverSchema = z.object({
  taskId: z.string(),
  taskRecord: z.record(z.string(), z.unknown()).optional(),
});
export type VideoRecoverRequest = z.infer<typeof videoRecoverSchema>;

// === 视频任务批量保存 ===
export const videoTasksBulkSaveSchema = z.object({
  tasks: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type VideoTasksBulkSaveRequest = z.infer<typeof videoTasksBulkSaveSchema>;

// === 通用 key-value 配置存储（与 IPC config:get/config:set 对齐） ===
export const configGetSchema = z.object({
  key: z.string().min(1).max(256),
});
export type ConfigGetRequest = z.infer<typeof configGetSchema>;

export const configSetSchema = z.object({
  key: z.string().min(1).max(256),
  value: z.unknown(),
});
export type ConfigSetRequest = z.infer<typeof configSetSchema>;

// === 文件写入（按绝对路径，受 ALLOWED_ROOTS 限制） ===
export const fileWriteSchema = z.object({
  filePath: z.string().min(1),
  data: z.union([z.string(), z.instanceof(Buffer)]),
});
export type FileWriteRequest = z.infer<typeof fileWriteSchema>;

// === 磁盘空间查询 ===
export const fileDiskSpaceSchema = z.object({
  dirPath: z.string().min(1),
});
export type FileDiskSpaceRequest = z.infer<typeof fileDiskSpaceSchema>;

// === 文件路由内部 Schema（file-routes.ts 内联使用） ===
export const fileSaveSchema = z.object({
  category: fileCategorySchema,
  key: z.string().min(1),
  data: z.union([z.string(), z.instanceof(Buffer)]),
  mimeType: z.string().optional(),
});
export type FileSaveRequest = z.infer<typeof fileSaveSchema>;

export const fileReadSchema = z.object({
  key: z.string().min(1),
});
export type FileReadRequest = z.infer<typeof fileReadSchema>;

export const fileDeleteSchema = z.object({
  key: z.string().min(1),
});
export type FileDeleteRequest = z.infer<typeof fileDeleteSchema>;

export const fileExistsSchema = z.object({
  key: z.string().min(1),
});
export type FileExistsRequest = z.infer<typeof fileExistsSchema>;

export const fileCopySchema = z.object({
  sourceKey: z.string().min(1),
  targetCategory: fileCategorySchema,
  targetKey: z.string().min(1),
});
export type FileCopyRequest = z.infer<typeof fileCopySchema>;

export const fileListSchema = z.object({
  category: fileCategorySchema,
});
export type FileListRequest = z.infer<typeof fileListSchema>;

export const fileInfoSchema = z.object({
  key: z.string().min(1),
});
export type FileInfoRequest = z.infer<typeof fileInfoSchema>;

export const fileWriteAtomicSchema = z.object({
  category: fileCategorySchema,
  key: z.string().min(1),
  data: z.union([z.string(), z.instanceof(Buffer)]),
});
export type FileWriteAtomicRequest = z.infer<typeof fileWriteAtomicSchema>;
```

---

#### `types.ts` — API 类型定义

```typescript
export interface ApiRequest {
  [key: string]: unknown;
}

export interface StructuredError {
  code: string;
  message: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  ok?: boolean;
  data?: T;
  error?: string | StructuredError;
  httpStatus?: number;
}

export type RouteHandler<T extends ApiRequest = ApiRequest> = (
  method: string,
  body: T,
  req: import("http").IncomingMessage,
) => Promise<ApiResponse | Record<string, unknown> | unknown>;

export interface Route<T extends ApiRequest = ApiRequest> {
  handler(method: string, body: T, req: import("http").IncomingMessage): Promise<ApiResponse | Record<string, unknown> | unknown>;
  schema?: ZodType<T>;
  methods: string[];
}

// 重载：带 schema 的路由
export function defineRoute<T extends ApiRequest>(
  route: { handler: RouteHandler<T>; schema: ZodType<T>; methods: string[] },
): Route<T>;
// 重载：不带 schema 的路由
export function defineRoute(
  route: { handler: RouteHandler; methods: string[] },
): Route;
```

---

#### `middleware.ts`

```typescript
export interface RateLimitEntry {
  windowMs: number;
  max: number;
  requests: Map<string, number[]>;
  check(ip: string): boolean;
  cleanup(): void;
}

export const rateLimit: RateLimitEntry;  // 60秒窗口，180次上限

export function registerAllowedOrigin(port: number): void
export function isAllowedOrigin(origin: string): boolean
export function handleCors(req: IncomingMessage, res: ServerResponse): boolean
export function checkAuthHeader(req: IncomingMessage, res: ServerResponse): boolean
export function checkRateLimit(ip: string, res: ServerResponse): boolean
export function trackConnection(socket: net.Socket): void
export function destroyAllConnections(): void
```

---

#### 路由组 (route-groups/)

| 路由组 | 文件 | 路由名称 |
|--------|------|---------|
| **core-routes** | `core-routes.ts` | `config`, `secure-config`, `config/get`, `config/set`, `upload`, `test-connection`, `sync/config`, `sync/test`, `sync/proxy`, `export` |
| **db-routes** | `db-routes.ts` | `db/query`, `db/run`, `db/get`, `db/batch-insert`, `db/transaction`, `db/stats`, `db/type`, `db/init`, `db/save`, `db/migrate`, `db/vacuum`, `db/analyze`, `db/checkpoint`, `db/backup-status`, `db/create-backup`, `db/close` |
| **file-routes** | `file-routes.ts` | `file/save`, `file/read`, `file/read-base64`, `file/delete`, `file/exists`, `file/copy`, `file/list`, `file/info`, `file/write-atomic`, `file/write`, `file/cache-directory`, `file/disk-space` |
| **generation-routes** | `generation-routes.ts` | `analyze-image`, `generate-image`, `generate-keyframe`, `generate-frame-pair`, `generate-video`, `video-status`, `generate-text`, `story-plan`, `story-generate-video`, `story-generate-keyframe`, `story-generate-frame-pair`, `quick-generate-video`, `character-generate-image`, `scene-generate-image`, `character-analyze-image`, `scene-analyze-image` |
| **plugin-routes** | `plugin-routes.ts` | `video/select-strategy`, `video/detect-format`, `plugins/list`, `plugins/add`, `plugins/delete`, `plugins/reload`, `plugins/reload-code`, `plugins/validate`, `plugins/schema`, `plugins/specification` |
| **shot-routes** | `shot-routes.ts` | `shot/validate-reference`, `shot/get-reference-video-url`, `shot/build-reference-description`, `validate-consistency`, `validate-feature-anchoring`, `validate-no-frame-binding`, `reference-check/character`, `reference-check/scene`, `visual-consistency-check`, `visual-consistency-check-beat` |
| **storyboard-routes** | `storyboard-routes.ts` | `video/tracking-info`, `video/provider-info`, `storyboard/generate-keyframe`, `storyboard/generate-frame-pair`, `storyboard/generate-video`, `storyboard/generate-full-workflow`, `storyboard/generate-keyframe-chain`, `video/recover`, `video-tasks/bulk-save` |

---

#### shared/file-http（双轨通信层）

`src/shared/file-http/index.ts` 是渲染进程访问文件操作的统一入口，采用 **HTTP 优先 + IPC 回退** 的双轨模式：

1. **HTTP 优先**：先探测 `http://localhost:{API_SERVER_PORT}/api/health`，可用时调用 `/api/file/*` 路由（`file/write`, `file/read`, `file/info`, `file/cache-directory`, `file/disk-space`, `file/exists`, `file/delete`）。
2. **IPC 回退**：HTTP 不可用或调用失败时，回退到 `window.electronAPI` 的对应方法（向后兼容旧版本）。

**导出函数（7 个公开 + 1 个测试用）**：

```typescript
export async function writeFile(filePath: string, data: Uint8Array | ArrayBuffer | string): Promise<{ success: boolean; error?: string }>;
export async function readFile(filePath: string): Promise<{ success: boolean; data?: ArrayBuffer; error?: string } | null>;
export async function getFileInfo(filePath: string): Promise<{ success: boolean; size?: number; error?: string } | null>;
export async function getCacheDirectory(): Promise<{ success: boolean; path?: string; error?: string }>;
export async function getDiskSpace(dirPath: string): Promise<{ success: boolean; availableBytes?: number; totalBytes?: number; error?: string } | null>;
export async function fileExists(filePath: string): Promise<boolean>;
export async function deleteFile(filePath: string): Promise<boolean>;
export function _resetHttpCache(): void;  // 测试用
```

**关键约束**：
- **100MB 写入上限**：`file-routes.ts` 中 `MAX_WRITE_SIZE = 100 * 1024 * 1024`，超出将拒绝写入。
- **路径安全校验**：服务端通过 `isPathAllowed(filePath)` 校验路径必须位于 `ALLOWED_ROOTS` 之下，防止越权访问。
- **HTTP 可用性缓存**：`_httpAvailable` 单次探测后缓存结果，失败时自动标记为不可用并回退到 IPC。

---

### 2.3 插件系统 (plugins/)

#### `types.ts` — 所有插件接口

```typescript
export type ImageRefMode = "native_field" | "multimodal" | "ref_field" | "text_append" | "bake_into_first" | "none";
export type ImageUploadMode = "base64" | "url" | "upload";
export type ImageTransportMode = "base64" | "url" | "upload";
export type ImagePurpose = "firstFrame" | "lastFrame" | "referenceVideo" | "characterRef" | "sceneRef" | "analysisTarget" | "referenceImage";

export interface ImageSizeOption { width: number; height: number; label: string; aspectRatio: string }

export interface ModelCapabilities {
  maxReferences: number;
  maxResolution: number;
  maxSizeMB: number;
  supportsLastFrame: boolean;
  referenceMode: "separate" | "merged";
  supportedImageSizes?: ImageSizeOption[];
  defaultImageSize?: string;
  urlTtl?: number;
  supportsCharacterRef?: boolean;
  supportsSceneRef?: boolean;
  nativeCharacterRef?: boolean;
  nativeSceneRef?: boolean;
  characterRefMode?: ImageRefMode;
  sceneRefMode?: ImageRefMode;
}

export interface VideoCapabilities {
  supportsLastFrame: boolean;
  supportsReferenceVideo: boolean;
  supportsMimicryLevel: boolean;
  defaultModel: string;
  maxDuration: number;
  supportedCodecs?: string[];
  urlTtl?: number;
  supportsCharacterRef?: boolean;
  supportsSceneRef?: boolean;
  characterRefMode?: ImageRefMode;
  sceneRefMode?: ImageRefMode;
  characterRefField?: string;
  sceneRefField?: string;
  imageUploadMode?: ImageUploadMode;
  maxCharacterRefs?: number;
}

export interface ImageCapabilities {
  supportsReferenceImage: boolean;
  defaultModel: string;
}

export interface VideoBuildContext {
  prompt: string;
  model?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceVideoUrl?: string;
  referenceVideoMimicryLevel?: string;
  duration: number;
  characterRefs?: string[];
  characterRef?: string;
  sceneRef?: string;
}

export interface ImageBuildContext {
  prompt: string;
  model?: string;
  size: string;
  referenceImages: string[];
  characterRef?: string;
  sceneRef?: string;
}

export interface TextBuildContext {
  prompt: string;
  model?: string;
  maxTokens: number;
  temperature: number;
}

export interface VisionBuildContext {
  prompt: string;
  model?: string;
  imageUrl: string;
  maxTokens?: number;
}

export interface VideoRequestResult {
  body: Record<string, unknown>;
  endpoint: string;
  extraHeaders?: Record<string, string>;
  method?: "POST" | "GET";
}

export interface ImageRequestResult { body: Record<string, unknown>; endpoint: string }
export interface TextRequestResult { body: Record<string, unknown>; endpoint: string }
export interface VisionRequestResult { body: Record<string, unknown>; endpoint: string }

export interface CloudProviderInfo {
  name: string;
  websiteUrl: string;
  taskUrlPattern: (taskId: string) => string;
  queryEndpoint: (baseUrl: string, taskId: string) => string;
  apiDocUrl: string;
  howToCheck: string;
}

export interface DurationOption { value: number; label: string }
export interface ResolutionOption { value: string; label: string; width: number; height: number }
export interface StyleOption { value: string; label: string; description?: string }

export interface ApiKeyDetectionRule {
  pattern: string;
  confidence: "high" | "medium" | "low";
  check?: (key: string) => boolean;
}

export interface ApiKeyDetection {
  rules: ApiKeyDetectionRule[];
  suggestedName: string;
  baseUrl?: string;
}

export interface ModelParameterOptions {
  durations?: DurationOption[];
  resolutions?: ResolutionOption[];
  styles?: StyleOption[];
  negativePrompt?: boolean;
  seed?: boolean;
  cfgScale?: { min: number; max: number; default: number; step: number };
  lora?: boolean;
}

export interface ModelParameterProfile {
  modelId: string;
  displayName?: string;
  capabilities: ModelCapabilities;
  parameters: ModelParameterOptions;
}

export interface MatchPattern { urlPattern: string; modelPattern?: string }

export interface ProviderCapabilities {
  video: boolean;
  image: boolean;
  text: boolean;
  vision: boolean;
  nativeCharacterRef?: boolean;
  nativeSceneRef?: boolean;
}

export interface AIProviderPlugin {
  readonly id: string;
  readonly displayName: string;
  match(apiUrl: string, model?: string): boolean;
  readonly matchPatterns?: MatchPattern[];
  readonly capabilities: ProviderCapabilities;
  readonly videoCapabilities: VideoCapabilities;
  readonly imageCapabilities: ImageCapabilities;
  getModelCapabilities(modelId: string): ModelCapabilities;

  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  extractTaskId(response: Record<string, unknown>): string | undefined;
  extractVideoUrl(response: Record<string, unknown>): string | undefined;
  getVideoStatusEndpoint(baseUrl: string, taskId: string, model?: string): string;

  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;
  extractImageUrl(response: Record<string, unknown>): string | undefined;

  buildTextRequest(ctx: TextBuildContext): TextRequestResult;
  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult;

  getImageTransportMode(purpose: ImagePurpose): ImageTransportMode;
  prepareImage(url: string, purpose: ImagePurpose, apiConfig: { apiKey: string; apiUrl: string }): Promise<string | undefined>;
  uploadAsset?(data: Buffer, filename: string, mimeType: string, apiKey: string, apiUrl: string): Promise<string>;

  getAuthHeaders(apiKey: string, endpoint?: string): Record<string, string>;
  readonly preferLocalData?: boolean;

  getCloudInfo?(baseUrl: string): CloudProviderInfo | undefined;
  appendAuthToUrl?(url: string, apiKey: string): string;
  extractTextContent?(response: Record<string, unknown>): string;
  extractStatus?(response: Record<string, unknown>): { status: string; progress?: number; message?: string };
  getStatusMethod?(): "GET" | "POST";

  getModelParameterProfile(modelId: string): ModelParameterProfile;
  getAvailableModels?(): string[];
  getApiKeyDetection?(): ApiKeyDetection | undefined;
}

export interface AsyncAIProviderPlugin extends AIProviderPlugin {
  buildVideoRequestAsync?(ctx: VideoBuildContext): Promise<VideoRequestResult>;
  buildImageRequestAsync?(ctx: ImageBuildContext): Promise<ImageRequestResult>;
  buildTextRequestAsync?(ctx: TextBuildContext): Promise<TextRequestResult>;
  buildVisionRequestAsync?(ctx: VisionBuildContext): Promise<VisionRequestResult>;
  getAuthHeadersAsync?(apiKey: string, endpoint?: string): Promise<Record<string, string>>;
  extractTaskIdAsync?(response: Record<string, unknown>): Promise<string | undefined>;
  extractVideoUrlAsync?(response: Record<string, unknown>): Promise<string | undefined>;
  extractImageUrlAsync?(response: Record<string, unknown>): Promise<string | undefined>;
  extractStatusAsync?(response: Record<string, unknown>): Promise<{ status: string; progress?: number; message?: string }>;
  extractTextContentAsync?(response: Record<string, unknown>): Promise<string>;
  getVideoStatusEndpointAsync?(baseUrl: string, taskId: string, model?: string): Promise<string>;
  getModelCapabilitiesAsync?(modelId: string): Promise<ModelCapabilities>;
  getModelParameterProfileAsync?(modelId: string): Promise<ModelParameterProfile>;
  getAvailableModelsAsync?(): Promise<string[]>;
  getApiKeyDetectionAsync?(): Promise<ApiKeyDetection | undefined>;
  getCloudInfoAsync?(baseUrl: string): Promise<CloudProviderInfo | undefined>;
}
```

---

#### `registry.ts` — PluginRegistry

```typescript
export class PluginRegistry {
  register(plugin: AIProviderPlugin, isUserPlugin?: boolean): void
  setFallback(plugin: AIProviderPlugin): void
  unregister(pluginId: string): boolean
  select(apiUrl: string, model?: string): AIProviderPlugin | undefined
  selectById(pluginId: string): AIProviderPlugin | undefined
  getAll(): AIProviderPlugin[]
  getBuiltInPlugins(): AIProviderPlugin[]
  getUserPlugins(): AIProviderPlugin[]
  isUserPlugin(pluginId: string): boolean
  isCodePlugin(pluginId: string): boolean
  reloadUserPlugins(): { loaded: number; errors: string[] }
  loadCodePlugins(): Promise<{ loaded: number; errors: string[] }>
  getCodePlugins(): AIProviderPlugin[]
  getAllCapabilities(): Record<string, {
    id: string; displayName: string; isUserPlugin: boolean; isCodePlugin: boolean;
    capabilities: ProviderCapabilities; videoCapabilities: VideoCapabilities; imageCapabilities: ImageCapabilities;
  }>
  getAllModelProfiles(): Record<string, ModelParameterProfile & { providerId: string; isUserPlugin: boolean; isCodePlugin: boolean }>
}

export const pluginRegistry: PluginRegistry;
export { USER_PLUGINS_DIR, CODE_PLUGINS_DIR }
```

---

#### `base-provider.ts` — BaseAIProviderPlugin

```typescript
export abstract class BaseAIProviderPlugin implements AIProviderPlugin {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract match(apiUrl: string, model?: string): boolean;

  get capabilities(): ProviderCapabilities;  // 默认 { video: true, image: true, text: true, vision: true }
  abstract readonly videoCapabilities: VideoCapabilities;
  abstract readonly imageCapabilities: ImageCapabilities;
  abstract getModelCapabilities(modelId: string): ModelCapabilities;
  abstract buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  abstract buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;

  extractTaskId(data: Record<string, unknown>): string | undefined;
  extractVideoUrl(data: Record<string, unknown>): string | undefined;
  extractImageUrl(data: Record<string, unknown>): string | undefined;
  getVideoStatusEndpoint(baseUrl: string, taskId: string, model?: string): string;
  buildTextRequest(ctx: TextBuildContext): TextRequestResult;
  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult;
  getImageTransportMode(_purpose: ImagePurpose): ImageTransportMode;  // 默认 "url"
  prepareImage(url: string, purpose: ImagePurpose, apiConfig: { apiKey: string; apiUrl: string }): Promise<string | undefined>;
  getAuthHeaders(apiKey: string, _endpoint?: string): Record<string, string>;  // 默认 Bearer
  appendAuthToUrl(url: string, _apiKey: string): string;
  extractTextContent(response: Record<string, unknown>): string;
  extractStatus(response: Record<string, unknown>): { status: string; progress?: number; message?: string };
  getStatusMethod(): "GET" | "POST";  // 默认 "GET"
  getModelParameterProfile(modelId: string): ModelParameterProfile;
  getAvailableModels(): string[];  // 默认 []
}
```

---

#### providers/ — 内置提供商

| 文件 | 类名 | 说明 |
|------|------|------|
| `openai-compatible.ts` | `OpenAICompatibleProvider` | OpenAI 兼容提供商 |
| `openai-sora.ts` | `OpenAISoraProvider` | OpenAI Sora 视频生成 |
| `anthropic.ts` | `AnthropicProvider` | Anthropic Claude |
| `google.ts` | `GoogleProvider` | Google Gemini |
| `luma.ts` | `LumaProvider` | Luma 视频生成 |
| `pika.ts` | `PikaProvider` | Pika 视频生成 |
| `runway.ts` | `RunwayProvider` | Runway 视频生成 |
| `kuaishou.ts` | `KuaishouProvider` | 快手可灵 |
| `minimax.ts` | `MinimaxProvider` | MiniMax |
| `volcengine.ts` | `VolcengineProvider` | 火山引擎 |
| `zhipu.ts` | `ZhipuProvider` | 智谱 AI |
| `pixverse.ts` | `PixverseProvider` | Pixverse |
| `seedance.ts` | `SeedanceProvider` | Seedance |

---

### 2.4 安全模块 (security/)

#### `key-storage/types.ts`

```typescript
export type StorageResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export interface KeyStorageStrategy {
  readonly name: string;
  readonly priority: number;
  isAvailable(): boolean;
  save(key: string, value: string): Promise<StorageResult>;
  load(key: string): Promise<StorageResult<string | null>>;
  delete(key: string): Promise<StorageResult>;
  list(): Promise<StorageResult<string[]>>;
  clear(): Promise<StorageResult>;
}

export interface EncryptedDataPacket {
  alg: string;
  iv: string;
  tag: string;
  ciphertext: string;
  createdAt: string;
  strategy: string;
}

export interface KeyStorageConfig {
  encryptedDataPath?: string;
  autoMigrate?: boolean;
  forceStrategy?: string;
}

export interface MigrationResult {
  migrated: boolean;
  keysMigrated: number;
  strategy: string;
  duration: number;
}
```

#### `key-storage/key-storage.ts` — KeyStorageManager

```typescript
class KeyStorageManager {
  register(strategy: KeyStorageStrategy): void
  getStrategy(name: string): KeyStorageStrategy | undefined
  getAllStrategies(): KeyStorageStrategy[]
  getActiveStrategy(): KeyStorageStrategy | null
  initialize(): Promise<StorageResult>
  // ... save, load, delete, list, clear, migrateFromPlaintext
}
```

**策略实现**：
- `SafeStorageStrategy` — Electron safeStorage 加密（优先级最高）
- `PlaintextFallbackStrategy` — 明文回退（最低优先级）

---

#### `ssrf-guard/ssrf-guard.ts`

```typescript
export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

export interface SsrfGuardConfig {
  enableDnsResolution?: boolean;       // 默认 true
  customWhitelist?: string[];           // 自定义 IP/CIDR 白名单
  blockMetadataEndpoints?: boolean;     // 阻止云元数据端点
  dnsFailurePolicy?: "allow" | "deny";  // DNS 解析失败策略
}

class SsrfGuard {
  validate(url: string): Promise<SsrfValidationResult>
  isPrivateIp(ip: string): boolean
  addToWhitelist(entry: string): void
}
```

---

### 2.5 数据库 (database/)

| 文件 | 导出 | 说明 |
|------|------|------|
| `db-connection.ts` | `getDb()`, `closeDb()` | 数据库连接管理 |
| `db-schema.ts` | 数据库 Schema 定义 | Drizzle ORM Schema |
| `migrations.ts` | 迁移管理 | 数据库版本迁移 |
| `schema-builder.ts` | Schema 构建工具 | 动态 Schema 构建 |
| `index.ts` | 统一导出 | `getDb`, `CURRENT_SCHEMA_VERSION` |

---

### 2.6 处理器 (handlers/)

| 文件 | 说明 |
|------|------|
| `assets.ts` | 资产文件处理（保存、读取、删除） |
| `config-storage.ts` | 配置存储处理 |
| `config.ts` | 配置读写（`loadConfig`, `saveConfig`） |
| `database.ts` | 数据库 IPC 处理器 |
| `export.ts` | 数据导出处理 |
| `secure-config.ts` | 安全配置 IPC 处理器（`registerSecureConfigHandlers`） |
| `sync.ts` | 同步配置处理（`handleSyncConfig`, `handleSyncTest`, `handleSyncProxy`） |
| `test-connection.ts` | 连接测试处理（`handleTestConnection`） |

---

### 2.7 API 网关 (api-gateway*.ts)

| 文件 | 说明 |
|------|------|
| `api-gateway.ts` | 主网关，视频/图像/文本生成请求路由 |
| `api-gateway-image.ts` | 图像生成网关 |
| `api-gateway-retry.ts` | 重试逻辑 |
| `api-gateway-utils.ts` | 网关工具函数 |
| `api-gateway-error-codes.ts` | 错误码定义 |
| `api-server.ts` | API 服务器启动 |

---

### 2.8 配置 (config/)

| 文件 | 导出 | 说明 |
|------|------|------|
| `config-manager.ts` | `ConfigManager` | 配置管理器类 |
| `ports.ts` | `API_SERVER_PORT`, `APP_SERVER_PORT`, `DEV_SERVER_PORT` | 端口常量 |
| `index.ts` | 统一导出 | 配置模块入口 |

---

### 2.9 生命周期 (lifecycle/)

| 文件 | 导出 | 说明 |
|------|------|------|
| `manager.ts` | `LifecycleManager` | 生命周期管理器 |
| `states.ts` | 生命周期状态定义 | 应用状态枚举 |
| `cleanup.ts` | 清理函数 | 关闭时资源清理 |
| `recovery.ts` | 恢复逻辑 | 崩溃恢复 |
| `index.ts` | 统一导出 | 生命周期模块入口 |

---

### 2.10 日志 (logging/)

| 文件 | 导出 | 说明 |
|------|------|------|
| `logger.ts` | `getLogger()`, `loggerRegistry` | 日志管理器和注册表 |
| `types.ts` | 日志类型定义 | `LogLevel`, `LogEntry` 等 |
| `transports/console.transport.ts` | `ConsoleTransport` | 控制台日志传输 |
| `transports/file.transport.ts` | `FileTransport` | 文件日志传输 |
| `index.ts` | 统一导出 | `getLogger`, `loggerRegistry` |

---

### 2.11 同步 HTTP 客户端

`sync-http-client.ts` — 同步 HTTP 客户端，用于主进程中的同步请求。

---

### 2.12 类型定义 (types/)

| 文件 | 说明 |
|------|------|
| `api.ts` | API 相关类型 |
| `database.ts` | 数据库相关类型 |
| `ipc.ts` | IPC 类型定义 |
| `story.ts` | 故事相关类型 |
| `sharp.d.ts` | Sharp 类型声明 |
| `sql-modules.d.ts` | SQL 模块类型声明 |

#### `types/ipc.ts`

```typescript
export type IpcArgs = unknown[];
export type IpcResult = unknown;
export interface IpcInvoker {
  (...args: IpcArgs): Promise<IpcResult>;
}
export interface MenuEventCallback {
  (...args: IpcArgs): void;
}
```

---

### 2.13 开发入口 (main-dev.ts)

开发模式入口文件，使用 Vite 开发服务器和 DevTools。

```typescript
// 无显式导出，为开发模式应用启动入口
// 使用 LifecycleManager 管理窗口生命周期
// 开启 DevTools: openDevTools: true
// 使用 DEV_SERVER_PORT 和 API_SERVER_PORT
```

---

### 2.14 插件系统扩展 (plugins/)

#### `plugins/index.ts` — 插件系统统一导出

```typescript
// 类型导出
export type { AIProviderPlugin, AsyncAIProviderPlugin, ImageSizeOption, ModelCapabilities, ProviderCapabilities, VideoCapabilities, ImageCapabilities, ImageTransportMode, ImagePurpose, VideoBuildContext, ImageBuildContext, TextBuildContext, VisionBuildContext, VideoRequestResult, ImageRequestResult, TextRequestResult, VisionRequestResult, CloudProviderInfo, MatchPattern } from "./types"

// 核心导出
export { BaseAIProviderPlugin } from "./base-provider"
export { pluginRegistry, USER_PLUGINS_DIR, CODE_PLUGINS_DIR } from "./registry"

// 内置插件导出
export { VolcenginePlugin, KuaishouPlugin, ZhipuPlugin, PixversePlugin, SeedancePlugin, GooglePlugin, OpenAISoraPlugin, OpenAICompatiblePlugin, MiniMaxPlugin, AnthropicPlugin, PikaPlugin, LumaPlugin, RunwayPlugin } from "./providers"

// 工具函数导出
export { ensureAccessibleUrl, resolveLocalUrlToBase64, downloadAsBase64, stripDataUriPrefix, urlToPureBase64 } from "./utils"

// 用户插件导出
export type { UserPluginConfig } from "./user-plugin-schema"
export { validatePluginConfig, PLUGIN_CONFIG_SCHEMA_VERSION } from "./user-plugin-schema"
export { loadUserPlugins, saveUserPlugin, deleteUserPlugin, listUserPluginFiles } from "./user-plugin-loader"

// 代码插件导出
export type { CodePluginExport } from "./code-plugin-loader"
export { scanCodePluginFile, listCodePluginFiles } from "./code-plugin-loader"
export { CodePluginAdapter } from "./code-plugin-adapter"
export { PluginProcessManager, shutdownAllProcessManagers, getAllProcessMetrics } from "./plugin-process-manager"
export type { PluginLoadResult, ProcessMetrics } from "./plugin-process-manager"

// 自动注册所有内置插件
async function registerAllPlugins(): Promise<void>
```

---

#### `plugins/code-plugin-loader.ts` — 代码插件加载器

代码插件扫描、验证和加载功能。

```typescript
export const CODE_PLUGINS_DIR: string

export interface CodePluginExport {
  id: string;
  displayName: string;
  matchPatterns?: Array<{ urlPattern: string; modelPattern?: string }>;
  apiKeyDetection?: { rules: Array<{ pattern: string; confidence: "high" | "medium" | "low" }>; suggestedName?: string; baseUrl?: string };
  match: (apiUrl: string, model?: string) => boolean;
  capabilities?: { video: boolean; image: boolean; text: boolean; vision: boolean; nativeCharacterRef?: boolean; nativeSceneRef?: boolean };
  videoCapabilities: { supportsLastFrame: boolean; supportsReferenceVideo: boolean; supportsMimicryLevel: boolean; defaultModel: string; maxDuration: number; characterRefMode?: string; sceneRefMode?: string; characterRefField?: string; sceneRefField?: string; imageUploadMode?: string; maxCharacterRefs?: number };
  imageCapabilities: { supportsReferenceImage: boolean; defaultModel: string };
  getModelCapabilities: (modelId: string) => { maxReferences: number; maxResolution: number; maxSizeMB: number; supportsLastFrame: boolean; referenceMode: "separate" | "merged"; defaultImageSize?: string; supportedImageSizes?: Array<{ width: number; height: number; label: string; aspectRatio: string }> };
  buildVideoRequest: (ctx: { prompt: string; model?: string; firstFrameUrl?: string; lastFrameUrl?: string; referenceVideoUrl?: string; referenceVideoMimicryLevel?: string; duration: number; characterRef?: string; sceneRef?: string }) => { body: Record<string, unknown>; endpoint: string; extraHeaders?: Record<string, string>; method?: "POST" | "GET" };
  buildImageRequest: (ctx: { prompt: string; model?: string; size: string; referenceImages: string[]; characterRef?: string; sceneRef?: string }) => { body: Record<string, unknown>; endpoint: string };
  extractTaskId: (data: Record<string, unknown>) => string | undefined;
  extractVideoUrl: (data: Record<string, unknown>) => string | undefined;
  extractImageUrl: (data: Record<string, unknown>) => string | undefined;
  getAuthHeaders: (apiKey: string, endpoint?: string) => Record<string, string>;
  getModelParameterProfile: (modelId: string) => { modelId: string; displayName?: string; capabilities: ReturnType<NonNullable<CodePluginExport["getModelCapabilities"]>>; parameters: { durations?: Array<{ value: number; label: string }>; resolutions?: Array<{ value: string; label: string; width: number; height: number }>; styles?: Array<{ value: string; label: string; description?: string }>; negativePrompt?: boolean; seed?: boolean; cfgScale?: { min: number; max: number; default: number; step: number }; lora?: boolean } };
  getVideoStatusEndpoint?: (baseUrl: string, taskId: string, model?: string) => string;
  buildTextRequest?: (ctx: { prompt: string; model?: string; maxTokens: number; temperature: number }) => { body: Record<string, unknown>; endpoint: string };
  buildVisionRequest?: (ctx: { prompt: string; model?: string; imageUrl: string; maxTokens?: number }) => { body: Record<string, unknown>; endpoint: string };
  extractTextContent?: (response: Record<string, unknown>) => string;
  extractStatus?: (response: Record<string, unknown>) => { status: string; progress?: number; message?: string };
  getStatusMethod?: () => "GET" | "POST";
  getAvailableModels?: () => string[];
  getCloudInfo?: (baseUrl: string) => { name: string; websiteUrl: string; taskUrlPattern: (taskId: string) => string; queryEndpoint: (baseUrl: string, taskId: string) => string; apiDocUrl: string; howToCheck: string } | undefined;
  preferLocalData?: boolean;
  getImageTransportMode?: (purpose: string) => "base64" | "url" | "upload";
  appendAuthToUrl?: (url: string, apiKey: string) => string;
}

export function validateCodePluginExport(obj: unknown): { valid: boolean; errors: string[]; export?: CodePluginExport }
export function scanCodePluginFile(filePath: string): { valid: boolean; errors: string[]; id?: string; displayName?: string; matchPatterns?: Array<{ urlPattern: string; modelPattern?: string }> }
export function listCodePluginFiles(): string[]
```

---

#### `plugins/user-plugin-loader.ts` — 用户声明式插件加载器

```typescript
export const USER_PLUGINS_DIR: string

export function loadUserPlugins(): AIProviderPlugin[]
export function saveUserPlugin(config: UserPluginConfig): { success: boolean; error?: string; filePath?: string }
export function deleteUserPlugin(pluginId: string): { success: boolean; error?: string }
export function listUserPluginFiles(): Array<{ id: string; fileName: string; filePath: string; displayName: string; version: string; valid: boolean; errors: string[] }>
export { UserPluginAdapter } from "./user-plugin-adapter"
```

---

#### `plugins/user-plugin-adapter.ts` — 用户声明式插件适配器

将 JSON 配置文件适配为 `AIProviderPlugin` 接口。

```typescript
export class UserPluginAdapter extends BaseAIProviderPlugin {
  readonly config: UserPluginConfig;
  constructor(config: UserPluginConfig);
  get id(): string;
  get displayName(): string;
  match(apiUrl: string, model?: string): boolean;
  get videoCapabilities(): VideoCapabilities;
  get imageCapabilities(): ImageCapabilities;
  get capabilities(): ProviderCapabilities;
  getModelCapabilities(modelId: string): ModelCapabilities;
  buildVideoRequest(ctx: VideoBuildContext): VideoRequestResult;
  buildImageRequest(ctx: ImageBuildContext): ImageRequestResult;
  extractTaskId(data: Record<string, unknown>): string | undefined;
  extractVideoUrl(data: Record<string, unknown>): string | undefined;
  extractImageUrl(data: Record<string, unknown>): string | undefined;
  getVideoStatusEndpoint(baseUrl: string, taskId: string, model?: string): string;
  buildTextRequest(ctx: TextBuildContext): TextRequestResult;
  buildVisionRequest(ctx: VisionBuildContext): VisionRequestResult;
  getImageTransportMode(): ImageTransportMode;
  async prepareImage(url: string, purpose: ImagePurpose, apiConfig: { apiKey: string; apiUrl: string }): Promise<string | undefined>;
  getAuthHeaders(apiKey: string, endpoint?: string): Record<string, string>;
  getRequestHeaders(endpoint?: string): Record<string, string>;
  extractError(response: Record<string, unknown>): { message?: string; code?: string } | undefined;
  getPollingConfig(): { intervalSeconds: number; maxAttempts: number; backoffMultiplier: number };
  getCloudInfo(baseUrl: string): CloudProviderInfo | undefined;
  getModelParameterProfile(modelId: string): ModelParameterProfile;
  getAvailableModels(): string[];
  getApiKeyDetection(): ApiKeyDetection | undefined;
}
```

---

#### `plugins/user-plugin-schema.ts` — 用户插件配置 Schema

```typescript
export interface ApiKeyDetectionRuleConfig {
  pattern: string;
  confidence: "high" | "medium" | "low";
}

export interface ApiKeyDetectionConfig {
  rules: ApiKeyDetectionRuleConfig[];
  suggestedName: string;
  baseUrl?: string;
}

export interface UserPluginConfig {
  id: string;
  version: string;
  displayName: string;
  description?: string;
  author?: string;
  homepage?: string;
  apiKeyDetection?: ApiKeyDetectionConfig;
  match: { mode?: "contains" | "prefix" | "regex"; apiUrlPatterns: string[]; modelPatterns?: string[]; priority?: number };
  capabilities: { video?: { supportsLastFrame: boolean; supportsReferenceVideo: boolean; supportsMimicryLevel: boolean; supportsCharacterRef?: boolean; supportsSceneRef?: boolean; characterRefMode?: string; sceneRefMode?: string; characterRefField?: string; sceneRefField?: string; imageUploadMode?: string; maxCharacterRefs?: number; defaultModel: string; maxDuration: number }; image?: { supportsReferenceImage: boolean; supportsCharacterRef?: boolean; supportsSceneRef?: boolean; defaultModel: string }; text?: boolean; vision?: boolean };
  models?: Record<string, { maxReferences?: number; maxResolution?: number; maxSizeMB?: number; supportsLastFrame?: boolean; referenceMode?: "separate" | "merged"; defaultImageSize?: string; supportedImageSizes?: Array<{ width: number; height: number; label: string; aspectRatio: string }>; parameters?: { durations?: Array<{ value: number; label: string }>; resolutions?: Array<{ value: string; label: string; width: number; height: number }>; styles?: Array<{ value: string; label: string; description?: string }>; negativePrompt?: boolean; seed?: boolean; cfgScale?: { min: number; max: number; default: number; step: number }; lora?: boolean }; displayName?: string }>;
  transport: { imageMode: "base64" | "url" | "upload"; videoMode: "base64" | "url"; preferLocalData?: boolean };
  auth: { type: "bearer" | "api-key-header" | "api-key-query" | "custom"; headerName?: string; queryParamName?: string; customHeaders?: Record<string, string> };
  headers?: Record<string, string>;
  endpoints: { video?: { generate: string; status: string; method?: "POST"; auth?: { type: string; headerName?: string; queryParamName?: string; customHeaders?: Record<string, string> }; headers?: Record<string, string> }; image?: { generate: string; method?: "POST"; auth?: { type: string; headerName?: string; queryParamName?: string; customHeaders?: Record<string, string> }; headers?: Record<string, string> }; text?: { generate: string; method?: "POST"; auth?: { type: string; headerName?: string; queryParamName?: string; customHeaders?: Record<string, string> }; headers?: Record<string, string> }; vision?: { generate: string; method?: "POST"; auth?: { type: string; headerName?: string; queryParamName?: string; customHeaders?: Record<string, string> }; headers?: Record<string, string> }; upload?: { endpoint: string; method?: "POST"; responseImagePath?: string } };
  request: { video?: { bodyFormat: "openai-content" | "flat" | "dashscope" | "custom"; promptField?: string; modelField?: string; durationField?: string; firstFrameField?: string; lastFrameField?: string; characterRefField?: string; sceneRefField?: string; referenceVideoField?: string; mimicryLevelField?: string; extraFields?: Record<string, unknown>; customBodyTemplate?: Record<string, unknown> }; image?: { bodyFormat: "openai" | "flat" | "custom"; promptField?: string; modelField?: string; sizeField?: string; referenceImageField?: string; characterRefField?: string; sceneRefField?: string; extraFields?: Record<string, unknown>; customBodyTemplate?: Record<string, unknown> }; text?: { bodyFormat: "openai" | "anthropic" | "custom"; promptField?: string; modelField?: string; maxTokensField?: string; temperatureField?: string; extraFields?: Record<string, unknown>; customBodyTemplate?: Record<string, unknown> }; vision?: { bodyFormat: "openai" | "anthropic" | "custom"; promptField?: string; modelField?: string; imageUrlField?: string; extraFields?: Record<string, unknown>; customBodyTemplate?: Record<string, unknown> } };
  response: { video?: { taskIdPath?: string; videoUrlPath?: string; statusPath?: string; statusMapping?: Record<string, string>; errorPath?: string; errorCodePath?: string }; image?: { imageUrlPath?: string; base64Path?: string; errorPath?: string; errorCodePath?: string }; text?: { contentPath?: string } };
  polling?: { intervalSeconds?: number; maxAttempts?: number; backoffMultiplier?: number };
  cloudInfo?: { name: string; websiteUrl?: string; taskUrlPattern?: string; apiDocUrl?: string; howToCheck?: string };
  availableModels?: Array<{ id: string; displayName: string; type: "video" | "image" | "text" }>;
}

export const PLUGIN_CONFIG_SCHEMA_VERSION: "1.3.0"
export function validatePluginConfig(config: unknown): { valid: boolean; errors: string[] }
```

---

#### `plugins/code-plugin-adapter.ts` — 代码插件适配器

将代码插件进程桥接为 `AsyncAIProviderPlugin` 接口，所有请求通过 IPC 转发到子进程。

```typescript
export class CodePluginAdapter extends BaseAIProviderPlugin implements AsyncAIProviderPlugin {
  constructor(processManager: PluginProcessManager, metadata: CachedMetadata);
  get id(): string;
  get displayName(): string;
  get matchPatterns(): MatchPattern[] | undefined;
  match(apiUrl: string, model?: string): boolean;
  get videoCapabilities(): VideoCapabilities;
  get imageCapabilities(): ImageCapabilities;
  get capabilities(): ProviderCapabilities;
  getModelCapabilities(modelId: string): ModelCapabilities;
  getAvailableModels(): string[];
  getApiKeyDetection(): ApiKeyDetection | undefined;
  get preferLocalData(): boolean | undefined;
  async buildVideoRequestAsync(ctx: VideoBuildContext): Promise<VideoRequestResult>;
  async buildImageRequestAsync(ctx: ImageBuildContext): Promise<ImageRequestResult>;
  async buildTextRequestAsync(ctx: TextBuildContext): Promise<TextRequestResult>;
  async buildVisionRequestAsync(ctx: VisionBuildContext): Promise<VisionRequestResult>;
  async getAuthHeadersAsync(apiKey: string, endpoint?: string): Promise<Record<string, string>>;
  async extractTaskIdAsync(response: Record<string, unknown>): Promise<string | undefined>;
  async extractVideoUrlAsync(response: Record<string, unknown>): Promise<string | undefined>;
  async extractImageUrlAsync(response: Record<string, unknown>): Promise<string | undefined>;
  async extractStatusAsync(response: Record<string, unknown>): Promise<{ status: string; progress?: number; message?: string }>;
  async extractTextContentAsync(response: Record<string, unknown>): Promise<string>;
  async getVideoStatusEndpointAsync(baseUrl: string, taskId: string, model?: string): Promise<string>;
  async getModelCapabilitiesAsync(modelId: string): Promise<ModelCapabilities>;
  async getModelParameterProfileAsync(modelId: string): Promise<ModelParameterProfile>;
  async getAvailableModelsAsync(): Promise<string[]>;
  async getApiKeyDetectionAsync(): Promise<ApiKeyDetection | undefined>;
  async getCloudInfoAsync(baseUrl: string): Promise<CloudProviderInfo | undefined>;
  async shutdownProcess(): Promise<void>;
}
```

---

#### `plugins/plugin-worker.ts` — 代码插件子进程 Worker

在子进程中安全加载和执行代码插件，使用 VM 沙箱隔离。

```typescript
// 无显式导出，为子进程入口
// 消息协议：
// 接收: { type: "load" | "call" | "ping" | "shutdown" | "setConfig"; id: string; filePath?: string; method?: string; args?: unknown[]; config?: { apiKey?: string; apiUrl?: string } }
// 响应: { type: "loaded" | "result" | "error" | "log" | "pong"; id: string; pluginId?: string; pluginDisplayName?: string; metadata?: PluginMetadata; value?: unknown; message?: string; level?: string }
// 安全措施：禁止逃逸模式检测、原型冻结、心跳超时自动退出
```

---

#### `plugins/plugin-process-manager.ts` — 插件进程管理器

管理代码插件子进程的生命周期、IPC 通信和健康检查。

```typescript
export interface PluginLoadResult {
  pluginId: string;
  pluginDisplayName: string;
  metadata: Record<string, unknown>;
}

export interface ProcessMetrics {
  pluginId: string | null;
  alive: boolean;
  ready: boolean;
  totalCalls: number;
  failedCalls: number;
  timedOutCalls: number;
  avgCallDurationMs: number;
  lastCallAt: number | null;
  crashCount: number;
  uptimeMs: number;
  pid: number | undefined;
}

export class PluginProcessManager {
  get id(): string | null;
  get displayName(): string | null;
  get alive(): boolean;
  setOnProcessDeath(cb: (manager: PluginProcessManager) => void): void;
  async restart(): Promise<PluginLoadResult>;
  getMetrics(): ProcessMetrics;
  async load(filePath: string): Promise<PluginLoadResult>;
  async call<T = unknown>(method: string, args: unknown[]): Promise<T>;
  async healthCheck(): Promise<boolean>;
  async setConfig(config: { apiKey?: string; apiUrl?: string }): Promise<void>;
  async shutdown(): Promise<void>;
}

export function getProcessManager(pluginId: string): PluginProcessManager | undefined
export function registerProcessManager(pluginId: string, manager: PluginProcessManager): void
export function unregisterProcessManager(pluginId: string): void
export async function shutdownAllProcessManagers(): Promise<void>
export function getAllProcessManagers(): Map<string, PluginProcessManager>
export function getAllProcessMetrics(): ProcessMetrics[]
```

---

#### `plugins/utils.ts` — 插件工具函数

```typescript
export const VIDEO_CACHE_DIR: string
export const ASSETS_BASE_DIR: string
export const UPLOAD_DIR: string

export function resolveLocalUrlToBase64(url: string): Promise<string | null>
export async function ensureAccessibleUrl(url: string | undefined | null): Promise<string | undefined>
export function downloadAsBase64(url: string): Promise<string>
export function stripDataUriPrefix(dataUri: string): string
export async function urlToPureBase64(url: string): Promise<string>
```

---

#### `plugins/providers/index.ts` — 内置提供商统一导出

```typescript
export { VolcenginePlugin } from "./volcengine"
export { KuaishouPlugin } from "./kuaishou"
export { ZhipuPlugin } from "./zhipu"
export { PixversePlugin } from "./pixverse"
export { SeedancePlugin } from "./seedance"
export { GooglePlugin } from "./google"
export { OpenAISoraPlugin } from "./openai-sora"
export { OpenAICompatiblePlugin } from "./openai-compatible"
export { MiniMaxPlugin } from "./minimax"
export { AnthropicPlugin } from "./anthropic"
export { PikaPlugin } from "./pika"
export { LumaPlugin } from "./luma"
export { RunwayPlugin } from "./runway"
```

---

### 2.15 数据库接口 (db-interface.ts)

数据库抽象层，支持 BetterSqlite3 实现。

```typescript
export class DatabaseInterface {
  db: unknown;
  type: string | null;
  filePath?: string;
  init(_options?: DbOptions): this | Promise<this>;
  exec(_sql: string): void;
  prepare(_sql: string): Statement;
  transaction(_fn: () => unknown): unknown;
  close(): void;
  pragma(_name: string, _value?: unknown): unknown;
  checkpoint(): void;
  backup(_destination: string): unknown;
  isOpen(): boolean;
}

export class BetterSqlite3Database extends DatabaseInterface {
  declare db: import("better-sqlite3").Database | null;
  override init(options?: DbOptions): this;
  override exec(sql: string): void;
  override prepare(sql: string): BetterSqlite3Statement;
  override transaction(fn: () => unknown): unknown;
  override close(): void;
  override pragma(name: string, value?: unknown): unknown;
  backup(destination: string): unknown;
  checkpoint(): unknown;
}

export class BetterSqlite3Statement implements Statement {
  run(...params: QueryParams): RunResult;
  get(...params: QueryParams): DatabaseResult | undefined;
  all(...params: QueryParams): DatabaseResult[];
}

export function createDatabase(_type: string, _options?: DbOptions): DatabaseInterface
export function createOptimalDatabase(_options?: DbOptions): DatabaseInterface
```

---

### 2.16 协议注册 (protocol.ts)

自定义协议注册，处理 `app://`、`file://` 和 `vcache://` 协议。

```typescript
export function registerAppProtocol(): void
```

**注册的协议**：
- `app://` — 应用资源协议，映射到 dist 目录
- `file://` — 文件协议拦截，路径遍历防护
- `vcache://` — 视频缓存协议，映射到 VIDEO_CACHE_DIR

**安全措施**：所有协议均检测路径遍历攻击（`..`），返回错误码 -6。

---

### 2.17 应用菜单 (menu.ts)

```typescript
export function createMenu(sendToRenderer: (channel: string) => void): void
```

**菜单结构**：
- 文件：新建角色 (CmdOrCtrl+N)、新建场景 (CmdOrCtrl+Shift+N)、导出数据 (CmdOrCtrl+E)、退出
- 编辑：撤销、重做、剪切、复制、粘贴、全选
- 视图：刷新、强制刷新、开发者工具、缩放、全屏
- 窗口：最小化、关闭

---

### 2.18 安全模块统一导出 (security/index.ts)

```typescript
export { keyStorage, KeyStorageManager } from "./key-storage/key-storage"
export type { KeyStorageStrategy, StorageResult, MigrationResult, EncryptedDataPacket, KeyStorageConfig } from "./key-storage/types"
export { ssrfGuard, SsrfGuard } from "./ssrf-guard/ssrf-guard"
export type { SsrfValidationResult, SsrfGuardConfig } from "./ssrf-guard/ssrf-guard"
```

---

#### key-storage/strategies/safe-storage.strategy.ts

Electron safeStorage 加密策略（最高优先级），利用操作系统级安全机制。

```typescript
export class SafeStorageStrategy implements KeyStorageStrategy {
  readonly name = "safe-storage";
  readonly priority = 10;
  isAvailable(): boolean;
  save(key: string, value: string): Promise<StorageResult>;
  load(key: string): Promise<StorageResult<string | null>>;
  delete(key: string): Promise<StorageResult>;
  list(): Promise<StorageResult<string[]>>;
  clear(): Promise<StorageResult>;
}
```

**加密方式**：Windows DPAPI / macOS Keychain / Linux libsecret

---

#### key-storage/strategies/plaintext-fallback.strategy.ts

明文回退策略（最低优先级），使用 AES-256-GCM 加密存储到本地文件。

```typescript
export class PlaintextFallbackStrategy implements KeyStorageStrategy {
  readonly name = "plaintext-fallback";
  readonly priority = 99;
  isAvailable(): boolean;
  save(key: string, value: string): Promise<StorageResult>;
  load(key: string): Promise<StorageResult<string | null>>;
  delete(key: string): Promise<StorageResult>;
  list(): Promise<StorageResult<string[]>>;
  clear(): Promise<StorageResult>;
}
```

**注意**：masterKey 从机器特征派生，仅作为开发/测试环境的回退方案。

---

## 3. 根级源文件 (src/)

### 3.1 router.tsx

应用路由配置，使用 React Router + lazy loading。

```typescript
/** 页面加载占位组件 */
function PageLoader(): JSX.Element

/** 懒加载包裹器 */
function withSuspense(Component: React.LazyExoticComponent<React.ComponentType>): JSX.Element

/** 应用路由器 */
export const router: ReturnType<typeof createBrowserRouter>
```

**路由表**：
| 路径 | 组件 |
|------|------|
| `/` | Home |
| `/story` | StoryPage |
| `/story/beat/:beatId` | BeatDetailPage |
| `/characters` | CharactersPage |
| `/scenes` | ScenesPage |
| `/asset-library` | AssetLibraryPage |
| `/quick-generate` | QuickGeneratePage |
| `/settings` | SettingsPage |
| `/video-tasks` | VideoTasksPage |
| `*` | NotFound |

---

### 3.2 presentation/providers/query-provider.tsx

React Query 全局提供器。

```typescript
export function QueryProvider({ children }: { children: ReactNode }): JSX.Element
```

**默认配置**：staleTime 5min, gcTime 10min, retry 1, refetchOnWindowFocus false
