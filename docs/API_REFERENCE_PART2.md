# API 参考手册 — 第二部分：模块层

> 本文档详细列出所有 9 个模块的公共导出及其 TypeScript 签名。
> 模块间引用请使用桶导出路径 `@/modules/xxx`，禁止使用深层路径 `@/modules/xxx/hooks/yyy`。

---

## 1. asset 模块

> 资产管理模块，负责媒体资产、角色/场景资产库、导入导出等功能。

### 1.1 服务

#### `mediaAssetService`

```typescript
const mediaAssetService: {
  getAll(): Promise<MediaAsset[]>;
  getById(id: string): Promise<MediaAsset | undefined>;
  create(asset: Omit<MediaAsset, "id" | "createdAt" | "updatedAt">): Promise<MediaAsset>;
  update(id: string, updates: Partial<MediaAsset>): Promise<void>;
  remove(id: string): Promise<void>;
  batchRemove(ids: string[]): Promise<void>;
};
```

#### `characterService`（asset-library）

```typescript
const characterService: {
  getAll(): Promise<Character[]>;
  getById(id: string): Promise<Character | undefined>;
  create(character: Omit<Character, "id" | "createdAt"> & { id?: string }): Promise<Character>;
  update(id: string, updates: Partial<Character>): Promise<void>;
  remove(id: string): Promise<void>;
  batchRemove(ids: string[]): Promise<void>;
};
```

#### `sceneService`（asset-library）

```typescript
const sceneService: {
  getAll(): Promise<Scene[]>;
  getById(id: string): Promise<Scene | undefined>;
  create(scene: Omit<Scene, "id" | "createdAt"> & { id?: string }): Promise<Scene>;
  update(id: string, updates: Partial<Scene>): Promise<void>;
  remove(id: string): Promise<void>;
};
```

#### `storyboardAssetService`

```typescript
const storyboardAssetService: {
  getAll(): Promise<StoryboardAsset[]>;
  getById(id: string): Promise<StoryboardAsset | undefined>;
  create(asset: Omit<StoryboardAsset, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<StoryboardAsset>;
  remove(id: string): Promise<void>;
};
```

#### `collectionService`

```typescript
const collectionService: {
  getAll(): Promise<Collection[]>;
  create(name: string): Promise<Collection>;
  remove(id: string): Promise<void>;
  addAsset(collectionId: string, assetType: string, assetId: string): Promise<void>;
  removeAsset(collectionId: string, assetType: string, assetId: string): Promise<void>;
};
```

#### `assetExportService`

```typescript
interface AssetExportService {
  exportCharacters(characterIds: string[]): Promise<Result<Uint8Array>>;
  exportScenes(sceneIds: string[]): Promise<Result<Uint8Array>>;
  exportStoryboards(storyboardIds: string[]): Promise<Result<Uint8Array>>;
  exportCollections(collectionIds: string[]): Promise<Result<Uint8Array>>;
  importFromFile(file: File, importMode?: string): Promise<Result<ImportResult>>;
}

interface ImportResult {
  imported: number;
  errors: string[];
}

const assetExportService: AssetExportService;
```

### 1.2 类型

#### `MergeStrategy`

```typescript
type MergeStrategy = "replace" | "merge" | "skip";
```

#### `ProjectData`

```typescript
interface ProjectData {
  characters: Character[];
  scenes: Scene[];
  stories: Story[];
  exportedAt?: string;
}
```

#### `ExportResult`

```typescript
interface ExportResult {
  success: boolean;
  filename?: string;
  error?: string;
}
```

### 1.3 Hooks

#### `useMediaAssets`

```typescript
function useMediaAssets(): UseQueryResult<MediaAsset[]>;
```

#### `useCreateMediaAsset`

```typescript
function useCreateMediaAsset(): UseMutationResult<
  MediaAsset,
  Error,
  Omit<MediaAsset, "id" | "createdAt" | "updatedAt">
>;
```

#### `useDeleteMediaAsset`

```typescript
function useDeleteMediaAsset(): UseMutationResult<void, Error, string>;
```

#### `useExportData`

```typescript
function useExportData(): UseMutationResult<Result<void>, Error, void>;
```

#### `useDownloadExport`

```typescript
function useDownloadExport(): UseMutationResult<Result<void>, Error, void>;
```

#### `useImportData`

```typescript
function useImportData(): UseMutationResult<
  Result<ImportResult>,
  Error,
  { data: unknown; mergeStrategy?: MergeStrategy }
>;
```

#### `useImportFromFile`

```typescript
function useImportFromFile(): UseMutationResult<Result<ImportResult>, Error, File>;
```

#### `useProjectExport`

```typescript
function useProjectExport(): {
  exportProject: (options: { includeAssets?: boolean }) => Promise<ExportResult>;
  importProject: (file: File) => Promise<{
    success: boolean;
    data?: ProjectData;
    error?: string;
    blobUrls: string[];
  }>;
  isExporting: boolean;
  progress: number;
};
```

### 1.4 组件

#### `BatchOperations`

```typescript
function BatchOperations(props: React.ComponentProps<typeof BatchOperations>): JSX.Element;
```

#### `MediaExporter`

```typescript
function MediaExporter(props: React.ComponentProps<typeof MediaExporter>): JSX.Element;
```

#### `ProjectExportImport`

```typescript
function ProjectExportImport(props: React.ComponentProps<typeof ProjectExportImport>): JSX.Element;
```

### asset — 内部实现补充

#### asset-library/asa-export-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `exportAsaPackage` | 函数 | `(storyId: string, options?: { includeAssets?: boolean; includeCharacters?: boolean; includeScenes?: boolean }) => Promise<Result<string>>` | 导出 ASA 格式的故事包 |
| `importAsaPackage` | 函数 | `(filePath: string) => Promise<Result<Story>>` | 导入 ASA 格式的故事包 |
| `validateAsaPackage` | 函数 | `(filePath: string) => Promise<Result<boolean>>` | 验证 ASA 包格式是否有效 |

#### hooks/use-import-export.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useImportExport` | Hook | `() => { isImporting: boolean; isExporting: boolean; importProject: (filePath: string) => Promise<Result<void>>; exportProject: (options?: ExportOptions) => Promise<Result<string>> }` | 项目导入导出 Hook |

#### hooks/use-media-assets.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useMediaAssets` | Hook | `(options?: { type?: string; storyId?: string }) => { assets: MediaAsset[]; isLoading: boolean; error: string \| null; refetch: () => void }` | 媒体资源查询 Hook |

#### hooks/use-project-export.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useProjectExport` | Hook | `() => { isExporting: boolean; exportProgress: number; exportProject: (options?: ExportOptions) => Promise<Result<string>>; cancelExport: () => void }` | 项目导出 Hook（带进度） |

#### presentation/BatchProgressDialog.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BatchProgressDialog` | 组件 | `(props: { open: boolean; onOpenChange: (open: boolean) => void; total: number; completed: number; currentFile?: string }) => JSX.Element` | 批量操作进度对话框 |

#### presentation/VariantGenerator.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `VariantGenerator` | 组件 | `(props: { assetId: string; assetType: string; onVariantGenerated: (variant: MediaAsset) => void; onClose: () => void }) => JSX.Element` | 变体生成器组件 |

---

## 2. character 模块

> 角色管理模块，提供角色 CRUD、图片生成/分析、服装管理等功能。

### 2.1 服务

#### `characterService`

```typescript
const characterService: {
  getAll(): Promise<Result<Character[]>>;
  getById(id: string): Promise<Result<Character>>;
  create(input: CreateCharacterInput): Promise<Result<Character>>;
  update(id: string, input: UpdateCharacterInput): Promise<Result<void>>;
  delete(id: string): Promise<Result<void>>;
  count(): Promise<Result<number>>;
};
```

### 2.2 常量

#### `defaultCharacter`

```typescript
const defaultCharacter: Character;
// 默认空角色对象，所有字段为空值
```

#### `personalitySuggestions`

```typescript
const personalitySuggestions: string[];
// 性格建议列表，如 "开朗"、"内向"、"勇敢" 等
```

#### `styleSuggestions`

```typescript
const styleSuggestions: string[];
// 风格建议列表，如 "日式动漫"、"写实风格"、"赛博朋克" 等
```

#### `genderSuggestions`

```typescript
const genderSuggestions: string[];
// 性别建议列表：["男性", "女性", "中性", "无性别", "双性", "其他"]
```

#### `heightSuggestions`

```typescript
const heightSuggestions: string[];
// 身高建议列表：["很矮", "较矮", "平均", "较高", "很高", "巨人", "侏儒"]
```

#### `buildSuggestions`

```typescript
const buildSuggestions: string[];
// 体型建议列表：["瘦弱", "苗条", "平均", "健美", "魁梧", "肥胖", "精瘦", "丰满"]
```

### 2.3 Hooks

#### `useCharacterImage`

```typescript
interface UseCharacterImageProps {
  currentCharacter: Character;
  currentCharacterRef: React.MutableRefObject<Character>;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  addAssetToLibrary: (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

function useCharacterImage(props: UseCharacterImageProps): {
  isGenerating: boolean;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  generatedImage: string | null;
  setGeneratedImage: React.Dispatch<React.SetStateAction<string | null>>;
  isUploading: boolean;
  isAnalyzing: boolean;
  useDetailedPrompt: boolean;
  setUseDetailedPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  imageSize: string;
  setImageSize: React.Dispatch<React.SetStateAction<string>>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  analyzeFileInputRef: React.RefObject<HTMLInputElement>;
  selectedImageModel: ModelSelection | null;
  setSelectedImageModel: (selection: ModelSelection | null) => void;
  generatePrompt: (char: Character) => string;
  generateImage: () => Promise<void>;
  saveImageToCharacter: () => Promise<void>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleAnalyzeFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  clearImage: () => void;
};
```

#### `useOutfitManagement`

```typescript
interface UseOutfitManagementProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  addAssetToLibrary: (
    url: string,
    type: "image" | "video",
    name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

function useOutfitManagement(props: UseOutfitManagementProps): {
  showOutfitDialog: boolean;
  setShowOutfitDialog: React.Dispatch<React.SetStateAction<boolean>>;
  editingOutfit: CharacterOutfit | null;
  setEditingOutfit: React.Dispatch<React.SetStateAction<CharacterOutfit | null>>;
  outfitForm: Partial<CharacterOutfit>;
  setOutfitForm: React.Dispatch<React.SetStateAction<Partial<CharacterOutfit>>>;
  customAccessory: string;
  setCustomAccessory: React.Dispatch<React.SetStateAction<string>>;
  handleAddOutfit: () => void;
  handleDeleteOutfit: (outfitId: string) => void;
  handleSetDefaultOutfit: (outfitId: string) => void;
  handleEditOutfit: (outfit: CharacterOutfit) => void;
  handleGenerateOutfitImage: (outfit: CharacterOutfit) => Promise<void>;
  handleBatchSynthesizeOutfits: () => Promise<void>;
  addAccessory: () => void;
  removeAccessory: (accessory: string) => void;
};
```

#### `useCharacters`

```typescript
function useCharacters(): UseQueryResult<Character[]>;
```

#### `useCharacter`

```typescript
function useCharacter(id: string): UseQueryResult<Character>;
```

#### `useCharacterCount`

```typescript
function useCharacterCount(): UseQueryResult<number>;
```

#### `useCreateCharacter`

```typescript
function useCreateCharacter(): UseMutationResult<Character, Error, CreateCharacterInput>;
```

#### `useUpdateCharacter`

```typescript
function useUpdateCharacter(): UseMutationResult<void, Error, UpdateCharacterInput>;
```

#### `useDeleteCharacter`

```typescript
function useDeleteCharacter(): UseMutationResult<void, Error, string>;
```

#### `useCharacterCRUD`

```typescript
interface UseCharacterCRUDProps {
  currentCharacter: Character;
  setCurrentCharacter: (update: Character | ((prev: Character) => Character), shouldMarkDirty?: boolean) => void;
  generatedImage: string | null;
  setCustomTrait: React.Dispatch<React.SetStateAction<string>>;
  setCustomStyle: React.Dispatch<React.SetStateAction<string>>;
  setGeneratedImage: React.Dispatch<React.SetStateAction<string | null>>;
  addAssetToLibrary: (
    url: string, type: "image" | "video", name: string,
    boundTo?: { type: "character" | "scene"; id: string; name: string },
  ) => void;
  generatePrompt: (char: Character) => string;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  stories: Story[];
  markDirty: (key: string) => void;
  markClean: (key: string) => void;
  onUpdateStoriesAfterDelete: (characterId: string, stories: Story[]) => Promise<void>;
}

function useCharacterCRUD(props: UseCharacterCRUDProps): {
  deleteDialogOpen: boolean;
  setDeleteDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  characterToDelete: Character | null;
  referenceCheck: DeleteCheckResult | null;
  handleSave: () => Promise<void>;
  saveStatus: SaveStatus;
  saveError: string | null;
  handleDelete: (character: Character) => void;
  performDelete: () => Promise<void>;
  isDeleting: boolean;
  addTrait: (trait: string) => void;
  removeTrait: (trait: string) => void;
};
```

### 2.4 组件

#### `CharacterListItem`

```typescript
function CharacterListItem(props: React.ComponentProps<typeof CharacterListItem>): JSX.Element;
```

#### `OutfitDialog`

```typescript
function OutfitDialog(props: React.ComponentProps<typeof OutfitDialog>): JSX.Element;
```

### character — 内部实现补充

#### hooks/use-character-crud.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useCharacterCrud` | Hook | `() => { createCharacter: (data: Omit<Character, "id">) => Promise<Result<Character>>; updateCharacter: (id: string, data: Partial<Character>) => Promise<Result<void>>; deleteCharacter: (id: string) => Promise<Result<void>>; duplicateCharacter: (id: string) => Promise<Result<Character>> }` | 角色 CRUD 操作 Hook |

#### hooks/use-character-image.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useCharacterImage` | Hook | `(characterId: string) => { isGenerating: boolean; generateImage: (prompt: string, options?: GenerateImageOptions) => Promise<Result<string>>; analyzeImage: (imageUrl: string) => Promise<Result<CharacterAnalysis>> }` | 角色图片生成/分析 Hook |

#### hooks/use-characters.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useCharacters` | Hook | `() => { characters: Character[]; isLoading: boolean; error: string | null; refetch: () => void }` | 角色列表查询 Hook |

#### hooks/use-outfit-management.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useOutfitManagement` | Hook | `(characterId: string) => { outfits: Outfit[]; addOutfit: (outfit: Omit<Outfit, "id">) => Promise<Result<Outfit>>; removeOutfit: (outfitId: string) => Promise<Result<void>>; setDefaultOutfit: (outfitId: string) => Promise<Result<void>> }` | 角色服装管理 Hook |

---

## 3. persistence 模块

> 持久化模块，提供自动保存、持久化守卫和事务性删除功能。

### 3.1 Hooks

#### `useAutoSave`

```typescript
interface UseAutoSaveOptions {
  enabled: boolean;
  intervalMinutes: number;
  onSave: () => Promise<void>;
  isDirty?: () => boolean;
}

function useAutoSave(options: UseAutoSaveOptions): {
  triggerSave: () => Promise<void>;
};
```

#### `usePersistenceGuard`

```typescript
function usePersistenceGuard(): {
  guardedSave: (saveFn: () => Promise<void>) => Promise<void>;
};
```

### 3.2 服务

#### `deleteCharacterWithRefs`

```typescript
function deleteCharacterWithRefs(characterId: string): Promise<Result<void>>;
// 事务性删除角色及其关联数据（故事引用、服装、本地文件等）
```

#### `deleteSceneWithRefs`

```typescript
function deleteSceneWithRefs(sceneId: string): Promise<Result<void>>;
// 事务性删除场景及其关联数据（故事引用、beat 引用、本地文件等）
```

### persistence — 内部实现补充

#### hooks/use-auto-save.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useAutoSave` | Hook | `(options: { data: unknown; saveFn: (data: unknown) => Promise<void>; intervalMs?: number; enabled?: boolean }) => { lastSavedAt: Date | null; isSaving: boolean; saveNow: () => Promise<void> }` | 自动保存 Hook |

