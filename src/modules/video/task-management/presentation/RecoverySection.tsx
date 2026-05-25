import React from "react";
import { Input } from "@/shared/ui/input";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Search, Loader2 } from "lucide-react";

interface RecoverySectionProps {
  recoveryTaskId: string;
  onRecoveryTaskIdChange: (value: string) => void;
  onRecover: () => void;
  isRecovering: boolean;
}

export function RecoverySection({
  recoveryTaskId,
  onRecoveryTaskIdChange,
  onRecover,
  isRecovering,
}: RecoverySectionProps) {
  return (
    <div className="space-y-3 border-t border-gray-200 dark:border-gray-800 pt-4">
      <Label className="text-sm font-medium">找回失败视频</Label>
      <div className="flex gap-2">
        <Input
          placeholder="输入任务ID"
          value={recoveryTaskId}
          onChange={(e) => onRecoveryTaskIdChange(e.target.value)}
          className="flex-1"
        />
        <Button
          onClick={onRecover}
          disabled={isRecovering}
          className="gap-2"
        >
          {isRecovering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          找回
        </Button>
      </div>
      <p className="text-xs text-gray-500">
        输入任务ID后，系统将查询云端真实状态并尝试找回视频
      </p>
    </div>
  );
}
