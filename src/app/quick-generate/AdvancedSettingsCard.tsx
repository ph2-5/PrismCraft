import { Settings, ChevronDown, ChevronUp, X, Film, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Switch } from "@/shared/ui/switch";
import { Label } from "@/shared/ui/label";
import { createSimpleVideoErrorHandler } from "@/shared/utils/media-error-handler";

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

export function AdvancedSettingsCard({
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
}: AdvancedSettingsCardProps) {
  return (
    <Card className="border border-slate-800 bg-slate-900/60">
      <CardHeader
        className="cursor-pointer"
        onClick={onToggleAdvanced}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-400" />
            高级设置
          </CardTitle>
          {showAdvanced ? (
            <ChevronUp className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-500" />
          )}
        </div>
      </CardHeader>
      {showAdvanced && (
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-slate-300">智能优化</Label>
              <p className="text-sm text-slate-500">
                自动优化提示词、画面构图和节奏控制
              </p>
            </div>
            <Switch
              checked={enableSmartOptimization}
              onCheckedChange={onSmartOptimizationChange}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">负面提示词</Label>
            <Textarea
              value={negativePrompt}
              onChange={(e) => onNegativePromptChange(e.target.value)}
              placeholder="输入不希望出现的内容，例如：恐怖画面、血腥场景..."
              className="bg-slate-800 border-slate-700 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300">参考图片</Label>
            {referenceImage ? (
              <div className="relative inline-block">
                <img
                  src={referenceImage}
                  alt="参考"
                  className="w-32 h-32 rounded-lg object-cover border border-slate-700"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 w-6 h-6 p-0 rounded-full"
                  onClick={() => onReferenceImageChange(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-500 text-sm mb-2">
                  点击上传参考图片
                </p>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="ref-image-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        onReferenceImageChange(
                          event.target?.result as string,
                        );
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    document.getElementById("ref-image-upload")?.click()
                  }
                >
                  选择图片
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-slate-300 flex items-center gap-2">
              <Film className="w-4 h-4" />
              参考视频（可选）
            </Label>
            {referenceVideo ? (
              <div className="relative">
                <video
                  src={referenceVideo}
                  controls
                  className="w-full max-h-48 rounded-lg border border-slate-700"
                  onError={createSimpleVideoErrorHandler()}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-slate-400">
                    {referenceVideoName}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onRemoveReferenceVideo}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-500 text-sm mb-2">
                  上传参考视频，让AI学习动作和风格
                </p>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  id="ref-video-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadReferenceVideo(file);
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    document.getElementById("ref-video-upload")?.click()
                  }
                >
                  <Film className="w-4 h-4 mr-2" />
                  选择视频
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