#### hooks/use-persistence-guard.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `usePersistenceGuard` | Hook | `(options: { hasUnsavedChanges: boolean; onSave: () => Promise<void>; onDiscard?: () => void }) => { isGuardActive: boolean; confirmNavigation: () => Promise<boolean> }` | 持久化守卫 Hook（防止未保存数据丢失） |

#### services/transactional-delete.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `transactionalDelete` | 函数 | `(options: { storyId: string; deleteStoryRefs?: boolean; deleteBeatRefs?: boolean; deleteLocalFiles?: boolean }) => Promise<Result<void>>` | 事务性删除场景及其关联数据 |

---

## 4. prompt 模块

> 提示词模块，提供各类 AI 提示词生成、模型选择、风格配置等功能。

### 4.1 基础提示词词汇（base）

#### `QUALITY_TAGS_IMAGE`

```typescript
const QUALITY_TAGS_IMAGE: string[];
// 图像质量标签列表
```

#### `QUALITY_TAGS_VIDEO`

```typescript
const QUALITY_TAGS_VIDEO: string[];
// 视频质量标签列表
```

#### `STYLE_KEYWORDS`

```typescript
const STYLE_KEYWORDS: Record<string, string>;
// 风格关键词映射
```

#### `SCENE_TYPE_KEYWORDS`

```typescript
const SCENE_TYPE_KEYWORDS: Record<string, string>;
// 场景类型关键词映射
```

#### `MOOD_KEYWORDS`

```typescript
const MOOD_KEYWORDS: Record<string, string>;
// 氛围关键词映射
```

#### `LIGHTING_KEYWORDS`

```typescript
const LIGHTING_KEYWORDS: Record<string, string>;
// 光照关键词映射
```

#### `CAMERA_ANGLE_KEYWORDS`

```typescript
const CAMERA_ANGLE_KEYWORDS: Record<string, string>;
// 镜头角度关键词映射
```

#### `CAMERA_MOVEMENT_KEYWORDS`

```typescript
const CAMERA_MOVEMENT_KEYWORDS: Record<string, string>;
// 镜头运动关键词映射
```

#### `joinParts`

```typescript
function joinParts(parts: (string | undefined | null)[]): string;
// 过滤空值并拼接提示词片段
```

#### `buildCharacterFullDesc`

```typescript
function buildCharacterFullDesc(character: Character): string;
// 构建角色完整描述文本
```

#### `buildSceneAtmosphereDesc`

```typescript
function buildSceneAtmosphereDesc(scene: Scene): string;
// 构建场景氛围描述
```

#### `buildSceneVisualDesc`

```typescript
function buildSceneVisualDesc(scene: Scene): string;
// 构建场景视觉描述
```

### 4.2 角色提示词（character）

#### `generateCharacterImagePrompt`

```typescript
function generateCharacterImagePrompt(char: Character, outfitId?: string): string;
// 生成角色图像提示词，可选指定服装 ID
```

#### `generateCharacterDetailedPromptInstruction`

```typescript
function generateCharacterDetailedPromptInstruction(char: Character): string;
// 生成角色详细提示词指令（用于 AI 扩展）
```

#### `generateSimpleCharacterImagePrompt`

```typescript
function generateSimpleCharacterImagePrompt(char: Character): string;
// 生成简化版角色图像提示词
```

### 4.3 场景提示词（scene）

#### `generateSceneImagePrompt`

```typescript
function generateSceneImagePrompt(scene: Scene): string;
// 生成场景图像提示词
```

#### `generateSimpleSceneImagePrompt`

```typescript
function generateSimpleSceneImagePrompt(scene: Scene): string;
// 生成简化版场景图像提示词
```

#### `generateScenePromptOptimization`

```typescript
function generateScenePromptOptimization(scene: Scene): string;
// 生成场景提示词优化建议
```

### 4.4 分镜图像提示词（beat-image）

#### `generateBeatImagePrompt`

```typescript
function generateBeatImagePrompt(params: BeatImagePromptParams): string;
// 生成分镜图像提示词
```

#### `generateSimpleBeatImagePrompt`

```typescript
function generateSimpleBeatImagePrompt(params: BeatImagePromptParams): string;
// 生成简化版分镜图像提示词
```

### 4.5 视频提示词（video）

#### `generateProfessionalVideoPrompt`

```typescript
function generateProfessionalVideoPrompt(params: ProfessionalVideoPromptParams): string;
// 生成专业视频提示词
```

#### `generateEnhancedVideoPrompt`

```typescript
function generateEnhancedVideoPrompt(params: EnhancedVideoPromptParams): string;
// 生成增强视频提示词
```

#### `generateQuickVideoPrompt`

```typescript
function generateQuickVideoPrompt(params: QuickVideoPromptParams): string;
// 生成快速视频提示词
```

#### `generateSingleBeatPrompt`

```typescript
function generateSingleBeatPrompt(params: SingleBeatPromptParams): string;
// 生成单镜头视频提示词
```

### 4.6 服务端提示词（server-prompts）

#### `generateFirstFramePrompt`

```typescript
function generateFirstFramePrompt(params: FramePairPromptParams): string;
// 生成首帧提示词（用于服务端帧对生成）
```

#### `generateLastFramePrompt`

```typescript
function generateLastFramePrompt(params: FramePairPromptParams): string;
// 生成尾帧提示词
```

#### `generateKeyframePrompt`

```typescript
function generateKeyframePrompt(params: KeyframePromptParams): string;
// 生成预览图提示词
```

#### `generateCharacterAnalysisPrompt`

```typescript
function generateCharacterAnalysisPrompt(imageDescription: string): string;
// 生成角色分析提示词
```

#### `generateSceneAnalysisPrompt`

```typescript
function generateSceneAnalysisPrompt(imageDescription: string): string;
// 生成场景分析提示词
```

### 4.7 提示词构建器（builder）

#### `PromptBuilder`

```typescript
class PromptBuilder {
  buildGlobalElementDefinitions(elements: StoryElement[]): string;
  buildBeatPrompt(beat: StoryBeat, elements: StoryElement[], references: ShotReference[]): string;
  // ... 其他构建方法
}
```

#### `promptBuilder`

```typescript
const promptBuilder: PromptBuilder;
// PromptBuilder 单例
```

#### `generateStoryPlanPrompt`

```typescript
interface StoryPlanParams {
  title: string;
  description: string;
  genre: string;
  tone: string;
  targetDuration: number;
  characters: Character[];
  scenes: Scene[];
}

function generateStoryPlanPrompt(params: StoryPlanParams): string;
// 生成故事规划提示词
```

#### `generateQuickModeVideoPrompt`

```typescript
interface QuickModeParams {
  prompt: string;
  duration: number;
  resolution: string;
  style: string;
  characters?: Character[];
  scene?: Scene;
  referenceImage?: string;
  enableSmartOptimization?: boolean;
  negativePrompt?: string;
}

function generateQuickModeVideoPrompt(params: QuickModeParams): string;
// 生成快速模式视频提示词
```

#### `AVAILABLE_STYLES`

```typescript
const AVAILABLE_STYLES: Record<string, string>;
// 可用风格预设映射
```

#### `getDurationOptions`

```typescript
function getDurationOptions(): Array<{ value: number; label: string }>;
// 获取时长选项列表
```

#### `getResolutionOptions`

```typescript
function getResolutionOptions(): Array<{ value: string; label: string }>;
// 获取分辨率选项列表
```

#### `getDurationOptionsForModel`

```typescript
function getDurationOptionsForModel(modelId: string): Array<{ value: number; label: string }>;
// 根据模型获取时长选项
```

#### `getResolutionOptionsForModel`

```typescript
function getResolutionOptionsForModel(modelId: string): Array<{ value: string; label: string }>;
// 根据模型获取分辨率选项
```

#### `getStyleOptionsForModel`

```typescript
function getStyleOptionsForModel(modelId: string): Array<{ value: string; label: string }>;
// 根据模型获取风格选项
```

### 4.8 组件与 Hooks（presentation）

#### `ModelSelector`

```typescript
interface ModelSelectorProps {
  capability: ApiCapability;
  value?: ModelSelection | null;
  onChange: (selection: ModelSelection | null) => void;
  compact?: boolean;
}

function ModelSelector(props: ModelSelectorProps): JSX.Element;
```

#### `useModelSelection`

```typescript
function useModelSelection(storageKey: string): readonly [
  ModelSelection | null,
  (selection: ModelSelection | null) => void,
];
// 从偏好存储中读取/写入模型选择
```

#### `ModelSelection`

```typescript
type ModelSelection = {
  providerId: string;
  modelId: string;
  providerName?: string;
  modelName?: string;
  format?: string;
};
```

#### `ConfigCheckBanner`

```typescript
function ConfigCheckBanner(): JSX.Element;
// 配置检查横幅，提示用户配置 API
```

### prompt — 内部实现补充

#### builder/quick-mode.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateQuickModeVideoPrompt` | 函数 | `(params: { prompt: string; style?: string; duration?: number; resolution?: string }) => string` | 生成快速模式视频提示词 |

#### character/services/character-prompt-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateCharacterImagePrompt` | 函数 | `(character: Character, options?: { style?: string; quality?: string }) => string` | 生成角色图像提示词 |
| `generateCharacterDetailedPromptInstruction` | 函数 | `(character: Character) => string` | 生成角色详细提示词指令 |
| `generateSimpleCharacterImagePrompt` | 函数 | `(character: Character) => string` | 生成简单角色图像提示词 |

#### scene/services/scene-prompt-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateSceneImagePrompt` | 函数 | `(scene: Scene, options?: { style?: string; quality?: string }) => string` | 生成场景图像提示词 |
| `generateSimpleSceneImagePrompt` | 函数 | `(scene: Scene) => string` | 生成简单场景图像提示词 |
| `generateScenePromptOptimization` | 函数 | `(scene: Scene) => string` | 生成场景提示词优化建议 |

#### server-prompts/services/server-prompt-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateFirstFramePrompt` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => string` | 生成首帧提示词 |
| `generateLastFramePrompt` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => string` | 生成尾帧提示词 |
| `generateKeyframePrompt` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => string` | 生成关键帧提示词 |
| `generateCharacterAnalysisPrompt` | 函数 | `(character: Character) => string` | 生成角色分析提示词 |
| `generateSceneAnalysisPrompt` | 函数 | `(scene: Scene) => string` | 生成场景分析提示词 |

#### video/services/enhanced-video-prompt.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateEnhancedVideoPrompt` | 函数 | `(params: { beat: StoryBeat; characters: Character[]; scenes: Scene[]; style?: string; duration?: number }) => string` | 生成增强视频提示词 |

#### video/services/professional-video-prompt.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateProfessionalVideoPrompt` | 函数 | `(params: { beat: StoryBeat; characters: Character[]; scenes: Scene[]; style?: string; duration?: number }) => string` | 生成专业视频提示词 |

#### video/services/quick-video-prompt.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateQuickVideoPrompt` | 函数 | `(params: { prompt: string; style?: string; duration?: number }) => string` | 生成快速视频提示词 |

#### video/services/single-beat-prompt.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateSingleBeatPrompt` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => string` | 生成单拍提示词 |

#### video/services/video-prompt-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `buildVideoPrompt` | 函数 | `(params: { beat: StoryBeat; characters: Character[]; scenes: Scene[]; mode: "professional" \| "enhanced" \| "quick"; style?: string; duration?: number }) => string` | 构建视频提示词（根据模式分发） |

---

## 5. scene 模块

> 场景管理模块，提供场景 CRUD、图片生成/分析等功能。

### 5.1 服务

#### `sceneService`

```typescript
const sceneService: {
  getAll(): Promise<Result<Scene[]>>;
  getById(id: string): Promise<Result<Scene>>;
  create(input: CreateSceneInput): Promise<Result<Scene>>;
  update(id: string, input: UpdateSceneInput): Promise<Result<void>>;
  delete(id: string): Promise<Result<void>>;
  count(): Promise<Result<number>>;
};
```

### 5.2 常量

#### `defaultScene`

```typescript
const defaultScene: Scene;
// 默认空场景对象
```

#### `typeSuggestions`

```typescript
const typeSuggestions: string[];
// 场景类型建议：["室内", "室外", "城市", "自然", ...]
```

#### `timeSuggestions`

```typescript
const timeSuggestions: string[];
// 时间建议：["黎明", "清晨", "上午", "正午", ...]
```

#### `weatherSuggestions`

```typescript
const weatherSuggestions: string[];
// 天气建议：["晴朗", "多云", "阴天", "小雨", ...]
```

#### `moodSuggestions`

```typescript
const moodSuggestions: string[];
// 氛围建议：["宁静", "欢快", "神秘", "紧张", ...]
```

#### `elementSuggestions`

```typescript
const elementSuggestions: string[];
// 元素建议：["建筑", "自然", "水体", "火焰", ...]
```

#### `colorSuggestions`

```typescript
const colorSuggestions: string[];
// 色调建议：["暖色调", "冷色调", "高饱和", ...]
```

#### `angleSuggestions`

```typescript
const angleSuggestions: string[];
// 角度建议：["鸟瞰", "高角度", "平视", "低角度", ...]
```

#### `distanceSuggestions`

```typescript
const distanceSuggestions: string[];
// 距离建议：["极特写", "特写", "中近景", "中景", ...]
```

#### `movementSuggestions`

```typescript
const movementSuggestions: string[];
// 运动建议：["静止", "平移", "俯仰", "推拉", ...]
```

### 5.3 Hooks

#### `useSceneImage`

```typescript
function useSceneImage(props: UseSceneImageProps): UseSceneImageReturn;
// 场景图片生成/上传/分析 hook
```

#### `useScenes`

```typescript
function useScenes(): UseQueryResult<Scene[]>;
```

#### `useScene`

```typescript
function useScene(id: string): UseQueryResult<Scene>;
```

#### `useSceneCount`

```typescript
function useSceneCount(): UseQueryResult<number>;
```

#### `useCreateScene`

```typescript
function useCreateScene(): UseMutationResult<Scene, Error, CreateSceneInput>;
```

#### `useUpdateScene`

```typescript
function useUpdateScene(): UseMutationResult<void, Error, UpdateSceneInput>;
```

#### `useDeleteScene`

```typescript
function useDeleteScene(): UseMutationResult<void, Error, string>;
```

#### `useSceneCRUD`

```typescript
function useSceneCRUD(props: UseSceneCRUDProps): UseSceneCRUDReturn;
// 场景 CRUD 统一 hook，包含保存、删除、引用检查等
```

### 5.4 组件

#### `SceneListItem`

```typescript
function SceneListItem(props: React.ComponentProps<typeof SceneListItem>): JSX.Element;
```

### scene — 内部实现补充

#### hooks/use-scene-crud.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useSceneCRUD` | Hook | `() => { createScene: (data: Omit<Scene, "id">) => Promise<Result<Scene>>; updateScene: (id: string, data: Partial<Scene>) => Promise<Result<void>>; deleteScene: (id: string) => Promise<Result<void>>; duplicateScene: (id: string) => Promise<Result<Scene>> }` | 场景 CRUD 操作 Hook |

#### hooks/use-scene-image.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useSceneImage` | Hook | `(sceneId: string) => { isGenerating: boolean; generateImage: (prompt: string, options?: GenerateImageOptions) => Promise<Result<string>>; analyzeImage: (imageUrl: string) => Promise<Result<SceneAnalysis>> }` | 场景图片生成/分析 Hook |

#### hooks/use-scenes.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useScenes` | Hook | `() => { scenes: Scene[]; isLoading: boolean; error: string \| null; refetch: () => void }` | 场景列表查询 Hook |

---

## 6. shot 模块

> 分镜模块，提供一致性检查、引用检查、分镜指令、元素管理、特征锚定、引用引擎和分镜生成校验。

### 6.1 一致性检查

#### `performConsistencyCheck`

```typescript
function performConsistencyCheck(params: {
  featureAnchoring: FeatureAnchoringConfig;
  elements: StoryElement[];
}): ConsistencyCheckResult;
// 执行一致性检查（包含特征锚定和帧绑定验证）
```

