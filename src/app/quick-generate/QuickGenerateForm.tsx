import {
  Sparkles,
  User,
  Wand2,
  RefreshCw,
  CheckCircle2,
  Plus,
  LayoutTemplate,
  Image,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Label } from "@/shared/ui/label";
import {
  getDurationOptionsForModel,
  getResolutionOptionsForModel,
  getStyleOptionsForModel,
} from "@/modules/prompt";
import { ModelSelector } from "@/modules/prompt";
import type { Character, Scene, ModelSelection } from "@/domain/schemas";
import { AdvancedSettingsCard } from "./AdvancedSettingsCard";

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

export function QuickGenerateForm({
  promptText,
  onPromptTextChange,
  duration,
  onDurationChange,
  selectedStyle,
  onSelectedStyleChange,
  selectedResolution,
  onSelectedResolutionChange,
  selectedVideoModel,
  onSelectedVideoModelChange,
  selectedCharacters,
  onToggleCharacter,
  selectedScene,
  onToggleScene,
  showAdvanced,
  onToggleAdvanced,
  enableSmartOptimization,
  onSmartOptimizationChange,
  negativePrompt,
  onNegativePromptChange,
  referenceImage,
  onReferenceImageChange,
  referenceVideo,
  referenceVideoName,
  onUploadReferenceVideo,
  onRemoveReferenceVideo,
  isGenerating,
  onGenerate,
  generatedPrompt,
  onOpenTemplateDialog,
  characters,
  charactersLoading,
  scenes,
  scenesLoading,
  guardedPush,
  quickExamples,
}: QuickGenerateFormProps) {
  return (
    <div className="lg:col-span-2 space-y-6">
      <Card className="border-2 border-purple-800/30 bg-slate-900/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                描述你的视频
              </CardTitle>
              <CardDescription>
                输入视频的核心内容，越详细效果越好
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={onOpenTemplateDialog}
              className="gap-2 border-purple-700 hover:bg-purple-900/20 text-purple-200"
            >
              <LayoutTemplate className="w-4 h-4" />
              选择模板
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={promptText}
            onChange={(e) => onPromptTextChange(e.target.value)}
            placeholder="例如：一只白色猫咪在海边沙滩上奔跑，日落暖光，治愈电影感..."
            className="min-h-32 text-base resize-y bg-slate-800 border-slate-700 focus:border-purple-500"
          />
          <p className="text-sm text-slate-500">
            提示：可以包含剧情、角色动作、画面风格、氛围描述
          </p>

          <div className="pt-4">
            <Label className="text-sm text-slate-400 mb-2 block">
              快速尝试：
            </Label>
            <div className="flex flex-wrap gap-2">
              {quickExamples.map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  className="text-xs border-slate-700 hover:border-purple-600 hover:bg-purple-900/20 text-slate-300"
                  onClick={() => onPromptTextChange(example)}
                >
                  {example.slice(0, 20)}...
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-slate-800 bg-slate-900/60">
        <CardHeader>
          <CardTitle className="text-lg">配置视频参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-300">视频模型</Label>
            <ModelSelector
              capability="video"
              value={selectedVideoModel}
              onChange={onSelectedVideoModelChange}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-slate-300">视频时长</Label>
            <div className="flex flex-wrap gap-2">
              {getDurationOptionsForModel(selectedVideoModel?.modelId).map((opt) => (
                <Button
                  key={opt.value}
                  variant={duration === opt.value ? "default" : "outline"}
                  size="sm"
                  className={`
                    ${
                      duration === opt.value
                        ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-600"
                        : "border-slate-700 hover:border-purple-500 text-slate-300"
                    }
                  `}
                  onClick={() => onDurationChange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">画面风格</Label>
            <div className="flex flex-wrap gap-2">
              {getStyleOptionsForModel(selectedVideoModel?.modelId).map((style) => (
                <Button
                  key={style.value}
                  variant={
                    selectedStyle === style.value ? "default" : "outline"
                  }
                  size="sm"
                  className={`
                    ${
                      selectedStyle === style.value
                        ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                        : "border-slate-700 hover:border-purple-500 text-slate-300"
                    }
                  `}
                  onClick={() => onSelectedStyleChange(style.value)}
                >
                  {style.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">分辨率</Label>
            <Select
              value={selectedResolution}
              onValueChange={(v) => {
                if (v)
                  onSelectedResolutionChange(v);
              }}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {getResolutionOptionsForModel(selectedVideoModel?.modelId).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4" />
              锁定主角（可选）
            </Label>
            {charactersLoading ? (
              <div className="flex items-center gap-2 p-3">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">加载角色中...</span>
              </div>
            ) : characters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {characters.map((char) => (
                  <button
                    key={char.id}
                    onClick={() => onToggleCharacter(char.id)}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg border-2 transition-all
                      ${
                        selectedCharacters.includes(char.id)
                          ? "border-purple-500 bg-purple-900/40"
                          : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                      }
                    `}
                  >
                    {char.generatedImage && (
                      <img
                        src={char.generatedImage}
                        alt={char.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <span className="text-sm text-slate-300">
                      {char.name}
                    </span>
                    {selectedCharacters.includes(char.id) && (
                      <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    )}
                  </button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dashed border-slate-600"
                  onClick={() => guardedPush("/characters")}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  新建角色
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-dashed border-slate-600 w-full"
                onClick={() => guardedPush("/characters")}
              >
                <Plus className="w-4 h-4 mr-1" />
                创建角色以锁定主角形象
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <Image className="w-4 h-4" />
              锁定场景（可选）
            </Label>
            {scenesLoading ? (
              <div className="flex items-center gap-2 p-3">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">加载场景中...</span>
              </div>
            ) : scenes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => onToggleScene(scene.id)}
                    className={`
                      flex items-center gap-2 p-2 rounded-lg border-2 transition-all
                      ${
                        selectedScene === scene.id
                          ? "border-blue-500 bg-blue-900/40"
                          : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                      }
                    `}
                  >
                    {scene.generatedImage && (
                      <img
                        src={scene.generatedImage}
                        alt={scene.name}
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <span className="text-sm text-slate-300">
                      {scene.name}
                    </span>
                    {selectedScene === scene.id && (
                      <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    )}
                  </button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dashed border-slate-600"
                  onClick={() => guardedPush("/scenes")}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  新建场景
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-dashed border-slate-600 w-full"
                onClick={() => guardedPush("/scenes")}
              >
                <Plus className="w-4 h-4 mr-1" />
                创建场景以锁定背景环境
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AdvancedSettingsCard
        showAdvanced={showAdvanced}
        onToggleAdvanced={onToggleAdvanced}
        enableSmartOptimization={enableSmartOptimization}
        onSmartOptimizationChange={onSmartOptimizationChange}
        negativePrompt={negativePrompt}
        onNegativePromptChange={onNegativePromptChange}
        referenceImage={referenceImage}
        onReferenceImageChange={onReferenceImageChange}
        referenceVideo={referenceVideo}
        referenceVideoName={referenceVideoName}
        onUploadReferenceVideo={onUploadReferenceVideo}
        onRemoveReferenceVideo={onRemoveReferenceVideo}
      />

      <Button
        size="lg"
        className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 shadow-xl shadow-purple-900/30"
        onClick={onGenerate}
        disabled={isGenerating || !promptText.trim()}
      >
        {isGenerating ? (
          <>
            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
            正在生成视频...
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5 mr-2" />
            立即生成视频
          </>
        )}
      </Button>

      {generatedPrompt && (
        <Card className="border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-300">
              实际发送的提示词
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {generatedPrompt}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