#### `performConfigCheck`

```typescript
function performConfigCheck(params: {
  featureAnchoring: FeatureAnchoringConfig;
  elements: StoryElement[];
}): ConsistencyCheckResult;
// 执行配置检查
```

#### `checkVisualConsistency`

```typescript
interface ConsistencyCheckInput {
  beat: StoryBeat;
  elements: StoryElement[];
  generatedImageUrl?: string;
  structuredOutput?: ConsistencyAnalysisResult;
}

function checkVisualConsistency(input: ConsistencyCheckInput): Promise<Result<ConsistencyCheckResult>>;
// 视觉一致性检查（通过 AI 视觉分析）
```

#### `parseConsistencyAnalysisFromStructured`

```typescript
function parseConsistencyAnalysisFromStructured(output: ConsistencyAnalysisResult): ConsistencyCheckResult;
// 从结构化输出解析一致性检查结果
```

#### `validateFeatureAnchoringConfig`

```typescript
function validateFeatureAnchoringConfig(config: FeatureAnchoringConfig, elements: StoryElement[]): ConsistencyCheckResult;
// 验证特征锚定配置
```

#### `validateNoFrameBinding`

```typescript
function validateNoFrameBinding(config: FeatureAnchoringConfig, elements: StoryElement[]): ConsistencyCheckResult;
// 验证无帧绑定冲突
```

### 6.2 引用检查

#### `checkCharacterReferences`

```typescript
function checkCharacterReferences(
  characterId: string,
  characterName: string,
  stories: Story[],
): DeleteCheckResult;
// 检查角色在故事中的引用
```

#### `checkSceneReferences`

```typescript
function checkSceneReferences(
  sceneId: string,
  sceneName: string,
  stories: Story[],
): DeleteCheckResult;
// 检查场景在故事中的引用
```

#### `checkElementReferences`

```typescript
function checkElementReferences(
  elementId: string,
  elementName: string,
  stories: Story[],
): DeleteCheckResult;
// 检查元素在故事中的引用
```

#### `ReferenceInfo`

```typescript
interface ReferenceInfo {
  elementId: string;
  elementType: "character" | "scene";
  elementName: string;
  usedInBeats: string[];
  usedInStories: string[];
}
```

#### `DeleteCheckResult`

```typescript
interface DeleteCheckResult {
  canDelete: boolean;
  references: ReferenceInfo[];
  warningMessage?: string;
}
```

### 6.3 分镜指令

#### `SHOT_SIZE_OPTIONS`

```typescript
const SHOT_SIZE_OPTIONS: Array<{ value: string; label: string }>;
// 镜头尺寸选项
```

#### `CAMERA_MOVEMENT_OPTIONS`

```typescript
const CAMERA_MOVEMENT_OPTIONS: Array<{ value: string; label: string }>;
// 镜头运动选项
```

#### `CAMERA_ANGLE_OPTIONS`

```typescript
const CAMERA_ANGLE_OPTIONS: Array<{ value: string; label: string }>;
// 镜头角度选项
```

#### `buildPromptLayers`

```typescript
function buildPromptLayers(params: {
  characterAnchors: Array<{ elementName: string; featureTags: string[] }>;
  shotInstruction?: ShotInstructionTemplate;
  customDescription?: string;
  styleAtmosphere?: string;
  language?: "en" | "zh" | "auto";
}): {
  coreElements: string;
  cameraAction: string;
  styleAtmosphere: string;
};
// 构建分层提示词（核心元素、镜头动作、风格氛围）
```

### 6.4 元素管理

#### `elementManager`

```typescript
class ElementManager {
  subscribe(listener: () => void): () => void;
  getLibrary(): Promise<ElementLibrary>;
  createElement(type: ElementType, name: string, description?: string): Promise<StoryElement>;
  // ... 其他方法
}
const elementManager: ElementManager;
```

### 6.5 特征锚定

#### `validateReferenceImageQuality`

```typescript
function validateReferenceImageQuality(imageUrl: string): Promise<ReferenceImageQuality>;
// 验证参考图质量
```

#### `buildFeatureAnchoringConfig`

```typescript
function buildFeatureAnchoringConfig(
  elements: StoryElement[],
  beats: StoryBeat[],
): FeatureAnchoringConfig;
// 构建特征锚定配置
```

#### `extractCharacterFeatures`

```typescript
function extractCharacterFeatures(
  character: Character,
  language?: FeatureLanguage,
): string[];
// 提取角色特征标签
```

#### `buildFeatureTags`

```typescript
function buildFeatureTags(
  character: Character,
  language?: FeatureLanguage,
): string[];
// 构建特征标签
```

#### `buildFeatureAnchor`

```typescript
function buildFeatureAnchor(
  elementId: string,
  referenceImageUrl: string,
  featureTags: string[],
  confidence?: number,
): ElementFeatureAnchor;
// 构建特征锚点
```

#### `FeatureLanguage`

```typescript
type FeatureLanguage = "zh" | "en";
```

### 6.6 引用引擎

#### `referenceEngine`

```typescript
class ReferenceEngine {
  validateReference(
    shot: StoryBeat,
    allShots: StoryBeat[],
    reference: ShotReference,
  ): { valid: boolean; error?: string };
  getTargetShot(shot: StoryBeat, allShots: StoryBeat[], reference: ShotReference): StoryBeat | null;
  // ... 其他方法
}
const referenceEngine: ReferenceEngine;
```

### 6.7 分镜生成与校验

#### `validateShotParams`

```typescript
function validateShotParams(params: ShotParamsType): ValidationResult;
// 校验分镜参数
```

#### `validateStoryBeatOutput`

```typescript
function validateStoryBeatOutput(beat: unknown): ValidationResult;
// 校验故事镜头输出
```

#### `validateStoryPlanOutput`

```typescript
function validateStoryPlanOutput(plan: unknown): ValidationResult;
// 校验故事规划输出
```

#### `generateFallbackParams`

```typescript
function generateFallbackParams(): ShotParamsType;
// 生成回退参数
```

#### `formatValidationResult`

```typescript
function formatValidationResult(result: ValidationResult): string;
// 格式化校验结果为可读字符串
```

#### `generateStoryPlanWithValidation`

```typescript
function generateStoryPlanWithValidation(
  params: StoryPlanParams,
  options?: PipelineOptions,
): Promise<Result<StoryPlanOutput>>;
// 带校验的故事规划生成
```

#### `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}
```

#### `ShotParamsType`

```typescript
type ShotParamsType = z.infer<typeof ShotParamsSchema>;
// 分镜参数类型（从 Zod schema 推导）
```

### shot — 内部实现补充

#### consistency-check/services/config-check-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `performConfigCheck` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => ConfigCheckResult` | 执行配置检查（验证分镜配置完整性） |

#### consistency-check/services/consistency-check-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `performConsistencyCheck` | 函数 | `(beats: StoryBeat[], characters: Character[], scenes: Scene[]) => ConsistencyCheckResult` | 执行一致性检查（验证分镜间角色/场景一致性） |

#### element-binding/useElementBinding.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useElementBinding` | Hook | `(beat: StoryBeat) => { boundElements: Element[]; bindElement: (elementId: string) => void; unbindElement: (elementId: string) => void }` | 元素绑定 Hook（管理分镜与元素的绑定关系） |

#### feature-extraction/services/feature-anchoring-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `buildFeatureAnchoringConfig` | 函数 | `(beat: StoryBeat, characters: Character[]) => FeatureAnchoringConfig` | 构建特征锚定配置 |
| `validateFeatureAnchoringConfig` | 函数 | `(config: FeatureAnchoringConfig) => ValidationResult` | 验证特征锚定配置有效性 |

#### feature-extraction/services/feature-extraction-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `extractCharacterFeatures` | 函数 | `(character: Character) => CharacterFeature[]` | 提取角色特征 |
| `buildFeatureTags` | 函数 | `(features: CharacterFeature[]) => string` | 构建特征标签字符串 |
| `buildFeatureAnchor` | 函数 | `(character: Character, features: CharacterFeature[]) => string` | 构建特征锚定描述 |

#### reference-check/services/reference-check-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `checkCharacterReferences` | 函数 | `(characterId: string, beats: StoryBeat[]) => ReferenceInfo` | 检查角色引用情况 |
| `checkSceneReferences` | 函数 | `(sceneId: string, beats: StoryBeat[]) => ReferenceInfo` | 检查场景引用情况 |
| `checkElementReferences` | 函数 | `(elementId: string, beats: StoryBeat[]) => ReferenceInfo` | 检查元素引用情况 |

#### shot-generation/dynamic-few-shot.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `buildDynamicFewShotExamples` | 函数 | `(beats: StoryBeat[], count?: number) => FewShotExample[]` | 构建动态 Few-Shot 示例（根据已有分镜动态选择示例） |

#### shot-generation/shot-params.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `ShotParamsSchema` | 常量 | `z.ZodObject<...>` | 分镜参数 Zod Schema |
| `ShotParamsType` | 类型 | `z.infer<typeof ShotParamsSchema>` | 分镜参数类型 |
| `DEFAULT_SHOT_PARAMS` | 常量 | `ShotParamsType` | 默认分镜参数 |

#### shot-generation/shot-params-fixer.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `fixShotParams` | 函数 | `(params: Partial<ShotParamsType>) => ShotParamsType` | 修复分镜参数（填充缺失字段、校正值域） |
| `generateFallbackParams` | 函数 | `(beat: StoryBeat) => ShotParamsType` | 生成回退分镜参数 |

#### shot-generation/shot-validator.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `validateShotParams` | 函数 | `(params: ShotParamsType) => ValidationResult` | 验证分镜参数合法性 |
| `validateStoryBeatOutput` | 函数 | `(beat: StoryBeat) => ValidationResult` | 验证故事分镜输出 |
| `validateStoryPlanOutput` | 函数 | `(plan: StoryPlan) => ValidationResult` | 验证故事计划输出 |
| `formatValidationResult` | 函数 | `(result: ValidationResult) => string` | 格式化验证结果为可读字符串 |

#### shot-generation/story-generation-pipeline.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateStoryPlanWithValidation` | 函数 | `(params: StoryGenerationParams) => Promise<Result<StoryPlan>>` | 带验证的故事生成管线（生成+校验+修复循环） |

#### shot-generation/story-plan-parser.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `parseStoryPlan` | 函数 | `(rawOutput: string) => Result<StoryPlan>` | 解析 AI 输出为结构化故事计划 |

#### shot-generation/story-plan-prompt.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateStoryPlanPrompt` | 函数 | `(params: { genre: string; tone: string; description: string; beatCount?: number }) => string` | 生成故事计划提示词 |

#### shot-instruction/services/shot-instruction-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `resolveShotInstruction` | 函数 | `(beat: StoryBeat) => ResolvedShotInstruction \| null` | 解析分镜指令（合并 shotInstruction 和 promptLayers） |

#### shot-reference/services/shot-reference-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `buildShotReferenceConfig` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => ShotReferenceConfig` | 构建分镜引用配置 |

---

## 7. story 模块

> 故事模块，提供故事规划、AI 生成、分镜编辑、模板管理、提示词编辑等功能。

### 7.1 故事规划（planning）

#### `storyService`

```typescript
const storyService: {
  getAll(): Promise<Result<Story[]>>;
  getById(id: string): Promise<Result<Story>>;
  create(input: CreateStoryInput): Promise<Result<Story>>;
  update(id: string, input: UpdateStoryInput): Promise<Result<void>>;
  delete(id: string): Promise<Result<void>>;
  count(): Promise<Result<number>>;
};
```

#### `useStoryPlanner`

```typescript
interface UseStoryPlannerProps {
  currentStory: Story;
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  generationEnhanced: boolean;
  activeVideoTaskCount?: number;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

function useStoryPlanner(props: UseStoryPlannerProps): {
  isPlanningStory: boolean;
  planStoryWithAI: () => Promise<void>;
};
```

#### `useStories`

```typescript
function useStories(): UseQueryResult<Story[]>;
```

#### `useStory`

```typescript
function useStory(id: string): UseQueryResult<Story>;
```

#### `useStoryCount`

```typescript
function useStoryCount(): UseQueryResult<number>;
```

#### `useCreateStory`

```typescript
function useCreateStory(): UseMutationResult<Story, Error, CreateStoryInput>;
```

#### `useUpdateStory`

```typescript
function useUpdateStory(): UseMutationResult<void, Error, UpdateStoryInput>;
```

#### `useDeleteStory`

```typescript
function useDeleteStory(): UseMutationResult<void, Error, string>;
```

#### `useStorySaver`

```typescript
interface UseStorySaverProps {
  stories: Story[];
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story;
  setCurrentStory: (update: Story | ((prev: Story) => Story), skipDirty?: boolean) => void;
  beats: StoryBeat[];
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  markClean: (key: string) => void;
  markDirty: (key: string) => void;
  onBeforeDeleteStory?: (storyId: string) => Promise<void>;
}

function useStorySaver(props: UseStorySaverProps): UseStorySaverReturn;
// 故事保存 hook，包含手动保存、版本管理、模板应用等
```

#### `DEFAULT_STORY`

```typescript
const DEFAULT_STORY: Story;
// 默认空故事对象
```

#### `genres`

```typescript
const genres: Array<{ value: string; label: string; description: string }>;
// 故事类型列表：drama, comedy, action, romance, scifi, fantasy, horror, mystery
```

#### `tones`

```typescript
const tones: Array<{ value: string; label: string; color: string }>;
// 故事基调列表：light, neutral, dark, epic, intimate
```

#### `beatTypes`

```typescript
const beatTypes: Array<{ value: string; label: string; color: string; description: string }>;
// 镜头类型列表：scene, dialogue, action, transition, effect
```

#### `CreationMode`

```typescript
type CreationMode = "quick" | "professional";
```

#### `QuickInputMode`

```typescript
type QuickInputMode = "direct" | "placeholder" | "plain";
```

#### `PlaceholderBinding`

```typescript
interface PlaceholderBinding {
  id: string;
  placeholder: string;
  type: "character" | "scene";
  targetId: string | null;
}
```

#### `QuickStoryData`

```typescript
interface QuickStoryData {
  content: string;
  placeholderBindings: PlaceholderBinding[];
}
```

### 7.2 引用解析

#### `resolveCharacterRef`

```typescript
function resolveCharacterRef(
  character: Character,
  beat?: StoryBeat | null,
  elements?: StoryElement[],
): string | undefined;
// 解析角色参考图 URL（优先级：beat 服装 > 元素绑定 > 角色图片）
```

#### `resolveCharacterRefs`

```typescript
function resolveCharacterRefs(
  characterIds: string[],
  characters: Character[],
  beat?: StoryBeat | null,
  elements?: StoryElement[],
): string[];
// 批量解析角色参考图 URL
```

#### `resolveSceneRef`

```typescript
function resolveSceneRef(
  scene: { refImagePath?: string; scenePath?: string; generatedImage?: string; imageUrl?: string },
): string | undefined;
// 解析场景参考图 URL
```

### 7.3 AI 生成（generation）

#### `useAIGeneratorBase`

```typescript
interface AIGeneratorBaseProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  elementsRef?: React.MutableRefObject<StoryElement[]>;
  setBeats?: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  setGenerating: React.Dispatch<React.SetStateAction<string | null>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showConfirm?: (title: string, description: string) => Promise<boolean>;
}

interface ResolvedRefs {
  characterRefs: string[];
  sceneRef: string | undefined;
  prevBeat: StoryBeat | null;
}

function useAIGeneratorBase(props: AIGeneratorBaseProps): {
  abortGeneration: (beatId?: string) => void;
  findBeat: (beatId: string) => StoryBeat | undefined;
  resolveRefs: (beat: StoryBeat) => ResolvedRefs;
  // ... 其他方法
};
```

#### `useKeyframeGenerator`

```typescript
interface UseKeyframeGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  selectedImageModel: ModelSelection | null;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showConfirm?: (title: string, description: string) => Promise<boolean>;
}

function useKeyframeGenerator(props: UseKeyframeGeneratorProps): {
  generatingKeyframe: string | null;
  generateKeyframe: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  // ... 其他方法
};
```

#### `useFramePairGenerator`

```typescript
interface UseFramePairGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  selectedImageModel: ModelSelection | null;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

function useFramePairGenerator(props: UseFramePairGeneratorProps): {
  generatingFramePair: string | null;
  generateFramePair: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  // ... 其他方法
};
```

#### `useVideoGenerator`

```typescript
interface UseVideoGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  styleGuideRef?: React.MutableRefObject<StoryStyleGuide | undefined>;
  currentStory: Story;
  selectedVideoModel: ModelSelection | null;
  createTask: (prompt: string, _deprecated?: undefined, extraOptions?: { ... }) => Promise<VideoTask>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
}

function useVideoGenerator(props: UseVideoGeneratorProps): {
  generatingVideo: string | null;
  generateVideoNew: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<void>;
  // ... 其他方法
};
```

#### `useBatchGenerator`

```typescript
type BatchStrategy = "all_serial" | "skip_completed" | "parallel_batch";
type GenerationLevel = "keyframe" | "framepair" | "video";

type BatchOptions = {
  strategy?: BatchStrategy;
  chainMode?: ChainMode;
  skipOnError?: boolean;
  continueOnFallback?: boolean;
};

type BatchResult = {
  success: number;
  failed: number;
  skipped: number;
};

interface UseBatchGeneratorProps {
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>;
  generateKeyframe: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  generateFramePair: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<StoryBeat | void>;
  generateVideoNew: (beatId: string, prevBeatOverride?: StoryBeat | null) => Promise<void>;
  success: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showWarning?: (title: string, description?: string) => void;
}

function useBatchGenerator(props: UseBatchGeneratorProps): {
  batchGenerate: (level: GenerationLevel, options?: BatchOptions) => Promise<BatchResult>;
  isBatchRunning: boolean;
  cancelBatch: () => void;
};
```

#### `useUploadHandlers`

```typescript
function useUploadHandlers(
  setBeats: React.Dispatch<React.SetStateAction<StoryBeat[]>>,
  success: (title: string, description?: string) => void,
  warn?: (title: string, description?: string) => void,
  providerFormat?: VideoModelFormat,
  showError?: (title: string, description?: string) => void,
): {
  handleUploadKeyframe: (beatId: string, file: File) => Promise<void>;
  handleUploadFirstFrame: (beatId: string, file: File) => Promise<void>;
  handleUploadLastFrame: (beatId: string, file: File) => Promise<void>;
  handleUploadReferenceVideo: (beatId: string, file: File) => Promise<void>;
};
```

#### `ShotGenerationPanel`

```typescript
function ShotGenerationPanel(props: React.ComponentProps<typeof ShotGenerationPanel>): JSX.Element;
// 分镜生成面板组件
```

#### `KeyframePanel`

```typescript
function KeyframePanel(props: React.ComponentProps<typeof KeyframePanel>): JSX.Element;
// 预览图面板组件
```

#### `KeyframeChainVisualizer`

```typescript
function KeyframeChainVisualizer(props: React.ComponentProps<typeof KeyframeChainVisualizer>): JSX.Element;
// 预览图链可视化组件
```

#### `PromptPreview`

```typescript
function PromptPreview(props: React.ComponentProps<typeof PromptPreview>): JSX.Element;
// 提示词预览组件
```

#### `ShotReferenceConfig`

```typescript
function ShotReferenceConfig(props: React.ComponentProps<typeof ShotReferenceConfig>): JSX.Element;
// 分镜引用配置组件
```

#### `ReferenceVideoUploader`

```typescript
function ReferenceVideoUploader(props: React.ComponentProps<typeof ReferenceVideoUploader>): JSX.Element;
// 参考视频上传组件
```

#### `generateBeatKeyframe`

```typescript
function generateBeatKeyframe(beat: StoryBeat, deps: ProviderDeps): Promise<Result<StoryBeat>>;
// 生成单个镜头的预览图
```

#### `generateBeatFramePair`

```typescript
function generateBeatFramePair(beat: StoryBeat, deps: ProviderDeps): Promise<Result<StoryBeat>>;
// 生成单个镜头的首尾帧
```

#### `generateBeatVideo`

```typescript
function generateBeatVideo(beat: StoryBeat, deps: ProviderDeps): Promise<Result<VideoTask>>;
// 生成单个镜头的视频
```

#### `generateBeatFullWorkflow`

```typescript
function generateBeatFullWorkflow(beat: StoryBeat, deps: ProviderDeps): Promise<Result<StoryBeat>>;
// 执行完整工作流（预览图 → 首尾帧 → 视频）
```

#### `generateKeyframeChain`

```typescript
function generateKeyframeChain(beats: StoryBeat[], deps: ProviderDeps): Promise<Result<StoryBeat[]>>;
// 批量生成预览图链
```

#### `generateFramePairChain`

```typescript
function generateFramePairChain(beats: StoryBeat[], deps: ProviderDeps): Promise<Result<StoryBeat[]>>;
// 批量生成首尾帧链
```

#### `determineVideoGenerationMode`

```typescript
type VideoGenerationMode = "first_frame_anchor" | "reference_video_continuation" | "auto";

function determineVideoGenerationMode(beat: StoryBeat, prevBeat: StoryBeat | null): VideoGenerationMode;
// 根据镜头关系确定视频生成模式
```

#### `generateFramePrompts`

```typescript
function generateFramePrompts(input: FramePromptInput): Promise<Result<FramePromptOutput>>;
// 生成首尾帧提示词
```

#### `batchGenerateFramePrompts`

```typescript
function batchGenerateFramePrompts(inputs: FramePromptInput[]): Promise<Result<FramePromptOutput[]>>;
// 批量生成首尾帧提示词
```

#### `generateStyleGuide`

```typescript
interface StyleGuideInput {
  storyTitle: string;
  storyDescription: string;
  genre?: string;
  tone?: string;
  characters: Character[];
  scenes: Scene[];
  customArtStyle?: string;
  customColorPalette?: string[];
  customMoodAtmosphere?: string;
  providerId?: string;
  modelId?: string;
  textProvider: ITextProvider;
  imageProvider: IImageProvider;
}

function generateStyleGuide(input: StyleGuideInput): Promise<Result<StoryStyleGuide>>;
// 生成风格指南
```

#### `generateStylePromptOnly`

```typescript
function generateStylePromptOnly(input: StyleGuideInput): Promise<Result<string>>;
// 仅生成风格提示词（不生成参考图）
```

### 7.4 分镜编辑（beat-editor）

#### `useStoryState`

```typescript
function useStoryState(): {
  stories: Story[];
  setStories: React.Dispatch<React.SetStateAction<Story[]>>;
  currentStory: Story;
  setCurrentStory: (update: Story | ((prev: Story) => Story), skipDirty?: boolean) => void;
  beats: StoryBeat[];
  setBeats: (update: StoryBeat[] | ((prev: StoryBeat[]) => StoryBeat[]), skipDirty?: boolean) => void;
  beatsRef: React.MutableRefObject<StoryBeat[]>;
  markDirty: (key: string) => void;
  markClean: (key: string) => void;
  isDirty: (key: string) => boolean;
};
```

#### `useAssetLoader`

```typescript
interface AssetLoaderServices {
  getAllCharacters: () => Promise<{ ok: boolean; value?: Character[] }>;
  getAllScenes: () => Promise<{ ok: boolean; value?: Scene[] }>;
  getStoryboardAssets: () => Promise<Array<{ id: string; script?: string; previewPath?: string }>>;
}

function useAssetLoader(services: AssetLoaderServices): {
  characters: Character[];
  scenes: Scene[];
  assets: LoadedAsset[];
  isLoading: boolean;
  charactersRef: React.MutableRefObject<Character[]>;
  scenesRef: React.MutableRefObject<Scene[]>;
  refresh: () => Promise<void>;
};
```

#### `BeatDetailEditor`

> 已拆分为 BeatNavigation + BeatUploadPanel + BeatPromptPanel + BeatGenerationPanel + BeatDetailEditor（父组件）

```typescript
function BeatDetailEditor(props: React.ComponentProps<typeof BeatDetailEditor>): JSX.Element;
// 镜头详情编辑器（父组件）
```

#### `BeatOverviewCard`

```typescript
function BeatOverviewCard(props: React.ComponentProps<typeof BeatOverviewCard>): JSX.Element;
// 镜头概览卡片
```

#### `SortableBeatList`

```typescript
function SortableBeatList(props: React.ComponentProps<typeof SortableBeatList>): JSX.Element;
// 可排序的镜头列表
```

#### `ElementBindingPanel`

```typescript
function ElementBindingPanel(props: React.ComponentProps<typeof ElementBindingPanel>): JSX.Element;
// 元素绑定面板
```

#### `ProfessionalModeEditor`

```typescript
function ProfessionalModeEditor(props: React.ComponentProps<typeof ProfessionalModeEditor>): JSX.Element;
// 专业模式编辑器
```

### 7.5 模板与版本（template）

#### `TemplateManagerDialog`

```typescript
function TemplateManagerDialog(props: React.ComponentProps<typeof TemplateManagerDialog>): JSX.Element;
// 模板管理对话框
```

#### `VersionDialog`

```typescript
function VersionDialog(props: React.ComponentProps<typeof VersionDialog>): JSX.Element;
// 版本对话框
```

#### `AssetPicker`

```typescript
function AssetPicker(props: React.ComponentProps<typeof AssetPicker>): JSX.Element;
// 资产选择器
```

#### `StoryboardTemplate`

```typescript
interface StoryboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  genre: string;
  tone: string;
  tags: string[];
  author: string;
  beats: StoryboardTemplateBeat[];
  totalDuration: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}
```

#### `StoryboardTemplateBeat`

```typescript
interface StoryboardTemplateBeat {
  type: string;
  title: string;
  content: string;
  duration: number;
  shotType?: string;
  cameraAngle?: string;
  cameraMovement?: string;
  cameraDistance?: string;
  cameraSpeed?: string;
  generationPrompt?: string;
  imageGenerationPrompt?: string;
  firstFramePrompt?: string;
  lastFramePrompt?: string;
}
```

#### `createTemplateFromBeats`

```typescript
function createTemplateFromBeats(name: string, beats: StoryBeat[], metadata?: Partial<StoryboardTemplate>): Result<StoryboardTemplate>;
// 从镜头列表创建模板
```

#### `applyTemplateToBeats`

```typescript
function applyTemplateToBeats(template: StoryboardTemplate): StoryBeat[];
// 将模板应用到镜头列表
```

#### `exportTemplateToFile`

```typescript
function exportTemplateToFile(template: StoryboardTemplate): Promise<Result<void>>;
// 导出模板到文件
```

#### `importTemplateFromFile`

```typescript
function importTemplateFromFile(file: File): Promise<Result<StoryboardTemplate>>;
// 从文件导入模板
```

#### `restoreVersion`

```typescript
function restoreVersion(version: StoryVersion): { story: Story; beats: StoryBeat[] };
// 恢复到指定版本
```

#### `formatVersionTime`

```typescript
function formatVersionTime(timestamp: number): string;
// 格式化版本时间戳
```

#### `saveVersion`

```typescript
function saveVersion(
  story: Story,
  beats: StoryBeat[],
  changeSummary?: string,
  autoSaved?: boolean,
): Promise<Result<StoryVersion | null>>;
// 保存版本
```

#### `getVersions`

```typescript
function getVersions(storyId: string): Promise<Result<StoryVersion[]>>;
// 获取故事的所有版本
```

#### `deleteVersion`

```typescript
function deleteVersion(versionId: string): Promise<Result<void>>;
// 删除指定版本
```

#### `cleanupVersions`

```typescript
function cleanupVersions(storyId: string, keepCount?: number): Promise<Result<number>>;
// 清理旧版本，保留最近 N 个
```

#### `getVersionStats`

```typescript
function getVersionStats(storyId: string): Promise<Result<{ count: number; totalSize: number }>>;
// 获取版本统计信息
```

#### `compareVersions`

```typescript
function compareVersions(v1: StoryVersion, v2: StoryVersion): { added: number; removed: number; modified: number };
// 比较两个版本差异
```

#### `StoryVersion`

```typescript
type StoryVersion = {
  id: string;
  storyId: string;
  timestamp: number;
  beats: StoryBeat[];
  title: string;
  description: string;
  genre: string;
  tone: string;
  targetDuration: number;
  characters: string[];
  scenes: string[];
  changeSummary: string;
  autoSaved: boolean;
};
```

#### `getRecommendedTemplates`

```typescript
function getRecommendedTemplates(genre: string, tone: string): StoryTemplate[];
// 获取推荐的故事模板
```

#### `applyTemplate`

```typescript
function applyTemplate(template: StoryTemplate, customContent?: string): StoryBeat[];
// 应用故事模板
```

#### `StoryTemplate`

```typescript
interface StoryTemplate {
  id: string;
  name: string;
  description: string;
  genre: string[];
  tone: string[];
  beats: TemplateBeat[];
}
```

### 7.6 提示词编辑（prompt-editor）

#### `generatePromptWithAI`

```typescript
function generatePromptWithAI(request: PromptEditorRequest): Promise<Result<PromptEditorResult>>;
// 使用 AI 生成提示词
```

#### `buildDefaultPrompt`

```typescript
function buildDefaultPrompt(request: PromptEditorRequest): string;
// 构建默认提示词
```

#### `PromptEditorContext`

```typescript
type PromptEditorContext = "keyframe" | "firstFrame" | "lastFrame";
```

#### `PromptEditorRequest`

```typescript
interface PromptEditorRequest {
  context: PromptEditorContext;
  beat: StoryBeat;
  keyframeImageUrl?: string;
  userMessage?: string;
  characters?: Character[];
  scenes?: Scene[];
}
```

#### `PromptEditorResult`

```typescript
interface PromptEditorResult {
  prompt: string;
  context: PromptEditorContext;
}
```

#### `usePromptEditor`

```typescript
interface UsePromptEditorOptions {
  beat: StoryBeat;
  context: PromptEditorContext;
  keyframeImageUrl?: string;
  onPromptChange?: (context: PromptEditorContext, prompt: string) => void;
  onConfirmGenerate?: (context: PromptEditorContext, prompt: string) => void;
  providerId?: string;
  modelId?: string;
  characters?: Character[];
  scenes?: Scene[];
}

interface PromptEditorState {
  prompt: string;
  isGenerating: boolean;
  error: string | null;
  lastAIResult: PromptEditorResult | null;
  hasAIPreview: boolean;
}

function usePromptEditor(options: UsePromptEditorOptions): PromptEditorState & {
  setPrompt: (prompt: string) => void;
  generateWithAI: () => Promise<void>;
  confirmGenerate: () => void;
};
```

#### `PromptEditor`

```typescript
function PromptEditor(props: React.ComponentProps<typeof PromptEditor>): JSX.Element;
// 提示词编辑器组件
```

#### `PromptFloatingBall`

```typescript
function PromptFloatingBall(props: React.ComponentProps<typeof PromptFloatingBall>): JSX.Element;
// 提示词浮动球组件
```

### story — 内部实现补充

#### beat-editor/presentation/BeatDetailView.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BeatDetailView` | 组件 | `(props: { beat: StoryBeat; characters: Character[]; scenes: Scene[]; onUpdate: (updates: Partial<StoryBeat>) => void }) => JSX.Element` | 分镜详情视图组件 |

#### beat-editor/presentation/BeatListView.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BeatListView` | 组件 | `(props: { beats: StoryBeat[]; selectedBeatId: string \| null; onSelectBeat: (beatId: string) => void }) => JSX.Element` | 分镜列表视图组件 |

#### beat-editor/presentation/CharacterBindingSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `CharacterBindingSection` | 组件 | `(props: { beat: StoryBeat; characters: Character[]; onBindCharacter: (characterId: string) => void; onUnbindCharacter: (characterId: string) => void }) => JSX.Element` | 角色绑定区域组件 |

#### beat-editor/presentation/ReferenceBindingSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `ReferenceBindingSection` | 组件 | `(props: { beat: StoryBeat; onSetReferenceImage: (url: string) => void; onClearReference: () => void }) => JSX.Element` | 参考图绑定区域组件 |

#### beat-editor/presentation/SceneBindingSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `SceneBindingSection` | 组件 | `(props: { beat: StoryBeat; scenes: Scene[]; onBindScene: (sceneId: string) => void; onUnbindScene: () => void }) => JSX.Element` | 场景绑定区域组件 |

#### beat-editor/presentation/sections/BasicInfoSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BasicInfoSection` | 组件 | `(props: { beat: StoryBeat; onUpdate: (updates: Partial<StoryBeat>) => void }) => JSX.Element` | 基本信息区域（标题、内容、时长） |

#### beat-editor/presentation/sections/BeatFooter.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BeatFooter` | 组件 | `(props: { beat: StoryBeat; onDelete: () => void; onDuplicate: () => void }) => JSX.Element` | 分镜底部操作栏 |

#### beat-editor/presentation/sections/BeatHeader.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BeatHeader` | 组件 | `(props: { beat: StoryBeat; sequence: number; isExpanded: boolean; onToggleExpand: () => void }) => JSX.Element` | 分镜头部（序号、标题、展开/折叠） |

#### beat-editor/presentation/sections/GenerateTabContent.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `GenerateTabContent` | 组件 | `(props: { beat: StoryBeat; characters: Character[]; scenes: Scene[]; onGenerate: () => void; isGenerating: boolean }) => JSX.Element` | 生成标签页内容 |

#### beat-editor/presentation/sections/SettingsTabContent.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `SettingsTabContent` | 组件 | `(props: { beat: StoryBeat; onUpdate: (updates: Partial<StoryBeat>) => void }) => JSX.Element` | 设置标签页内容 |

#### beat-editor/presentation/sections/ShotInstructionSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `ShotInstructionSection` | 组件 | `(props: { beat: StoryBeat; onUpdate: (updates: Partial<StoryBeat>) => void }) => JSX.Element` | 分镜指令设置区域 |

#### generation/hooks/upload-utils.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `uploadImageToServer` | 函数 | `(file: File \| Blob, options?: { storyId?: string }) => Promise<Result<string>>` | 上传图片到服务器 |
| `dataURLtoBlob` | 函数 | `(dataURL: string) => Blob` | 将 DataURL 转换为 Blob |

#### generation/hooks/useFrameUploadHandlers.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useFrameUploadHandlers` | Hook | `() => { uploadFirstFrame: (beatId: string, file: File) => Promise<Result<void>>; uploadLastFrame: (beatId: string, file: File) => Promise<Result<void>>; uploadKeyframe: (beatId: string, file: File) => Promise<Result<void>> }` | 帧上传处理 Hook |

#### generation/presentation/FramePairStepContent.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `FramePairStepContent` | 组件 | `(props: { beat: StoryBeat; onFirstFrameUpload: (file: File) => void; onLastFrameUpload: (file: File) => void }) => JSX.Element` | 首尾帧步骤内容组件 |

#### generation/presentation/KeyframeStepContent.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `KeyframeStepContent` | 组件 | `(props: { beat: StoryBeat; onKeyframeUpload: (file: File) => void; onGenerateKeyframe: () => void }) => JSX.Element` | 关键帧步骤内容组件 |

#### generation/presentation/StepIndicator.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `StepIndicator` | 组件 | `(props: { currentStep: number; totalSteps: number; stepLabels: string[] }) => JSX.Element` | 步骤指示器组件 |

#### generation/presentation/VideoStepContent.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `VideoStepContent` | 组件 | `(props: { beat: StoryBeat; onGenerateVideo: () => void; isGenerating: boolean }) => JSX.Element` | 视频生成步骤内容组件 |

#### generation/services/beat-chain-generator.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateKeyframeChain` | 函数 | `(beats: StoryBeat[], characters: Character[], scenes: Scene[]) => Promise<Result<StoryBeat[]>>` | 生成关键帧链（连续分镜的关键帧） |
| `generateFramePairChain` | 函数 | `(beats: StoryBeat[], characters: Character[], scenes: Scene[]) => Promise<Result<StoryBeat[]>>` | 生成首尾帧链 |

#### generation/services/beat-frame-generator.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateBeatKeyframe` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => Promise<Result<string>>` | 生成分镜关键帧图像 |
| `generateBeatFramePair` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => Promise<Result<{ firstFrameUrl: string; lastFrameUrl: string }>>` | 生成分镜首尾帧图像 |

#### generation/services/beat-video-generator.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateBeatVideo` | 函数 | `(beat: StoryBeat, options?: { providerId?: string; modelId?: string }) => Promise<Result<VideoTask>>` | 生成分镜视频 |
| `generateBeatFullWorkflow` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => Promise<Result<VideoTask>>` | 分镜完整工作流（关键帧→帧→视频） |

#### generation/services/frame-prompt-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateFramePrompts` | 函数 | `(beat: StoryBeat, characters: Character[], scenes: Scene[]) => Promise<Result<{ firstFramePrompt: string; lastFramePrompt: string }>>` | 生成帧提示词 |
| `batchGenerateFramePrompts` | 函数 | `(beats: StoryBeat[], characters: Character[], scenes: Scene[]) => Promise<Result<Map<string, { firstFramePrompt: string; lastFramePrompt: string }>>>` | 批量生成帧提示词 |

#### generation/services/storyboard-generation-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateStoryboard` | 函数 | `(params: { story: Story; characters: Character[]; scenes: Scene[]; options?: GenerationOptions }) => Promise<Result<StoryBeat[]>>` | 生成完整故事板 |

#### generation/services/style-guide-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generateStyleGuide` | 函数 | `(story: Story, characters: Character[], scenes: Scene[]) => Promise<Result<StyleGuide>>` | 生成风格指南 |
| `generateStylePromptOnly` | 函数 | `(story: Story) => string` | 仅生成风格提示词 |

#### generation/services/video-generation-mode.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `determineVideoGenerationMode` | 函数 | `(beat: StoryBeat) => "text-to-video" \| "image-to-video" \| "frame-to-video"` | 确定视频生成模式 |

#### generation/services/video-url-sync.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `syncVideoUrls` | 函数 | `(beats: StoryBeat[], tasks: VideoTask[]) => StoryBeat[]` | 同步视频 URL（将任务结果回写到分镜） |

#### planning/hooks/use-stories.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useStories` | Hook | `() => { stories: Story[]; isLoading: boolean; error: string \| null; refetch: () => void }` | 故事列表查询 Hook |

#### planning/services/story-planning-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `createStoryPlan` | 函数 | `(params: { genre: string; tone: string; description: string; targetDuration?: number }) => Promise<Result<Story>>` | 创建故事计划 |
| `updateStoryPlan` | 函数 | `(storyId: string, updates: Partial<Story>) => Promise<Result<void>>` | 更新故事计划 |

#### planning/story-constants.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `DEFAULT_STORY` | 常量 | `Story` | 默认故事模板 |
| `genres` | 常量 | `string[]` | 故事类型列表 |
| `tones` | 常量 | `string[]` | 故事基调列表 |
| `beatTypes` | 常量 | `string[]` | 分镜类型列表 |
| `CreationMode` | 类型 | `"manual" \| "ai-assisted" \| "template"` | 创建模式类型 |
| `QuickInputMode` | 类型 | `"text" \| "voice" \| "template"` | 快速输入模式类型 |

#### prompt-editor/hooks/use-prompt-editor.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `usePromptEditor` | Hook | `(params: { context: PromptEditorContext; beat: StoryBeat; characters?: Character[]; scenes?: Scene[] }) => { prompt: string; setPrompt: (prompt: string) => void; isGenerating: boolean; generateWithAI: () => Promise<void>; resetToDefault: () => void }` | 提示词编辑器 Hook |

#### prompt-editor/services/prompt-editor-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `generatePromptWithAI` | 函数 | `(request: PromptEditorRequest, options?: { providerId?: string; modelId?: string }) => Promise<Result<PromptEditorResult>>` | AI 生成提示词 |
| `buildDefaultPrompt` | 函数 | `(request: PromptEditorRequest) => string` | 构建默认提示词 |
| `PromptEditorContext` | 类型 | `"keyframe" \| "firstFrame" \| "lastFrame"` | 提示词编辑器上下文类型 |
| `PromptEditorRequest` | 接口 | `{ context: PromptEditorContext; beat: StoryBeat; keyframeImageUrl?: string; userMessage?: string; characters?: Character[]; scenes?: Scene[] }` | 提示词编辑器请求 |
| `PromptEditorResult` | 接口 | `{ prompt: string; context: PromptEditorContext }` | 提示词编辑器结果 |

#### template/presentation/TemplateCard.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TemplateCard` | 组件 | `(props: { template: StoryboardTemplate; onApply: (template: StoryboardTemplate) => void; onExport: (template: StoryboardTemplate) => void; onDelete: (id: string) => void }) => JSX.Element` | 模板卡片组件 |

#### template/services/storyboard-template.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `createTemplateFromBeats` | 函数 | `(name: string, description: string, beats: StoryBeat[], options?: { category?: string; genre?: string; tone?: string; tags?: string[]; author?: string }) => StoryboardTemplate` | 从分镜创建模板 |
| `applyTemplateToBeats` | 函数 | `(template: StoryboardTemplate) => StoryBeat[]` | 将模板应用到分镜 |
| `exportTemplateToFile` | 函数 | `(template: StoryboardTemplate) => Promise<Result<string>>` | 导出模板到文件 |
| `importTemplateFromFile` | 函数 | `(filePath: string) => Promise<Result<StoryboardTemplate>>` | 从文件导入模板 |
| `StoryboardTemplate` | 接口 | `{ id: string; name: string; description: string; category: string; genre: string; tone: string; tags: string[]; author: string; beats: StoryboardTemplateBeat[]; totalDuration: number; version: number; createdAt: number; updatedAt: number }` | 故事板模板接口 |
| `StoryboardTemplateBeat` | 接口 | `{ type: string; title: string; content: string; duration: number; shotType?: string; cameraAngle?: string; cameraMovement?: string; cameraDistance?: string; cameraSpeed?: string; generationPrompt?: string; imageGenerationPrompt?: string; firstFramePrompt?: string; lastFramePrompt?: string }` | 模板分镜接口 |

#### template/services/version-control.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `getVersions` | 函数 | `(storyId: string) => Promise<Result<StoryVersion[]>>` | 获取故事版本列表 |
| `saveVersion` | 函数 | `(story: Story, beats: StoryBeat[], changeSummary?: string, autoSaved?: boolean) => Promise<Result<StoryVersion \| null>>` | 保存故事版本 |
| `restoreVersion` | 函数 | `(version: StoryVersion, currentStory: Story, currentBeats: StoryBeat[]) => Promise<Result<{ story: Story; beats: StoryBeat[] }>>` | 恢复到指定版本 |
| `deleteVersion` | 函数 | `(_storyId: string, versionId: string) => Promise<Result<void>>` | 删除指定版本 |
| `cleanupVersions` | 函数 | `(storyId: string, keepCount?: number) => Promise<Result<void>>` | 清理旧版本 |
| `getVersionStats` | 函数 | `(storyId: string) => Promise<Result<{ total: number; autoSaved: number; manualSaved: number; oldestVersion: number \| null; newestVersion: number \| null }>>` | 获取版本统计信息 |
| `compareVersions` | 函数 | `(v1: StoryVersion, v2: StoryVersion) => { beatsAdded: number; beatsRemoved: number; beatsModified: number; durationChanged: number; charactersChanged: boolean; scenesChanged: boolean }` | 比较两个版本差异 |
| `formatVersionTime` | 函数 | `(timestamp: number) => string` | 格式化版本时间为可读字符串 |

#### template/story-templates.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `storyTemplates` | 常量 | `StoryTemplate[]` | 预设故事模板列表 |
| `getRecommendedTemplates` | 函数 | `(genre: string, tone: string) => StoryTemplate[]` | 根据类型和基调获取推荐模板 |
| `applyTemplate` | 函数 | `(template: StoryTemplate, characters?: string[], scenes?: string[]) => StoryBeat[]` | 应用模板生成分镜 |
| `getTemplatePreview` | 函数 | `(template: StoryTemplate) => string` | 获取模板预览文本 |
| `StoryTemplate` | 接口 | `{ id: string; name: string; description: string; genre: string[]; tone: string[]; beats: TemplateBeat[] }` | 故事模板接口 |

---

## 8. sync 模块

> 同步模块，提供数据同步引擎、变更日志、向量时钟、冲突处理等功能。

### 8.1 引擎函数

#### `initSyncEngine`

```typescript
function initSyncEngine(config?: Partial<SyncConfig>): Promise<void>;
// 初始化同步引擎
```

#### `performSync`

```typescript
function performSync(): Promise<{ pushed: number; pulled: number; conflicts: number }>;
// 执行一次同步操作
```

#### `getSyncStatus`

```typescript
function getSyncStatus(): SyncStatusInfo;
// 获取当前同步状态
```

#### `updateSyncConfig`

```typescript
function updateSyncConfig(config: Partial<SyncConfig>): void;
// 更新同步配置
```

#### `getSyncConfig`

```typescript
function getSyncConfig(): SyncConfig;
// 获取当前同步配置
```

#### `setConflictCallback`

```typescript
function setConflictCallback(callback: ((conflicts: SyncConflict[]) => void) | null): void;
// 设置冲突回调
```

### 8.2 变更日志

#### `recordChange`

```typescript
function recordChange(
  entityType: SyncEntityType,
  entityId: string,
  operation: ChangeOperation,
  data?: Record<string, unknown>,
): Promise<void>;
// 记录一条变更日志
```

### 8.3 类型

#### `SyncEntityType`

```typescript
type SyncEntityType = string;
// 同步实体类型
```

#### `ChangeOperation`

```typescript
type ChangeOperation = "create" | "update" | "delete";
```

#### `SyncChangeLogEntry`

```typescript
interface SyncChangeLogEntry {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: ChangeOperation;
  data?: Record<string, unknown>;
  vectorClock: VectorClock;
  deviceId: string;
  timestamp: number;
}
```

#### `VectorClock`

```typescript
type VectorClock = Record<string, number>;
// 向量时钟，键为设备 ID，值为计数器
```

#### `SyncStatus`

```typescript
type SyncStatus = "idle" | "syncing" | "error" | "conflict";
```

#### `SyncConflict`

```typescript
interface SyncConflict {
  entityType: SyncEntityType;
  entityId: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  localVectorClock: VectorClock;
  remoteVectorClock: VectorClock;
}
```

#### `ConflictStrategy`

```typescript
type ConflictStrategy = "local_wins" | "remote_wins" | "manual";
```

#### `SyncConfig`

```typescript
interface SyncConfig {
  enabled: boolean;
  serverUrl: string;
  syncInterval: number;
  conflictStrategy: ConflictStrategy;
  deviceId: string;
}
```

#### `SyncStatusInfo`

```typescript
interface SyncStatusInfo {
  status: SyncStatus;
  lastSyncAt: number | null;
  lastError: string | null;
  pendingChanges: number;
}
```

#### `SyncPushResult`

```typescript
interface SyncPushResult {
  pushed: number;
  conflicts: SyncConflict[];
}
```

#### `SyncPullResult`

```typescript
interface SyncPullResult {
  pulled: number;
  conflicts: SyncConflict[];
}
```

#### `RemoteChange`

```typescript
interface RemoteChange {
  entityType: SyncEntityType;
  entityId: string;
  operation: ChangeOperation;
  data: Record<string, unknown>;
  vectorClock: VectorClock;
  deviceId: string;
  timestamp: number;
}
```

### 8.4 向量时钟工具

#### `createVectorClock`

```typescript
function createVectorClock(deviceId: string): VectorClock;
// 创建初始向量时钟
```

#### `incrementVectorClock`

```typescript
function incrementVectorClock(clock: VectorClock, deviceId: string): VectorClock;
// 递增指定设备的计数器
```

#### `mergeVectorClocks`

```typescript
function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock;
// 合并两个向量时钟（取每个键的最大值）
```

#### `compareVectorClocks`

```typescript
function compareVectorClocks(a: VectorClock, b: VectorClock): "before" | "after" | "concurrent" | "equal";
// 比较两个向量时钟的先后关系
```

#### `isVectorClockConflict`

```typescript
function isVectorClockConflict(a: VectorClock, b: VectorClock): boolean;
// 判断两个向量时钟是否冲突（并发）
```

#### `DEFAULT_SYNC_CONFIG`

```typescript
const DEFAULT_SYNC_CONFIG: SyncConfig;
// 默认同步配置
```

### 8.5 组件

#### `SyncConflictPanel`

```typescript
function SyncConflictPanel(props: React.ComponentProps<typeof SyncConflictPanel>): JSX.Element;
// 同步冲突面板，用于手动解决冲突
```

#### `SyncSettingsPanel`

```typescript
function SyncSettingsPanel(props: React.ComponentProps<typeof SyncSettingsPanel>): JSX.Element;
// 同步设置面板
```

#### `SyncStatusIndicator`

```typescript
interface SyncStatusIndicatorProps {
  status: SyncStatusInfo;
  onClick?: () => void;
}

function SyncStatusIndicator(props: SyncStatusIndicatorProps): JSX.Element;
// 同步状态指示器
```

### sync — 内部实现补充

#### engine/conflict-resolution.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `resolveConflict` | 函数 | `(conflict: SyncConflict, conflictStrategy: string) => Promise<void>` | 根据策略解决同步冲突 |
| `markConflict` | 函数 | `(entityType: SyncEntityType, entityId: string) => Promise<void>` | 标记实体为冲突状态 |

#### engine/entity-mapping.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `getTableName` | 函数 | `(entityType: SyncEntityType) => string \| null` | 根据实体类型获取数据库表名 |
| `getPkColumn` | 函数 | `(tableName: string) => string` | 根据表名获取主键列名 |
| `TABLES_WITHOUT_UPDATED_AT` | 常量 | `Set<string>` | 不含 updated_at 列的表集合 |
| `HARD_DELETE_TABLES` | 常量 | `Set<string>` | 使用硬删除的表集合 |
| `TABLE_PK_MAP` | 常量 | `Record<string, string>` | 表名到主键列的映射 |

#### engine/remote-changes.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `applyRemoteChanges` | 函数 | `(changes: RemoteChange[], deviceId: string) => Promise<void>` | 应用远程变更到本地数据库 |

#### engine/server-store.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `getServerChangeLog` | 函数 | `() => ServerChange[]` | 获取服务端变更日志 |
| `appendServerChanges` | 函数 | `(changes: ServerChange[]) => void` | 追加服务端变更记录 |
| `getServerVectorClock` | 函数 | `() => VectorClock` | 获取服务端向量时钟 |
| `saveServerVectorClock` | 函数 | `(vc: VectorClock) => void` | 保存服务端向量时钟 |
| `clearServerSyncData` | 函数 | `() => void` | 清除服务端同步数据 |

#### engine/sync-engine-class.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `SyncEngine` | 类 | `class SyncEngine { constructor(config?: Partial<SyncConfig>); init(config?: Partial<SyncConfig>): Promise<void>; performSync(): Promise<SyncResult>; startAutoSync(): void; stopAutoSync(): void; setConflictCallback(callback: ((conflicts: SyncConflict[]) => void) \| null): void; updateConfig(config: Partial<SyncConfig>): void; getSyncStatus(): SyncStatusInfo; destroy(): void }` | 同步引擎类（管理推送/拉取/冲突解决） |
| `SyncResult` | 类型 | `{ pushed: number; pulled: number; conflicts: number }` | 同步结果类型 |

#### engine/sync-protocol.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `pushChanges` | 函数 | `(deviceId: string, endpoint?: string, serverUrl?: string) => Promise<SyncPushResult>` | 推送本地变更到服务端 |
| `pullChanges` | 函数 | `(deviceId: string, endpoint?: string, serverUrl?: string) => Promise<SyncPullResult>` | 从服务端拉取变更 |

#### presentation/ConflictResolutionSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `ConflictResolutionSection` | 组件 | `(props: { conflictStrategy: ConflictStrategy; onConflictStrategyChange: (strategy: ConflictStrategy) => void; enabled: boolean }) => JSX.Element` | 冲突解决策略选择区域 |

#### presentation/ServerConfigSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `ServerConfigSection` | 组件 | `(props: ServerConfigSectionProps) => JSX.Element` | 服务器配置区域组件 |
| `ConnectionStatus` | 类型 | `"disconnected" \| "testing" \| "connected" \| "error"` | 连接状态类型 |

#### presentation/SyncStatusSection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `SyncStatusSection` | 组件 | `(props: { status: SyncStatusInfo \| null; syncResult: { pushed: number; pulled: number; conflicts: number } \| null }) => JSX.Element` | 同步状态展示区域 |

---

## 9. video 模块

> 视频模块，提供视频任务管理（CQRS）、视频/图片缓存、视频恢复、编解码检测等功能。

### 9.1 视频任务管理（task-management）

#### `VideoTask`

```typescript
type VideoTask = {
  id: string;
  status: VideoTaskStatus;
  prompt: string;
  videoUrl?: string;
  progress: number;
  providerId?: string;
  modelId?: string;
  storyId?: string;
  storyTitle?: string;
  beatId?: string;
  beatTitle?: string;
  duration?: number;
  firstFrameUrl?: string;
  fixedImageUrl?: string;
  fixedImageLockType?: "character" | "scene";
  referenceVideo?: string;
  pollCount: number;
  pollFailureCount: number;
  recoveryAttempts: number;
  lastPolledAt?: string;
  createdAt: string;
  expiresAt?: string;
  urlObtainedAt?: number;
  urlTtl?: number;
  // ... 其他字段
};
```

#### `useVideoTaskManager`

```typescript
function useVideoTaskManager(): {
  allTasks: VideoTask[];
  isBackgroundProcessing: boolean;
  isInitialized: boolean;
  isCreating: boolean;
  initError: string | null;
  initialize: () => void;
  setAllTasks: (tasks: VideoTask[] | ((prev: VideoTask[]) => VideoTask[])) => void;
  addTask: (task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask>;
  removeTask: (taskId: string) => Promise<void>;
  removeTasks: (taskIds: string[]) => Promise<void>;
  removeTasksByBeatId: (beatId: string) => Promise<void>;
  removeTasksByStoryId: (storyId: string) => Promise<void>;
  clearActiveTasks: () => Promise<void>;
  clearAllTasks: () => Promise<void>;
  clearCompletedTasks: () => Promise<void>;
  clearFailedTasks: () => Promise<void>;
  createTask: (prompt: string, _deprecated?: undefined, extraOptions?: {
    fixedImageUrl?: string;
    fixedImageLockType?: "character" | "scene";
    referenceVideo?: string | null;
    duration?: number;
    storyId?: string;
    storyTitle?: string;
    beatId?: string;
    beatTitle?: string;
    firstFrameUrl?: string;
    providerId?: string;
    modelId?: string;
  }) => Promise<VideoTask>;
  pollTask: (taskId: string) => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  recoverTask: (taskId: string) => Promise<void>;
  // stableActions — 所有 action 方法的引用稳定，不随 allTasks 变化
};
```

#### `useVideoTaskStore`

```typescript
const useVideoTaskStore: UseBoundStore<StoreApi<VideoTaskManagerState>>;
// 底层 Zustand store，仅用于特殊场景
```

#### `useVideoTaskState`

```typescript
function useVideoTaskState(): VideoTaskStateStore;
// 纯状态 hook，无副作用
```

#### `useVideoTaskQueries`

```typescript
interface VideoTaskQueries {
  allTasks: VideoTask[];
  activeTasks: VideoTask[];
  completedTasks: VideoTask[];
  failedTasks: VideoTask[];
  hasActiveTasks: boolean;
  activeTaskId: string | null;
  taskCount: number;
  isBackgroundProcessing: boolean;
  isInitialized: boolean;
  isCreating: boolean;
  initError: string | null;
}

function useVideoTaskQueries(): VideoTaskQueries;
// 只读查询 hook，使用 useMemo 派生数据
```

#### `useVideoTaskCommands`

```typescript
interface VideoTaskCommands {
  addTask: (task: Omit<VideoTask, "progress" | "createdAt">) => Promise<VideoTask>;
  removeTask: (taskId: string) => Promise<void>;
  removeTasks: (taskIds: string[]) => Promise<void>;
  removeTasksByBeatId: (beatId: string) => Promise<void>;
  removeTasksByStoryId: (storyId: string) => Promise<void>;
  clearActiveTasks: () => Promise<void>;
  clearAllTasks: () => Promise<void>;
  clearCompletedTasks: () => Promise<void>;
  clearFailedTasks: () => Promise<void>;
  createTask: (prompt: string, _deprecated?: undefined, extraOptions?: { ... }) => Promise<VideoTask>;
  cancelTask: (taskId: string) => Promise<void>;
  recoverTask: (taskId: string) => Promise<void>;
}

function useVideoTaskCommands(): VideoTaskCommands;
// 写操作 hook，处理 API 调用 + 状态更新
```

#### `useVideoTaskPolling`

```typescript
interface VideoTaskPolling {
  initialize: () => void;
  pollTask: (taskId: string) => Promise<void>;
  cleanup: () => void;
}

function useVideoTaskPolling(): VideoTaskPolling;
// 轮询 hook，处理周期性状态检查
```

#### `useVideoTasks`

```typescript
function useVideoTasks(): UseQueryResult<VideoTask[]>;
// React Query hook，获取所有视频任务历史
```

#### `useFailedVideoTasks`

```typescript
function useFailedVideoTasks(): UseQueryResult<VideoTask[]>;
// React Query hook，获取失败的视频任务
```

#### `useRecoverVideo`

```typescript
function useRecoverVideo(): UseMutationResult<VideoRecoverySuccessResult, Error, string>;
// React Query mutation，恢复指定视频任务
```

#### `useCleanExpiredTasks`

```typescript
function useCleanExpiredTasks(): UseMutationResult<number, Error, void>;
// React Query mutation，清理过期视频任务
```

#### `useStartBackgroundRecovery`

```typescript
function useStartBackgroundRecovery(): UseMutationResult<void, Error, void>;
// React Query mutation，启动后台恢复
```

#### `buildTrackingInfo`

```typescript
interface TrackingInfo {
  providerName?: string;
  model?: string;
  apiUrl?: string;
  queryEndpoint?: string;
  howToCheck: string;
  apiDocUrl?: string;
}

function buildTrackingInfo(task: VideoTask): TrackingInfo;
// 构建任务追踪信息（用于用户手动查询任务状态）
```

### 9.2 组件

#### `VideoTaskManager`

```typescript
function VideoTaskManager(props: React.ComponentProps<typeof VideoTaskManager>): JSX.Element;
// 视频任务管理器 UI 组件
```

#### `VideoTaskManagerInitializer`

```typescript
function VideoTaskManagerInitializer(): JSX.Element | null;
// 视频任务管理器初始化组件（应用级，不随页面卸载而清理）
```

#### `VideoTaskManagerUI`

```typescript
function VideoTaskManagerUI(props: React.ComponentProps<typeof VideoTaskManagerUI>): JSX.Element;
// 视频任务管理器 UI 组件
```

### 9.3 视频缓存（cache）

#### `useVideoCacheStats`

```typescript
function useVideoCacheStats(): UseQueryResult<VideoCacheStats>;
// React Query hook，获取视频缓存统计
```

#### `cacheVideoBlob`

```typescript
function cacheVideoBlob(taskId: string, videoUrl: string): Promise<Result<boolean>>;
// 缓存视频 Blob 到本地
```

#### `getCachedVideoUrl`

```typescript
function getCachedVideoUrl(taskId: string): Promise<Result<string | null>>;
// 获取缓存的视频 URL
```

#### `getVideoUrlWithCache`

```typescript
function getVideoUrlWithCache(taskId: string, videoUrl: string): Promise<Result<string>>;
// 获取视频 URL（优先使用缓存）
```

#### `removeCachedVideo`

```typescript
function removeCachedVideo(taskId: string): Promise<Result<void>>;
// 移除缓存的视频
```

#### `cleanExpiredVideoCache`

```typescript
function cleanExpiredVideoCache(): Promise<Result<number>>;
// 清理过期视频缓存
```

#### `getCacheStats`

```typescript
function getCacheStats(): Promise<Result<VideoCacheStats>>;
// 获取缓存统计信息
```

#### `revokeObjectURL`

```typescript
function revokeObjectURL(blobUrl: string): void;
// 释放 Blob URL
```

#### `touchMemoryCache`

```typescript
function touchMemoryCache(taskId: string): void;
// 更新内存缓存访问时间
```

#### `clearMemoryCache`

```typescript
function clearMemoryCache(): void;
// 清空内存缓存
```

#### `checkCachedVideo`

```typescript
function checkCachedVideo(taskId: string): Promise<Result<boolean>>;
// 检查视频是否已缓存
```

#### `getVideoFileStream`

```typescript
function getVideoFileStream(taskId: string): Promise<Result<string>>;
// 获取视频文件流路径
```

#### `getCachedVideo`

```typescript
function getCachedVideo(taskId: string): Promise<Result<string | null>>;
// 获取缓存视频文件路径
```

### 9.4 图片缓存（cache）

#### `cacheImageBlob`

```typescript
function cacheImageBlob(sourceUrl: string): Promise<Result<string>>;
// 缓存图片 Blob 到本地
```

#### `getCachedImagePath`

```typescript
function getCachedImagePath(sourceUrl: string): Promise<Result<string | null>>;
// 获取缓存的图片路径
```

#### `getImageUrlWithCache`

```typescript
function getImageUrlWithCache(sourceUrl: string): Promise<Result<string>>;
// 获取图片 URL（优先使用缓存）
```

#### `removeCachedImage`

```typescript
function removeCachedImage(sourceUrl: string): Promise<Result<void>>;
// 移除缓存的图片
```

#### `cleanExpiredImageCache`

```typescript
function cleanExpiredImageCache(): Promise<Result<number>>;
// 清理过期图片缓存
```

#### `getImageCacheStats`

```typescript
function getImageCacheStats(): Promise<Result<ImageCacheStats>>;
// 获取图片缓存统计
```

#### `recoverUncachedImages`

```typescript
function recoverUncachedImages(): Promise<Result<number>>;
// 恢复未缓存的图片
```

### 9.5 视频恢复（recovery）

#### `recoverVideoByTaskId`

```typescript
function recoverVideoByTaskId(taskId: string): Promise<Result<VideoRecoverySuccessResult>>;
// 通过任务 ID 恢复视频
```

#### `saveVideoTask`

```typescript
function saveVideoTask(task: VideoTask): Promise<Result<void>>;
// 保存视频任务到数据库
```

#### `verifyVideoUrl`

```typescript
function verifyVideoUrl(url: string): Promise<VideoVerificationResult>;
// 验证视频 URL 是否有效
```

#### `verifyMultipleVideos`

```typescript
function verifyMultipleVideos(tasks: VideoTask[]): Promise<VideoVerificationResult[]>;
// 批量验证视频 URL
```

#### `checkForDuplicateVideos`

```typescript
function checkForDuplicateVideos(task: VideoTask): Promise<DuplicateCheckResult>;
// 检查是否有重复视频
```

#### `findSimilarTasks`

```typescript
function findSimilarTasks(task: VideoTask): Promise<DuplicateCheckResult>;
// 查找相似任务
```

#### `SmartRetryEngine`

```typescript
class SmartRetryEngine {
  shouldRetry(task: VideoTask, error: unknown): RetryDecision;
  getNextRetryDelay(task: VideoTask): number;
  // ... 其他方法
}
```

#### `smartRetryEngine`

```typescript
const smartRetryEngine: SmartRetryEngine;
// 智能重试引擎单例
```

#### `createRetryEngine`

```typescript
function createRetryEngine(config?: Partial<RetryConfig>): SmartRetryEngine;
// 创建自定义配置的重试引擎
```

#### `getTaskRecoveryInfo`

```typescript
function getTaskRecoveryInfo(taskId: string): Promise<VideoTaskRecoveryInfo>;
// 获取任务恢复信息
```

#### `performIntelligentRecovery`

```typescript
function performIntelligentRecovery(taskId: string): Promise<Result<VideoRecoverySuccessResult>>;
// 执行智能恢复
```

#### `checkForTokenWaste`

```typescript
function checkForTokenWaste(task: VideoTask): { isWaste: boolean; reason: string };
// 检查是否存在 Token 浪费
```

#### `registerCacheVideoBlobFn`

```typescript
function registerCacheVideoBlobFn(fn: (taskId: string, videoUrl: string) => Promise<Result<boolean>>): void;
// 注册缓存视频 Blob 函数
```

#### `getFailedTasks`

```typescript
function getFailedTasks(): Promise<Result<VideoTask[]>>;
// 获取所有失败的任务
```

#### `getTaskById`

```typescript
function getTaskById(taskId: string): Promise<Result<VideoTask>>;
// 通过 ID 获取任务
```

#### `startBackgroundRecovery`

```typescript
function startBackgroundRecovery(): Promise<Result<void>>;
// 启动后台恢复
```

#### `cleanExpiredTasks`

```typescript
function cleanExpiredTasks(): Promise<Result<number>>;
// 清理过期任务
```

#### `getAllTaskHistory`

```typescript
function getAllTaskHistory(): Promise<Result<VideoTask[]>>;
// 获取所有任务历史
```

### 9.6 恢复类型

#### `VideoVerificationResult`

```typescript
interface VideoVerificationResult {
  isValid: boolean;
  reason: string;
  details?: VideoVerificationDetails;
  confidence: "high" | "medium" | "low";
}
```

#### `VideoVerificationDetails`

```typescript
interface VideoVerificationDetails {
  apiStatus: string;
  urlAccessible: boolean;
  contentValid: boolean;
  contentSize?: number;
  contentType?: string;
  errorMessage?: string;
}
```

#### `RetryDecision`

```typescript
interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
  errorCategory?: ErrorCategory;
  confidence: "high" | "medium" | "low";
  retryAfterMs?: number;
  maxRetries?: number;
  tokenWasteRisk: "high" | "medium" | "low";
}
```

#### `VideoRecoveryLog`

```typescript
interface VideoRecoveryLog {
  timestamp: number;
  action: string;
  details?: string;
  success?: boolean;
}
```

#### `VideoTaskRecoveryInfo`

```typescript
interface VideoTaskRecoveryInfo {
  taskId: string;
  verification?: VideoVerificationResult;
  decision: RetryDecision;
  logs: VideoRecoveryLog[];
  duplicateCheck?: DuplicateCheckResult;
  statistics: {
    totalAttempts: number;
    failedAttempts: number;
    lastAttempt?: number;
    averageRetryInterval?: number;
  };
}
```

#### `DuplicateCheckResult`

```typescript
interface DuplicateCheckResult {
  hasDuplicate: boolean;
  existingTaskId?: string;
  existingVideoUrl?: string;
  similarity?: number;
  reason?: string;
}
```

#### `RetryConfig`

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  // ... 其他配置
}
```

### 9.7 工具函数（utils）

#### `detectVideoCodec`

```typescript
function detectVideoCodec(file: File): Promise<VideoCodecInfo>;
// 检测视频编解码信息
```

#### `isCodecSupportedByProvider`

```typescript
function isCodecSupportedByProvider(codec: string, providerId: string): boolean;
// 检查编解码器是否被提供商支持
```

#### `extractVideoFrames`

```typescript
function extractVideoFrames(videoUrl: string, options?: { count?: number; time?: number[] }): Promise<ExtractedFrames>;
// 从视频中提取帧
```

#### `downloadJSONFile`

```typescript
function downloadJSONFile(data: unknown, filename: string): void;
// 下载 JSON 文件
```

### 9.8 视频模板（utils）

#### `VideoTemplate`

```typescript
interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt: string;
  style: string;
  duration: number;
  imageDescription?: string;
}
```

#### `videoTemplates`

```typescript
const videoTemplates: VideoTemplate[];
// 预设视频模板列表
```

#### `templateCategories`

```typescript
const templateCategories: string[];
// 模板分类列表
```

#### `getTemplatesByCategory`

```typescript
function getTemplatesByCategory(category: string): VideoTemplate[];
// 按分类获取模板
```

#### `applyVideoTemplate`

```typescript
function applyVideoTemplate(template: VideoTemplate, customizations?: Partial<VideoTemplate>): VideoTemplate;
// 应用视频模板（可自定义覆盖）
```

### video — 内部实现补充

#### cache/hooks/use-video-cache.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoCacheStats` | Hook | `() => UseQueryResult<{ count: number; totalSizeMB: number }>` | 视频缓存统计查询 Hook |

#### cache/services/video-cache-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `cacheVideoBlob` | 函数 | `(taskId: string, videoUrl: string) => Promise<Result<boolean>>` | 缓存视频 Blob |
| `getCachedVideoUrl` | 函数 | `(taskId: string) => Promise<Result<string \| null>>` | 获取缓存视频 URL |
| `getVideoUrlWithCache` | 函数 | `(taskId: string, videoUrl: string) => Promise<Result<{ url: string; fromCache: boolean }>>` | 获取视频 URL（优先使用缓存） |
| `removeCachedVideo` | 函数 | `(taskId: string) => Promise<Result<void>>` | 移除缓存视频 |
| `cleanExpiredVideoCache` | 函数 | `() => Promise<Result<number>>` | 清理过期视频缓存 |
| `getCacheStats` | 函数 | `() => Promise<Result<{ count: number; totalSizeMB: number }>>` | 获取缓存统计 |
| `revokeObjectURL` | 函数 | `(url: string) => void` | 释放 Blob URL |
| `touchMemoryCache` | 函数 | `(taskId: string) => void` | 刷新内存缓存访问时间 |
| `clearMemoryCache` | 函数 | `() => void` | 清空内存缓存 |
| `checkCachedVideo` | 函数 | `(taskId: string) => Promise<{ exists: boolean; fileSizeMB?: number }>` | 检查视频缓存状态 |
| `getVideoFileStream` | 函数 | `(taskId: string) => Promise<NodeJS.ReadableStream \| null>` | 获取视频文件流 |
| `getCachedVideo` | 函数 | `(taskId: string) => Promise<Result<Buffer \| null>>` | 获取缓存视频 Buffer |
| `recoverUncachedVideos` | 函数 | `() => Promise<Result<number>>` | 恢复未缓存的视频 |
| `cacheImageBlob` | 函数 | `(taskId: string, imageUrl: string) => Promise<Result<boolean>>` | 缓存图片 Blob |
| `getCachedImagePath` | 函数 | `(taskId: string) => Promise<Result<string \| null>>` | 获取缓存图片路径 |
| `getImageUrlWithCache` | 函数 | `(taskId: string, imageUrl: string) => Promise<Result<{ path: string; fromCache: boolean }>>` | 获取图片 URL（优先使用缓存） |
| `removeCachedImage` | 函数 | `(taskId: string) => Promise<Result<void>>` | 移除缓存图片 |
| `cleanExpiredImageCache` | 函数 | `() => Promise<Result<number>>` | 清理过期图片缓存 |
| `getImageCacheStats` | 函数 | `() => Promise<Result<{ count: number; totalSizeMB: number }>>` | 获取图片缓存统计 |
| `recoverUncachedImages` | 函数 | `() => Promise<Result<number>>` | 恢复未缓存的图片 |

#### recovery/services/duplicate-detection-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `checkForDuplicateVideos` | 函数 | `(newTask: Partial<VideoTask>, existingTasks: VideoTask[]) => Promise<DuplicateCheckResult>` | 检查重复视频任务 |
| `findSimilarTasks` | 函数 | `(task: Partial<VideoTask>, allTasks: VideoTask[], limit?: number) => Array<{ task: VideoTask; similarity: number }>` | 查找相似任务 |

#### recovery/services/smart-retry-engine.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `SmartRetryEngine` | 类 | `class SmartRetryEngine { constructor(config?: Partial<RetryConfig>); makeRetryDecision(task: VideoTask, verification?: VideoVerificationResult, previousAttempts?: number): RetryDecision }` | 智能重试引擎（根据错误分类决定是否重试） |
| `smartRetryEngine` | 常量 | `SmartRetryEngine` | 默认智能重试引擎实例 |
| `createRetryEngine` | 函数 | `(config?: Partial<RetryConfig>) => SmartRetryEngine` | 创建自定义配置的重试引擎 |

#### recovery/services/video-intelligent-recovery-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `getTaskRecoveryInfo` | 函数 | `(taskId: string, existingTasks?: VideoTask[]) => Promise<Result<VideoTaskRecoveryInfo \| null>>` | 获取任务恢复信息 |
| `performIntelligentRecovery` | 函数 | `(taskId: string) => Promise<Result<IntelligentRecoveryResult>>` | 执行智能恢复 |
| `checkForTokenWaste` | 函数 | `(task: VideoTask) => TokenWasteCheckResult` | 检查 Token 浪费风险 |
| `IntelligentRecoveryResult` | 接口 | `{ videoUrl?: string; message: string; decision?: RetryDecision; verification?: VideoVerificationResult }` | 智能恢复结果 |
| `TokenWasteCheckResult` | 接口 | `{ risk: "high" \| "medium" \| "low"; reason: string; suggestions: string[] }` | Token 浪费检查结果 |

#### recovery/services/video-recovery-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `saveVideoTask` | 函数 | `(task: VideoTask) => Promise<Result<void>>` | 保存视频任务到持久化存储 |
| `getFailedTasks` | 函数 | `() => Promise<Result<VideoTask[]>>` | 获取失败任务列表 |
| `recoverVideoByTaskId` | 函数 | `(taskId: string) => Promise<Result<VideoRecoverySuccessResult>>` | 按 ID 恢复视频任务 |
| `registerCacheVideoBlobFn` | 函数 | `(fn: (taskId: string, videoUrl: string) => Promise<Result<boolean>>) => void` | 注册缓存视频 Blob 函数 |
| `startBackgroundRecovery` | 函数 | `() => Promise<Result<void>>` | 启动后台恢复 |
| `cleanExpiredTasks` | 函数 | `() => Promise<Result<number>>` | 清理过期任务 |
| `getAllTaskHistory` | 函数 | `() => Promise<Result<VideoTask[]>>` | 获取所有任务历史 |
| `getTaskById` | 函数 | `(taskId: string) => Promise<Result<VideoTask \| null>>` | 按 ID 获取任务 |
| `VideoRecoverySuccessResult` | 接口 | `{ videoUrl?: string; message: string; status?: string }` | 视频恢复成功结果 |

#### recovery/services/video-verification-service.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `verifyVideoUrl` | 函数 | `(videoUrl: string) => Promise<Result<VideoVerificationResult>>` | 验证视频 URL 可访问性和内容有效性 |
| `verifyVideoFile` | 函数 | `(filePath: string) => Promise<Result<boolean>>` | 验证本地视频文件 |
| `verifyMultipleVideos` | 函数 | `(videoUrls: string[]) => Promise<Result<Map<string, VideoVerificationResult>>>` | 批量验证视频 URL |

#### recovery/types/video-recovery-types.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `VideoVerificationDetails` | 接口 | `{ apiStatus: string; urlAccessible: boolean; contentValid: boolean; contentSize?: number; contentType?: string; errorMessage?: string }` | 视频验证详情 |
| `VideoVerificationResult` | 接口 | `{ isValid: boolean; reason: string; details?: VideoVerificationDetails; confidence: "high" \| "medium" \| "low" }` | 视频验证结果 |
| `RetryDecision` | 接口 | `{ shouldRetry: boolean; reason: string; errorCategory?: ErrorCategory; confidence: "high" \| "medium" \| "low"; retryAfterMs?: number; maxRetries?: number; tokenWasteRisk: "high" \| "medium" \| "low" }` | 重试决策 |
| `VideoRecoveryLog` | 接口 | `{ timestamp: number; action: string; details?: string; success?: boolean }` | 视频恢复日志 |
| `VideoTaskRecoveryInfo` | 接口 | `{ taskId: string; verification?: VideoVerificationResult; decision: RetryDecision; logs: VideoRecoveryLog[]; duplicateCheck?: DuplicateCheckResult; statistics: { totalAttempts: number; failedAttempts: number; lastAttempt?: number; averageRetryInterval?: number } }` | 任务恢复信息 |
| `DuplicateCheckResult` | 接口 | `{ hasDuplicate: boolean; existingTaskId?: string; existingVideoUrl?: string; similarity?: number; reason?: string }` | 重复检查结果 |
| `RetryConfig` | 接口 | `{ maxRetries: number; baseDelayMs: number; maxDelayMs: number; exponentialBackoff: boolean; jitter: boolean }` | 重试配置 |

#### task-management/domain/policies/expiration-policy.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `checkExpiration` | 函数 | `(task: VideoTask) => PolicyAction` | 检查任务是否过期（超过7天保留期） |
| `PolicyAction` | 接口 | `{ type: "TRANSITION" \| "DELETE" \| "NONE"; reason?: string }` | 策略动作类型 |

#### task-management/domain/policies/policy-engine.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `evaluatePolicies` | 函数 | `(task: VideoTask) => PolicyAction[]` | 评估所有策略（超时+过期）并返回需要执行的动作列表 |

#### task-management/domain/policies/timeout-policy.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `checkTimeout` | 函数 | `(task: VideoTask) => PolicyAction` | 检查任务是否超时（超过2小时） |
| `PolicyAction` | 接口 | `{ type: "TRANSITION" \| "DELETE" \| "NONE"; targetStatus?: "failed" \| "timeout"; reason?: string }` | 策略动作类型（含目标状态） |

#### task-management/domain/task-events.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskEvent` | 类型 | `{ type: "TASK_CREATED" \| "TASK_STATUS_CHANGED" \| "TASK_POLL_SUCCEEDED" \| "TASK_POLL_FAILED" \| "TASK_TIMED_OUT" \| "TASK_DELETED" \| "TASK_EXPIRED" \| "TASK_RECOVERY_REQUESTED"; taskId: string; ... }` | 任务事件类型 |
| `TaskEventHandler` | 类型 | `(event: TaskEvent) => void` | 任务事件处理器 |

#### task-management/domain/task-machine.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskMachine` | 常量 | `{ canTransition(from, to): boolean; isPollable(status): boolean; isTerminal(status): boolean; isRecoverable(status): boolean; transition(task, targetStatus, context?): Result<VideoTask, TransitionError>; applySideEffects(task, targetStatus, context?): Partial<VideoTask> }` | 任务状态机（管理状态转换规则和副作用） |
| `TransitionError` | 类 | `class TransitionError extends AppError { constructor(from: VideoTaskStatus, to: VideoTaskStatus) }` | 非法状态转换错误 |
| `VALID_TRANSITIONS` | 常量 | `Record<VideoTaskStatus, VideoTaskStatus[]>` | 合法状态转换映射表 |
| `TERMINAL_STATUSES` | 常量 | `VideoTaskStatus[]` | 终态状态列表 |
| `STUCK_TASK_THRESHOLD_MS` | 常量 | `number`（30分钟） | 卡住任务阈值（毫秒） |
| `isValidTransition` | 函数 | `(from: VideoTaskStatus, to: VideoTaskStatus) => boolean` | 检查状态转换是否合法 |
| `isStuck` | 函数 | `(task: VideoTask, nowMs?: number) => boolean` | 检查任务是否卡住 |

#### task-management/domain/task-schema.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `pollResultSchema` | 常量 | `z.ZodObject<...>` | 轮询结果 Zod Schema |
| `PollResult` | 类型 | `z.infer<typeof pollResultSchema>` | 轮询结果类型 |
| `mapApiStatus` | 函数 | `(apiStatus: string, videoUrl?: string) => "pending" \| "generating" \| "completed" \| "failed"` | 将 API 状态映射为内部状态 |

#### task-management/hooks/internals/polling-constants.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `MAX_POLL_COUNT` | 常量 | `number`（1000） | 最大轮询次数 |
| `MAX_POLL_DURATION` | 常量 | `number`（120分钟） | 最大轮询持续时间（毫秒） |
| `MAX_POLL_FAILURES` | 常量 | `number`（30） | 最大连续轮询失败次数 |

#### task-management/hooks/internals/polling-engine.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `registerStore` | 函数 | `(store: StoreAccessor) => void` | 注册 Zustand Store 到轮询引擎 |
| `getStore` | 函数 | `() => StoreAccessor` | 获取已注册的 Store |
| `PollingState` | 接口 | `{ pollingTimeoutId: ...; syncTimeoutId: ...; recoveryIntervalId: ...; cacheCleanupIntervalId: ...; isPolling: boolean; isSyncing: boolean; isInitializing: boolean; ... }` | 轮询引擎状态 |
| `pollingState` | 常量 | `PollingState` | 轮询引擎全局状态 |
| `checkAndStartOrStopPolling` | 函数 | `() => void` | 检查并启动/停止轮询 |
| `schedulePolling` | 函数 | `() => void` | 调度下一次轮询 |
| `stopPolling` | 函数 | `() => void` | 停止轮询 |
| `cleanupAllPollingResources` | 函数 | `() => void` | 清理所有轮询资源 |

#### task-management/hooks/internals/polling-task-handler.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `handleTimedOutTasks` | 函数 | `(tasks: VideoTask[], signal: AbortSignal, storeAccessor: ...) => Promise<void>` | 处理超时任务 |
| `pollActiveTasks` | 函数 | `(tasks: VideoTask[], signal: AbortSignal, storeAccessor: ...) => Promise<PollResult>` | 轮询活跃任务 |
| `cacheCompletedVideos` | 函数 | `(tasks: VideoTask[], pollResult: PollResult) => Promise<void>` | 缓存已完成视频 |
| `PollResult` | 接口 | `{ taskUpdates: Map<string, Partial<VideoTask>>; cacheTasks: Array<{ taskId: string; videoUrl: string }>; hasError: boolean; hasSuccess: boolean }` | 轮询结果 |

#### task-management/hooks/internals/sync-engine.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `registerSyncStore` | 函数 | `(store: SyncStoreAccessor) => void` | 注册同步 Store |
| `scheduleSync` | 函数 | `() => void` | 调度同步（防抖2秒） |

#### task-management/hooks/internals/task-initializer.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `loadTasksFromStorage` | 函数 | `(store: StoreAccessor) => () => Promise<void>` | 从持久化存储加载任务 |
| `setupRecoveredEventListener` | 函数 | `(store: StoreAccessor) => void` | 设置恢复事件监听器 |
| `setupBackgroundRecoveryInterval` | 函数 | `() => void` | 设置后台恢复定时器（60秒间隔） |
| `setupCacheCleanupInterval` | 函数 | `() => void` | 设置缓存清理定时器（30分钟间隔） |
| `setupBeforeUnloadHandler` | 函数 | `(store: StoreAccessor) => void` | 设置页面卸载前同步保存处理器 |

#### task-management/hooks/internals/task-removal.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `removeTaskFromStorageAndCache` | 函数 | `(taskId: string) => Promise<void>` | 从存储和缓存中移除单个任务 |
| `removeTasksFromStorageAndCache` | 函数 | `(taskIds: string[]) => Promise<void>` | 从存储和缓存中批量移除任务 |
| `removeTaskWithErrorHandling` | 函数 | `(taskId: string) => Promise<void>` | 带错误处理的移除任务 |
| `removeTasksWithErrorHandling` | 函数 | `(taskIds: string[]) => Promise<void>` | 带错误处理的批量移除任务 |
| `clearCacheForTasks` | 函数 | `(taskIds: string[]) => Promise<void>` | 清除指定任务的缓存 |
| `filterTasksByStatus` | 函数 | `(tasks: VideoTask[], statuses: VideoTask["status"][]) => VideoTask[]` | 按状态筛选任务 |
| `excludeTasksByStatus` | 函数 | `(tasks: VideoTask[], statuses: VideoTask["status"][]) => VideoTask[]` | 按状态排除任务 |
| `excludeTasksByIds` | 函数 | `(tasks: VideoTask[], ids: string[]) => VideoTask[]` | 按 ID 排除任务 |

#### task-management/hooks/internals/transition-guard.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `withTransitionGuard` | 函数 | `(task: VideoTask, targetStatus: VideoTaskStatus, updates: Partial<VideoTask>) => Partial<VideoTask>` | 状态转换守卫（验证转换合法性，开发环境抛出错误） |

#### task-management/hooks/use-video-task-commands.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTaskCommands` | Hook | `() => VideoTaskCommands` | 视频任务命令 Hook（CQRS 写操作） |
| `VideoTaskCommands` | 接口 | `{ addTask; removeTask; removeTasks; removeTasksByBeatId; removeTasksByStoryId; clearActiveTasks; clearAllTasks; clearCompletedTasks; clearFailedTasks; createTask; cancelTask; recoverTask; startBackgroundProcessing }` | 视频任务命令接口 |

#### task-management/hooks/use-video-task-manager.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTaskStore` | 常量 | `ZustandStore<VideoTaskManagerState>` | 视频任务 Zustand Store |
| `useVideoTaskManager` | Hook | `() => { tasks: VideoTask[]; allTasks: VideoTask[]; isGenerating: boolean; activeTaskId: string \| null; activeTasks: VideoTask[]; hasActiveTasks: boolean; ...stableActions; isBackgroundProcessing: boolean }` | 视频任务管理器统一 Hook（stableActions 模式） |
| `VideoTaskManagerState` | 接口 | `{ allTasks; isBackgroundProcessing; isInitialized; isCreating; initError; initialize; setAllTasks; addTask; removeTask; ... }` | Store 状态接口 |

#### task-management/hooks/use-video-task-polling.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTaskPolling` | Hook | `() => VideoTaskPolling` | 视频任务轮询 Hook（CQRS 轮询操作） |
| `VideoTaskPolling` | 接口 | `{ initialize: () => void; pollTask: (taskId: string) => Promise<void>; cleanup: () => void }` | 轮询接口 |

#### task-management/hooks/use-video-task-queries.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTaskQueries` | Hook | `() => VideoTaskQueries` | 视频任务查询 Hook（CQRS 读操作） |
| `VideoTaskQueries` | 接口 | `{ allTasks: VideoTask[]; activeTasks: VideoTask[]; completedTasks: VideoTask[]; failedTasks: VideoTask[]; hasActiveTasks: boolean; activeTaskId: string \| null; taskCount: number; isBackgroundProcessing: boolean; isInitialized: boolean; isCreating: boolean; initError: string \| null }` | 查询接口 |

#### task-management/hooks/use-video-tasks.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTasks` | Hook | `() => UseQueryResult<VideoTask[]>` | 视频任务列表查询 Hook（React Query） |
| `useFailedVideoTasks` | Hook | `() => UseQueryResult<VideoTask[]>` | 失败任务查询 Hook |
| `useRecoverVideo` | Hook | `() => UseMutationResult<...>` | 视频恢复 Mutation Hook |
| `useCleanExpiredTasks` | Hook | `() => UseMutationResult<...>` | 清理过期任务 Mutation Hook |
| `useStartBackgroundRecovery` | Hook | `() => UseMutationResult<...>` | 启动后台恢复 Mutation Hook |

#### task-management/hooks/use-video-task-state.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTaskState` | 常量 | `ZustandStore<VideoTaskStateStore>` | 视频任务纯状态 Store（无副作用） |
| `VideoTaskState` | 接口 | `{ allTasks: VideoTask[]; isBackgroundProcessing: boolean; isInitialized: boolean; isCreating: boolean; initError: string \| null }` | 状态接口 |
| `VideoTaskStateActions` | 接口 | `{ setAllTasks; updateTask; addTaskToState; removeTaskFromState; removeTasksFromState; setIsCreating; setIsBackgroundProcessing; setInitialized; resetState }` | 状态操作接口 |
| `VideoTaskStateStore` | 类型 | `VideoTaskState & VideoTaskStateActions` | 状态 Store 完整类型 |

#### task-management/presentation/BulkDeleteDialog.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `BulkDeleteDialog` | 组件 | `(props: { open: boolean; onOpenChange: (open: boolean) => void; selectedTaskIds: Set<string>; filteredTasks: VideoTask[]; isDeleting: boolean; onConfirm: () => void }) => JSX.Element` | 批量删除确认对话框 |

#### task-management/presentation/handlers/use-cache-operations.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useCacheOperations` | Hook | `(params: { completedTaskIds: string[] }) => { cacheStates: Map<string, { exists: boolean; fileSizeMB?: number }>; cacheStats: { count: number; totalSizeMB: number } \| null; deleteConfirmOpen: boolean; ... }` | 缓存操作 Hook（查看/删除缓存） |

#### task-management/presentation/handlers/use-task-selection.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useTaskSelection` | Hook | `(params: { filteredTasks: VideoTask[]; removeTasks?: (taskIds: string[]) => Promise<void>; onAfterDelete?: () => Promise<void> }) => { selectedTaskIds: Set<string>; bulkDeleteConfirmOpen: boolean; ... }` | 任务选择 Hook（多选/全选/批量删除） |

#### task-management/presentation/handlers/video-task-handlers.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoTaskHandlers` | Hook | `(deps: UseVideoTaskHandlersDeps) => { ...handlerStates; ...cacheOps; ...selection; ... }` | 视频任务处理器 Hook（整合轮询/恢复/预览/删除等操作） |

#### task-management/presentation/RecoverySection.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `RecoverySection` | 组件 | `(props: { recoveryTaskId: string; onRecoveryTaskIdChange: (value: string) => void; onRecover: () => void; isRecovering: boolean }) => JSX.Element` | 视频恢复区域组件 |

#### task-management/presentation/TaskCard.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskCard` | 组件 | `(props: { task: VideoTask; index: number; isSelected: boolean; onToggleSelection: (taskId: string) => void; onOpenPreview: (task: VideoTask) => void; onOpenDetail: (task: VideoTask) => void; onDownloadVideo: (task: VideoTask) => void; onDeleteCache: (task: VideoTask) => void }) => JSX.Element` | 任务卡片组件 |

#### task-management/presentation/task-card/task-actions.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskActions` | 组件 | `(props: { task: VideoTask; onCopyTaskId: (taskId: string) => void; onManualPoll: (task: VideoTask) => void; onRetryTask: (task: VideoTask) => void; onCancelTask: (task: VideoTask) => void; onOpenTracking: (task: VideoTask) => void; onCopyTracking: (task: VideoTask) => void; onOpenCloudLink: (task: VideoTask) => void; pollingTaskId: string \| null; retryingTaskId: string \| null; cancellingTaskId: string \| null; pollTask?: (taskId: string) => Promise<void> }) => JSX.Element` | 任务操作按钮组组件 |

#### task-management/presentation/task-card/video-preview.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `VideoPreview` | 组件 | `(props: { task: VideoTask; onOpenPreview: (task: VideoTask) => void; onOpenDetail: (task: VideoTask) => void; onDownloadVideo: (task: VideoTask) => void; onDeleteCache: (task: VideoTask) => void; cacheState?: { exists: boolean; fileSizeMB?: number } }) => JSX.Element` | 视频预览缩略图组件 |

#### task-management/presentation/TaskDetailDialog.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskDetailDialog` | 组件 | `(props: { open: boolean; onOpenChange: (open: boolean) => void; task: VideoTask \| null; onOpenPreview: (task: VideoTask) => void; onDownloadVideo: (task: VideoTask) => void; onJumpToBeat: (task: VideoTask) => void; onRetryTask: (task: VideoTask) => void }) => JSX.Element` | 任务详情对话框 |

#### task-management/presentation/TaskFilterBar.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskFilterBar` | 组件 | `(props: { searchQuery: string; onSearchChange: (value: string) => void; statusFilter: FilterStatus; onStatusFilterChange: (value: FilterStatus) => void; timeRange: TimeRange; onTimeRangeChange: (value: TimeRange) => void; groupBy: GroupBy; onGroupByChange: (value: GroupBy) => void; sortField: SortField; onSortFieldChange: (value: SortField) => void; sortDesc: boolean; onSortDescChange: (value: boolean) => void }) => JSX.Element` | 任务筛选栏组件 |

#### task-management/presentation/task-status-helpers.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `getStatusIcon` | 函数 | `(status: VideoTaskStatus) => JSX.Element` | 获取状态图标 |
| `getStatusColor` | 函数 | `(status: VideoTaskStatus) => string` | 获取状态颜色 CSS 类 |
| `getStatusLabel` | 函数 | `(status: VideoTaskStatus) => string` | 获取状态中文标签 |

#### task-management/presentation/TaskTrackingDialog.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskTrackingDialog` | 组件 | `(props: { open: boolean; onOpenChange: (open: boolean) => void; task: VideoTask \| null; onToastSuccess: (title: string, message: string) => void; onToastError: (title: string, message: string) => void }) => JSX.Element` | 任务追踪信息对话框 |

#### task-management/presentation/use-task-filter.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useTaskFilter` | Hook | `(tasks: VideoTask[]) => { filteredTasks: VideoTask[]; groupedTasks: Record<string, VideoTask[]>; statusFilter: FilterStatus; setStatusFilter; sortField: SortField; setSortField; sortDesc: boolean; setSortDesc; groupBy: GroupBy; setGroupBy; timeRange: TimeRange; setTimeRange; searchQuery: string; setSearchQuery; collapsedGroups: Set<string>; toggleGroupCollapse }` | 任务筛选/排序/分组 Hook |
| `FilterStatus` | 类型 | `"all" \| "pending" \| "generating" \| "completed" \| "failed" \| "timeout"` | 筛选状态类型 |
| `SortField` | 类型 | `"createdAt" \| "updatedAt" \| "status" \| "progress"` | 排序字段类型 |
| `GroupBy` | 类型 | `"none" \| "status" \| "date" \| "story" \| "model"` | 分组方式类型 |
| `TimeRange` | 类型 | `"all" \| "today" \| "week" \| "month"` | 时间范围类型 |

#### task-management/presentation/use-video-preview.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `useVideoPreview` | Hook | `() => { previewDialogOpen: boolean; setPreviewDialogOpen; previewTask: VideoTask \| null; setPreviewTask; cachedVideoUrl: string \| null; setCachedVideoUrl; videoLoadError: boolean; setVideoLoadError; videoLoading: boolean; openPreview: (task: VideoTask) => Promise<void>; closePreview: () => void }` | 视频预览 Hook（管理预览对话框和缓存 URL） |

#### task-management/presentation/VideoPreviewDialog.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `VideoPreviewDialog` | 组件 | `(props: { open: boolean; onOpenChange: (open: boolean) => void; task: VideoTask \| null; cachedVideoUrl: string \| null; videoLoadError: boolean; videoLoading: boolean; onSetVideoLoadError: (error: boolean) => void; onDownloadVideo: (task: VideoTask) => void }) => JSX.Element` | 视频预览对话框组件 |

#### task-management/presentation/video-task-manager-ui/task-card.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskCard` | 组件 | `(props: TaskCardProps) => JSX.Element` | 视频任务管理器 UI 中的任务卡片（独立版本） |

#### task-management/presentation/video-task-manager-ui/task-detail-dialog.tsx

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `TaskDetailDialog` | 组件 | `(props: { task: VideoTask; isOpen: boolean; onClose: () => void; onRecover: () => void; onRemove: () => void }) => JSX.Element` | 视频任务管理器 UI 中的详情对话框（独立版本） |

#### utils/video-templates.ts

| 导出名 | 类型 | 签名 | 说明 |
|--------|------|------|------|
| `VideoTemplate` | 接口 | `{ id: string; name: string; description: string; category: string; prompt: string; style: string; duration: number; imageDescription?: string }` | 视频模板接口 |
| `videoTemplates` | 常量 | `VideoTemplate[]` | 预设视频模板列表 |
| `templateCategories` | 常量 | `{ id: string; name: string }[]` | 模板分类列表 |
| `getTemplatesByCategory` | 函数 | `(category: string) => VideoTemplate[]` | 按分类获取模板 |
| `applyVideoTemplate` | 函数 | `(template: VideoTemplate) => { prompt: string; duration: number; style: string }` | 应用视频模板 |
